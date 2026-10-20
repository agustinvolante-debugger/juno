// All of a user's calendars as one (20 Oct). Up to five: the Settings → Google connection
// (pen_gcal, lib/pen/google-calendar.ts, unchanged: nobody has to reconnect) plus every connected
// Google address with its calendar on (pen_gmail.scopes, lib/pen/gmail.ts). Both sources are read
// live each time; nothing is migrated or copied, so there is no data to lose.
//
//   · Reading (briefs, the morning brief, meeting prep, "what's on tomorrow?", find a meeting):
//     every calendar, merged, the same meeting on two calendars once (calendar-merge.ts).
//   · Writing: ONE default calendar for new events (profile.calendarDefault; else the Settings →
//     Google one, which is what Juno used before; else the oldest). "Add it to my work calendar"
//     names another (pickCalendar).
//   · An event the model acts on carries its calendar in its ref ("<id>|<address>"); a bare id
//     (offers, older turns) means the default calendar.
//
// The same Google account connected both ways (Settings → Google and Settings → Email) is ONE
// calendar: the Settings → Google token is used for it.
//
// Outlook (21 Oct, lib/pen/outlook.ts + outlook-calendar.ts): a connected Microsoft address with
// its calendar on is one more calendar here (src kind 'outlook'), read and written through Graph
// with the same shapes. The 5-calendar limit counts Google and Microsoft together. A video link on
// an Outlook calendar is Teams (or none on personal calendars that can't: videoUnavailable).

import { supabaseAdmin } from '@/lib/supabase'
import type { CalEvent } from './calendar'
import { addAttendee, addMeet, createEvent, deleteEvent, eventsInRange, getEvent, getGcalConnection, hasCalendar, moveEvent, upcomingEvents, READ_DAYS, type Attendee, type CalSrc, type CreatedEvent, type UpcomingEvent } from './google-calendar'
import { chooseDefault, eventRef, mergeEvents, parseEventRef, pickCalendar, type CalInfo } from './calendar-merge'
import { cleanProfile, getProfileRaw } from './profile'
import { outlookAddAttendee, outlookAddVideo, outlookCreate, outlookDelete, outlookGet, outlookMove, outlookRange, outlookUpcoming } from './outlook-calendar'

export { eventRef, parseEventRef, pickCalendar, type CalInfo } from './calendar-merge'

export type Calendar = CalInfo & { src: CalSrc }
const MAX = 5

/** Every connected calendar, the Settings → Google one first, then addresses oldest first. */
export async function listCalendars(email: string): Promise<Calendar[]> {
  const lower = email.toLowerCase()
  const out: Calendar[] = []
  const g = await getGcalConnection(lower).catch(() => null)
  if (g && hasCalendar(g.scope)) out.push({ key: g.calendar_email?.toLowerCase() ?? 'gcal', address: g.calendar_email?.toLowerCase() ?? null, via: 'google', broken: Boolean(g.last_error), src: { kind: 'gcal' } })
  const { gmailAvailable, listGoogleAccounts } = await import('./gmail')
  if (await gmailAvailable().catch(() => false)) {
    for (const a of await listGoogleAccounts(lower).catch(() => [])) {
      if (!a.can_cal || out.some((c) => c.key === a.address)) continue
      out.push({ key: a.address, address: a.address, via: 'email', broken: Boolean(a.last_error), src: { kind: 'gmail', address: a.address } })
    }
  }
  const { outlookAvailable, listOutlookAccounts } = await import('./outlook')
  if (await outlookAvailable().catch(() => false)) {
    for (const a of await listOutlookAccounts(lower).catch(() => [])) {
      if (!a.can_cal || out.some((c) => c.key === a.address)) continue
      out.push({ key: a.address, address: a.address, via: 'outlook', broken: Boolean(a.last_error), src: { kind: 'outlook', address: a.address } })
    }
  }
  return out.slice(0, MAX)
}

