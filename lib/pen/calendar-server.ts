// The Calendar page's reads and writes (22 Oct), behind app/api/pen/calendar/*. Events are read
// live from every connected Google and Outlook calendar (lib/pen/calendars.ts) for the range on
// screen and never stored; the Juno extras are computed on each read: the recording of a past
// meeting (calendar-match.ts) and on demand a guest brief from
// what Pen already knows (personBriefFor, no model call). The decisions (who may change what,
// when guests must be confirmed) are pure, in calendar-page.ts.

import { supabaseAdmin } from '@/lib/supabase'
import type { CalAccount, CalBrief, CalCreate, CalPatch, CalRange, CalViewEvent } from './calendar-view'
import { addMeetByRef, createOn, defaultCalendar, deleteByRef, eventsBetween, getEventByRef, listCalendars, moveByRef, ownAddressesOf, providerOf, setGuestsByRef, updateByRef, type Calendar } from './calendars'
import { matchRecordings, type MatchRecording } from './calendar-match'
import { briefPerson, changeGate, guestDiff, guestsBesides, ownAddresses, patchGate, toViewEvent, type BriefSource, type PatchGate } from './calendar-page'
import { isDay, type EventPatch, type NewEvent } from './calendar-edit'
import type { UpcomingEvent } from './google-calendar'
import { userZone } from './timezone'

const DAY = 86_400_000
/** How far back a recording's to-dos can still be due on the days shown. */

const validTz = (tz: unknown): tz is string => {
  if (typeof tz !== 'string' || !tz.includes('/')) return tz === 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/* ---------------------------------------------------------------- reads */

type RecRow = { id: string; title: string | null; source_name: string | null; source_channel: string | null; storage_path: string | null; recorded_at: string | null; duration_sec: number | null }

/** Recordings that started in the range or up to 4 h before it (recorded_at is the START; a pen
 *  file runs at most PART = 240 min, so one begun before the range can still overlap it), with
 *  their people's emails. */
async function recordingsIn(email: string, from: Date, to: Date): Promise<MatchRecording[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,source_name,source_channel,storage_path,recorded_at,duration_sec')
    .eq('user_email', email)
    .or('merge_index.is.null,merge_index.eq.0')
    .not('recorded_at', 'is', null)
    .gte('recorded_at', new Date(from.getTime() - 4 * 3_600_000).toISOString())
    .lt('recorded_at', new Date(Math.min(Date.now(), to.getTime())).toISOString())
    // 200: six weeks of recordings, and the session-id list below stays a short URL.
    .limit(200)
  if (error) throw new Error(error.message)
  const rows = ((data ?? []) as RecRow[]).filter((r) => r.recorded_at && r.source_channel !== 'sample' && !String(r.storage_path ?? '').startsWith('sample'))
  if (!rows.length) return []
  const emails = new Map<string, string[]>()
  const { data: links } = await supabaseAdmin.from('pen_session_people').select('session_id,person_id').eq('user_email', email).in('session_id', rows.map((r) => r.id))
  const ids = [...new Set(((links ?? []) as { person_id: string }[]).map((l) => l.person_id))]
  if (ids.length) {
    const { data: people } = await supabaseAdmin.from('pen_people').select('id,email').eq('user_email', email).in('id', ids)
    const byId = new Map(((people ?? []) as { id: string; email: string | null }[]).filter((p) => p.email).map((p) => [p.id, p.email!.toLowerCase()]))
    for (const l of (links ?? []) as { session_id: string; person_id: string }[]) {
      const m = byId.get(l.person_id)
      if (m) emails.set(l.session_id, [...(emails.get(l.session_id) ?? []), m])
    }
  }
  return rows.map((r) => ({ id: r.id, title: r.title ?? r.source_name ?? 'Recording', recordedAt: r.recorded_at!, durationSec: r.duration_sec, emails: emails.get(r.id) ?? [] }))
}

const soft = <T>(what: string, p: Promise<T>, empty: T): Promise<T> =>
  p.catch((e) => {
    console.warn(`pen calendar page: ${what}: ${(e as Error).message}`)
    return empty
  })

/** GET /api/pen/calendar: everything on screen for [from, to). `tzHint` = the browser's zone, used when the profile has none. */
export async function readRange(email: string, from: Date, to: Date, tzHint?: string | null, now = new Date()): Promise<CalRange> {
  const [cals, zone] = await Promise.all([listCalendars(email).catch((): Calendar[] => []), userZone(email).catch(() => null)])
  const tz = zone?.tz ?? (validTz(tzHint) ? tzHint : 'UTC')
  const pastEnd = from < now
  const [def, read, recordings] = await Promise.all([
    defaultCalendar(email, cals),
    eventsBetween(email, from, to, undefined, { max: 250, cals }),
    pastEnd ? soft('recordings', recordingsIn(email, from, to), [] as MatchRecording[]) : Promise.resolve([] as MatchRecording[]),
  ])
  const own = ownAddresses(email, cals)
  const keyed = read.events.map((e) => ({ e, key: viewRef(e) }))
  const match = matchRecordings(keyed.map(({ e, key }) => ({ key, title: e.title, start: e.start, end: e.end, allDay: e.allDay, declined: e.declined, others: e.others })), recordings, now)
  const calendars: CalAccount[] = cals.map((c) => ({ key: c.key, address: c.address, provider: providerOf(c), broken: c.broken, isDefault: c.key === def?.key }))
  return {
    calendars,
    events: keyed.map(({ e, key }) => toViewEvent(e, { own, now, recording: match.get(key) ?? null })),
    failed: read.failed,
    tz,
  }
}

const viewRef = (e: UpcomingEvent) => `${e.id}|${e.cal ?? ''}`

/** GET /api/pen/calendar/brief: up to four guests, each by their email in Contacts first, else by name. */
export async function readBrief(email: string, ref: string): Promise<CalBrief | null> {
  const got = await getEventByRef(email, ref)
  if (!got) return null
  const guests = got.event.others.slice(0, 4)
  if (!guests.length) return { people: [] }
  const { data } = await supabaseAdmin.from('pen_people').select('name,email').eq('user_email', email).not('email', 'is', null)
  const byEmail = new Map(((data ?? []) as { name: string; email: string | null }[]).filter((p) => p.email && p.name).map((p) => [p.email!.toLowerCase(), p.name]))
  const { personBriefFor } = await import('./whatsapp/agent')
  const people = await Promise.all(
    guests.map(async (g) => {
      const contact = byEmail.get(g.email.toLowerCase()) ?? null
      const lookup = contact ?? g.name?.trim() ?? null
      const b: BriefSource | null = lookup ? await personBriefFor(email, lookup).catch(() => null) : null
      return briefPerson({ email: g.email, name: contact ?? g.name }, b)
    }),
  )
  return { people }
}

/* --------------------------------------------------------------- writes */

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; body: Record<string, unknown> }
const refuse = (g: NonNullable<PatchGate>): Outcome<never> => ({ ok: false, status: g.status, body: g.body })
const bad = (error: string, status = 400): Outcome<never> => ({ ok: false, status, body: { error } })