/** At least one calendar is connected and working. */
export async function anyCalendar(email: string): Promise<boolean> {
  return (await listCalendars(email).catch((): Calendar[] => [])).some((c) => !c.broken)
}

/** The calendar new events go on (null when none is connected). */
export async function defaultCalendar(email: string, cals?: Calendar[]): Promise<Calendar | null> {
  const list = cals ?? (await listCalendars(email).catch((): Calendar[] => []))
  const saved = (await getProfileRaw(email).catch(() => null))?.calendarDefault ?? null
  return (chooseDefault(list, saved) as Calendar | null) ?? null
}

/** Settings / "make my work calendar the default". False when that calendar isn't connected. */
export async function setDefaultCalendar(email: string, key: string): Promise<boolean> {
  const k = key.toLowerCase()
  if (!(await listCalendars(email)).some((c) => c.key === k)) return false
  const cur = (await getProfileRaw(email).catch(() => null)) ?? {}
  const { error } = await supabaseAdmin
    .from('pen_profiles')
    .upsert({ user_email: email.toLowerCase(), profile: cleanProfile({ ...cur, calendarDefault: k }), updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
  if (error) throw new Error(error.message)
  return true
}

/** The calendar a ref or the user's words name; else the default. */
export async function resolveCalendar(email: string, o: { ref?: string | null; said?: string | null } = {}): Promise<{ cal: Calendar | null; id: string | null; error?: string; calendars: Calendar[] }> {
  const calendars = await listCalendars(email).catch((): Calendar[] => [])
  const parsed = o.ref ? parseEventRef(o.ref) : null
  if (parsed?.cal) {
    const cal = calendars.find((c) => c.key === parsed.cal) ?? null
    return cal ? { cal, id: parsed.id, calendars } : { cal: null, id: parsed.id, error: 'that calendar is not connected any more', calendars }
  }
  if (o.said?.trim()) {
    const cal = pickCalendar(calendars, o.said) as Calendar | null
    if (!cal) return { cal: null, id: parsed?.id ?? null, error: `no connected calendar matches "${o.said.trim()}"`, calendars }
    return { cal, id: parsed?.id ?? null, calendars }
  }
  return { cal: await defaultCalendar(email, calendars), id: parsed?.id ?? null, calendars }
}

const tag = (cal: Calendar) => (e: UpcomingEvent): UpcomingEvent => ({ ...e, cal: cal.key })

async function readAll(email: string, read: (src: CalSrc) => Promise<UpcomingEvent[]>, cals?: Calendar[]): Promise<{ events: UpcomingEvent[]; read: string[]; failed: string[] }> {
  const list = (cals ?? (await listCalendars(email).catch((): Calendar[] => []))).filter((c) => !c.broken)
  const def = await defaultCalendar(email, list)
  const failed: string[] = []
  const lists = await Promise.all(
    list.map((c) =>
      read(c.src).then((evs) => evs.map(tag(c)), (e) => {
        console.warn(`pen calendars: ${c.key} for ${email}: ${(e as Error).message}`)
        failed.push(c.key)
        return [] as UpcomingEvent[]
      }),
    ),
  )
  return { events: mergeEvents(lists, def?.key ?? null), read: list.map((c) => c.key).filter((k) => !failed.includes(k)), failed }
}

/** Every calendar's events from now to `days` ahead (≤ READ_DAYS), merged. For briefs. */
export async function upcomingAll(email: string, days = READ_DAYS, now = new Date()): Promise<UpcomingEvent[]> {
  return (await readAll(email, (src) => (src.kind === 'outlook' ? outlookUpcoming(email, src.address, days, now) : upcomingEvents(email, days, now, src)))).events
}

/** Every calendar's events in [from, to), merged (optionally Google's free-text q on each). */
export async function eventsBetween(email: string, from: Date, to: Date, q?: string): Promise<{ events: UpcomingEvent[]; read: string[]; failed: string[] }> {
  return readAll(email, (src) => (src.kind === 'outlook' ? outlookRange(email, src.address, from, to, { q }) : eventsInRange(email, from, to, { q }, src)))
}

/** One event by ref, from the calendar the ref names (bare id: the default). */
export async function getEventByRef(email: string, ref: string): Promise<{ event: UpcomingEvent; cal: Calendar } | null> {
  const r = await resolveCalendar(email, { ref })
  if (!r.cal || !r.id) return null
  const src = r.cal.src
  const e = src.kind === 'outlook' ? await outlookGet(email, src.address, r.id) : await getEvent(email, r.id, src)
  return e ? { event: { ...e, cal: r.cal.key }, cal: r.cal } : null
}

export async function deleteByRef(email: string, ref: string): Promise<void> {
  const r = await resolveCalendar(email, { ref })
  if (!r.cal || !r.id) throw new Error(r.error ?? 'no calendar is connected')
  const src = r.cal.src
  if (src.kind === 'outlook') await outlookDelete(email, src.address, r.id)
  else await deleteEvent(email, r.id, src)
}

export async function moveByRef(email: string, ref: string, startIso: string, tz: string, durationMin?: number): Promise<CreatedEvent & { ref: string }> {
  const r = await resolveCalendar(email, { ref })
  if (!r.cal || !r.id) throw new Error(r.error ?? 'no calendar is connected')
  const src = r.cal.src
  const e = src.kind === 'outlook' ? await outlookMove(email, src.address, r.id, startIso, durationMin) : await moveEvent(email, r.id, startIso, tz, durationMin, src)
  return { ...e, ref: eventRef(e.id, r.cal.key) }
}

export async function addMeetByRef(email: string, ref: string): Promise<CreatedEvent> {
  const r = await resolveCalendar(email, { ref })
  if (!r.cal || !r.id) throw new Error(r.error ?? 'no calendar is connected')
  const src = r.cal.src
  return src.kind === 'outlook' ? outlookAddVideo(email, src.address, r.id) : addMeet(email, r.id, src)
}

export async function addAttendeeByRef(email: string, ref: string, who: Attendee): Promise<CreatedEvent & { ref: string }> {
  const r = await resolveCalendar(email, { ref })
  if (!r.cal || !r.id) throw new Error(r.error ?? 'no calendar is connected')
  const src = r.cal.src
  const e = src.kind === 'outlook' ? await outlookAddAttendee(email, src.address, r.id, who) : await addAttendee(email, r.id, who, src)
  return { ...e, ref: eventRef(e.id, r.cal.key) }
}

/** A new event on the calendar the user named (`said`), else the default. Throws when none is connected. */
export async function createOn(email: string, ev: CalEvent, o: { attendees?: Attendee[]; meet?: boolean; ref?: string } = {}, said?: string | null): Promise<CreatedEvent & { ref: string; calendar: string; calendarAddress: string | null; provider: CalProvider }> {
  const r = await resolveCalendar(email, { said })
  if (!r.cal) throw new Error(r.error ?? 'no calendar is connected')
  const src = r.cal.src
  const e = src.kind === 'outlook' ? await outlookCreate(email, src.address, ev, o) : await createEvent(email, ev, o, src)
  return { ...e, ref: eventRef(e.id, r.cal.key), calendar: r.cal.key, calendarAddress: r.cal.address, provider: providerOf(r.cal) }
}

export type CalProvider = 'google' | 'outlook'
export const providerOf = (c: Pick<CalInfo, 'via'> | null | undefined): CalProvider => (c?.via === 'outlook' ? 'outlook' : 'google')
/** "Google Calendar" / "Outlook" for what the chat says. */
export const calendarName = (c: Pick<CalInfo, 'via'> | null | undefined) => (providerOf(c) === 'outlook' ? 'Outlook calendar' : 'Google Calendar')

/** The provider of the calendar an event ref names (bare id: the default). */
export async function providerOfRef(email: string, ref: string | null | undefined): Promise<CalProvider> {
  const r = await resolveCalendar(email, { ref: ref ?? null }).catch(() => null)
  return providerOf(r?.cal)
}