async function fresh(email: string, ref: string, cals?: Calendar[]): Promise<CalViewEvent | null> {
  const got = await getEventByRef(email, ref).catch(() => null)
  if (!got) return null
  const list = cals ?? (await listCalendars(email).catch((): Calendar[] => []))
  return toViewEvent(got.event, { own: ownAddresses(email, list) })
}

const cleanGuests = (g: unknown): { email: string; name: string | null }[] =>
  (Array.isArray(g) ? g : [])
    .map((x) => ({ email: String((x as { email?: unknown })?.email ?? '').trim().toLowerCase(), name: typeof (x as { name?: unknown })?.name === 'string' ? ((x as { name: string }).name.trim() || null) : null }))
    .filter((x, i, all) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email) && all.findIndex((y) => y.email === x.email) === i)
    .slice(0, 50)

/** POST /api/pen/calendar/events. */
export async function createFromPage(email: string, b: Partial<CalCreate>): Promise<Outcome<CalViewEvent>> {
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const allDay = b.allDay === true
  const start = typeof b.start === 'string' ? b.start : ''
  const end = typeof b.end === 'string' ? b.end : ''
  if (allDay ? !isDay(start) || (end && !isDay(end)) : Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return bad(allDay ? 'an all-day event needs dates (YYYY-MM-DD)' : 'start and end must be dates')
  if (allDay ? end && end <= start : Date.parse(end) <= Date.parse(start)) return bad('the end must be after the start')
  const tz = validTz(b.tz) ? b.tz : 'UTC'
  const guests = cleanGuests(b.guests)
  const cals = await listCalendars(email).catch((): Calendar[] => [])
  const key = typeof b.cal === 'string' && b.cal.trim() ? b.cal.trim().toLowerCase() : null
  if (key && !cals.some((c) => c.key === key && !c.broken)) return bad('that calendar is not connected (or needs reconnecting)')
  if (!cals.length) return bad('no calendar is connected')
  // The user's own other addresses aren't guests: nobody else is emailed for those (22 Oct).
  const gate = changeGate('create', { guests: guestsBesides(guests, await ownAddressesOf(email, cals)).length, confirm: b.confirm === true })
  if (gate) return refuse(gate)
  const made = await createOn(
    email,
    { title: title || 'Meeting', start, end: end || undefined, allDay, tz, ...(typeof b.location === 'string' && b.location.trim() ? { location: b.location } : {}), ...(typeof b.description === 'string' && b.description.trim() ? { description: b.description } : {}) },
    { attendees: guests, meet: b.video === true },
    key,
  )
  const view = await fresh(email, made.ref, cals)
  return {
    ok: true,
    // Re-read failed (rare: Google not yet consistent): what was asked, with what came back.
    value: view ?? toViewEvent({ id: made.id, cal: made.calendar, title: title || 'Meeting', start, end: end || null, allDay, others: guests, declined: false, location: b.location?.trim() || null, meet: made.meet, link: made.link, junoRef: null, juno: true, organizerSelf: true, ...(b.description?.trim() ? { description: b.description.trim().slice(0, 1000) } : {}) }, { own: ownAddresses(email, cals) }),
  }
}

/**
 * PATCH /api/pen/calendar/events. Start and end travel together: the missing one comes from the
 * event (same length when only the start moves). A time-only change to a timed event is a move
 * (moveByRef, the chat's path); other fields are an update. Then the guest list (the whole list,
 * absent = unchanged), then a video link (none yet only). A move to another calendar (`cal`) is
 * last and replaces all of that: the event, with the changes, is created there and this one deleted
 * (moveToCalendar). Who may do what is patchGate (calendar-page.ts).
 */
export async function patchFromPage(email: string, b: Partial<CalPatch>, ops: MoveOps = DEFAULT_MOVE_OPS): Promise<Outcome<CalViewEvent>> {
  if (typeof b.ref !== 'string' || !b.ref) return bad('ref required')
  const tz = validTz(b.tz) ? b.tz : 'UTC'
  const cals = await listCalendars(email).catch((): Calendar[] => [])
  const got = await getEventByRef(email, b.ref)
  if (!got) return bad('that event is gone', 404)
  const e = got.event

  const patch: EventPatch = { tz }
  if (typeof b.title === 'string') patch.title = b.title
  if (b.location === null || typeof b.location === 'string') patch.location = b.location
  if (b.description === null || typeof b.description === 'string') patch.description = b.description
  const timeChange = typeof b.start === 'string' || typeof b.end === 'string'
  if (timeChange) {
    const t = fillTimes(e, typeof b.start === 'string' ? b.start : undefined, typeof b.end === 'string' ? b.end : undefined)
    if ('error' in t) return bad(t.error)
    patch.start = t.start
    patch.end = t.end
  }
  const fieldChange = timeChange || patch.title !== undefined || patch.location !== undefined || patch.description !== undefined
  // Guests: only when the list really differs; video: only when there is no link yet.
  const after = b.guests === undefined ? undefined : cleanGuests(b.guests)
  if (b.guests !== undefined && !Array.isArray(b.guests)) return bad('guests must be a list')
  const diff = after ? guestDiff(e.others, after) : null
  const guestChange = Boolean(diff && (diff.added.length || diff.removed.length))
  const video = b.video === true && !e.meet
  const key = typeof b.cal === 'string' && b.cal.trim() ? b.cal.trim().toLowerCase() : null
  const move = Boolean(key && key !== got.cal.key)
  if (!fieldChange && b.guests === undefined && b.video === undefined && !key) return bad('nothing to change')

  const own = await ownAddressesOf(email, cals)
  const editable = toViewEvent(e, { own }).editable
  // Who would be emailed counts other people only: the user's own addresses on it aren't guests.
  const gate = patchGate({ editable, before: guestsBesides(e.others, own), after: guestChange ? guestsBesides(after!, own) : undefined, otherChange: fieldChange || video, move, recurring: e.recurring, confirm: b.confirm === true })
  if (gate) return refuse(gate)
  if (move && !cals.some((c) => c.key === key && !c.broken)) return bad('that calendar is not connected (or needs reconnecting)')
  // Nothing actually changes (same list, a link already there, the same calendar): the event as it is.
  if (!fieldChange && !guestChange && !video && !move) {
    const view = toViewEvent(e, { own: ownAddresses(email, cals) })
    return { ok: true, value: view }
  }

  let ref = b.ref
  if (move) {
    ref = (await moveToCalendar(email, e, b.ref, key!, { ...patch, video }, ops)).ref
  } else {
    if (fieldChange) {
      const onlyTime = timeChange && patch.title === undefined && patch.location === undefined && patch.description === undefined
      const res = onlyTime && !e.allDay && !isDay(patch.start)
        ? await moveByRef(email, ref, patch.start!, tz, Math.max(5, Math.round((Date.parse(patch.end!) - Date.parse(patch.start!)) / 60000)))
        : await updateByRef(email, ref, patch, e.others.length > 0)
      ref = res.ref
    }
    if (guestChange) ref = (await setGuestsByRef(email, ref, after!)).ref
    if (video) await addMeetByRef(email, ref)
  }
  const view = await fresh(email, ref, cals)
  return view ? { ok: true, value: view } : bad('changed, but the calendar did not send it back', 502)
}

/** How a move creates and deletes (injectable for tests). */
export type MoveOps = {
  create: (email: string, ev: NewEvent, o: { meet?: boolean }, cal: string) => Promise<{ ref: string }>
  remove: (email: string, ref: string) => Promise<void>
}
const DEFAULT_MOVE_OPS: MoveOps = { create: (email, ev, o, cal) => createOn(email, ev, o, cal), remove: deleteByRef }

const goneAlready = (err: unknown) => [404, 410].includes((err as { status?: number })?.status ?? 0)

/**
 * Moves an event (no guests: the gate refuses those) to another connected calendar: the same event,
 * with the change applied, is created there (title, time, place, notes, a video link if it had one
 * or one was asked for), then this one is deleted. If that delete fails, the new copy is deleted
 * again and the move fails: never two copies without saying so.
 */
export async function moveToCalendar(email: string, e: UpcomingEvent, fromRef: string, target: string, p: EventPatch & { video?: boolean }, ops: MoveOps = DEFAULT_MOVE_OPS): Promise<{ ref: string }> {
  const start = p.start ?? e.start
  const allDay = p.start ? isDay(p.start) : e.allDay
  const end = p.end ?? e.end ?? undefined
  const location = p.location !== undefined ? p.location : e.location
  const description = p.description !== undefined ? p.description : e.description ?? null
  const title = p.title ?? (e.title === '(no title)' ? '' : e.title)
  const ev: NewEvent = {
    title: title || 'Meeting', start, ...(end ? { end } : {}), allDay, tz: p.tz,
    ...(location?.trim() ? { location } : {}), ...(description?.trim() ? { description } : {}),
  }
  const made = await ops.create(email, ev, { meet: Boolean(e.meet) || p.video === true }, target)
  try {
    await ops.remove(email, fromRef)
  } catch (err) {
    if (goneAlready(err)) return made
    const why = (err as Error)?.message || 'the calendar did not answer'
    try {
      await ops.remove(email, made.ref)
    } catch (err2) {
      console.warn(`pen calendar move: ${email}: original ${fromRef} and copy ${made.ref} both left: ${(err2 as Error).message}`)
      throw Object.assign(new Error(`It is now on both calendars: the original could not be removed (${why}). Delete one of them.`), { status: 502 })
    }
    throw Object.assign(new Error(`Not moved: the original could not be removed (${why}).`), { status: 502 })
  }
  return made
}

/** The new [start, end] for a change that gives one or both; all-day dates or ISO instants, never mixed. */
export function fillTimes(e: Pick<UpcomingEvent, 'start' | 'end' | 'allDay'>, start?: string, end?: string): { start: string; end: string } | { error: string } {
  const day = isDay(start ?? end ?? '')
  if (start && end && isDay(start) !== isDay(end)) return { error: 'start and end must both be dates or both be times' }
  if (day) {
    const s = start ?? (e.allDay ? e.start : e.start.slice(0, 10))
    const days = e.allDay && e.end ? Math.max(1, Math.round((Date.parse(e.end) - Date.parse(e.start)) / DAY)) : 1
    const en = end ?? new Date(Date.parse(`${s}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
    if (!isDay(s) || !isDay(en)) return { error: 'an all-day event needs dates (YYYY-MM-DD)' }
    if (en <= s) return { error: 'the end must be after the start' }
    return { start: s, end: en }
  }
  // Timed. From an all-day event, a new start without an end gets an hour.
  const oldLen = !e.allDay && e.end ? Date.parse(e.end) - Date.parse(e.start) : 3_600_000
  const s = start ?? (e.allDay ? null : e.start)
  if (!s) return { error: 'a new start is needed' }
  const sMs = Date.parse(s)
  const eMs = end ? Date.parse(end) : sMs + (oldLen > 0 ? oldLen : 1_800_000)
  if (Number.isNaN(sMs) || Number.isNaN(eMs)) return { error: 'start and end must be dates' }
  if (eMs <= sMs) return { error: 'the end must be after the start' }
  return { start: new Date(sMs).toISOString(), end: new Date(eMs).toISOString() }
}

/** DELETE /api/pen/calendar/events?ref=&confirm=1. */
export async function deleteFromPage(email: string, ref: string, confirm: boolean): Promise<Outcome<true>> {
  const cals = await listCalendars(email).catch((): Calendar[] => [])
  const got = await getEventByRef(email, ref)
  if (!got) return bad('that event is gone', 404)
  const own = await ownAddressesOf(email, cals)
  const gate = changeGate('delete', { guests: guestsBesides(got.event.others, own).length, editable: toViewEvent(got.event, { own }).editable, confirm })
  if (gate) return refuse(gate)
  await deleteByRef(email, ref)
  return { ok: true, value: true }
}
