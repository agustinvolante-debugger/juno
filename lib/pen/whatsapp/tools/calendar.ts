// Calendar (plan F1): "add lunch with Chris Tuesday 1pm" -> a tap-to-add link for the user's own
// calendar; "send Chris an invite" -> an emailed .ics invite, after a yes. lib/pen/calendar.ts
// builds the links and invites.
//
// With Google Calendar connected (plan F2, lib/pen/google-calendar.ts) the same tools write to it
// instead. "Add X to my calendar" is the user's own request, so it is added at once, and so are
// deleting or moving an event with no guests (18 Oct). What reaches other people asks first: an
// invite (Google emails the guest), deleting or moving an event that has guests (Google emails
// them the change). Events are found by name (find_events), since the id from an earlier turn is
// not in the chat history.
//
// Several calendars (20 Oct, lib/pen/calendars.ts): reads (find_events, list_events) cover every
// connected calendar, merged, the same meeting once; a new event goes on the default calendar
// unless the user names one ("add it to my work calendar": `calendar`). Event ids the model sees
// carry their calendar ("<id>|<address>"). find_events widens on its own (title → the person as a
// guest → a day either side → the coming weeks) before saying nothing matched.
//
// Outlook (21 Oct): an Outlook calendar is one more connected calendar (lib/pen/calendars.ts); the
// same tools read and write it. What the user is told names the provider ("Added to your Outlook
// calendar"), and a video link there is Teams (meet: true), or none on a personal calendar that
// can't make one (videoUnavailable: said plainly). Invites, moves and deletes with guests still ask first.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { askConfirm, asksFirst } from '../confirm'
import { str, type ToolModule } from './types'
import { timeFields, zoneOf } from './timezone'
import { sendInvite, type CalEvent } from '../../calendar'
import { calendarPref, linksMessage, setCalendarPref, type CalendarApp } from '../../calendar-pref'
import type { UpcomingEvent } from '../../google-calendar'
import { addAttendeeByRef, addMeetByRef, anyCalendar, calendarName, createOn, defaultCalendar, deleteByRef, eventRef, eventsBetween, getEventByRef, listCalendars, moveByRef, ownAddressesOf, parseEventRef, pickCalendar, providerOf, setDefaultCalendar, type Calendar } from '../../calendars'
import { guestsBesides } from '../../calendar-page'
import { localDate, localIso, localToUtc, localWhen, validZone, whenLabel, zoneTimeLabel } from '../../timezone'
import { isPerson, type PersonVariants } from '../../person-match'
import { eventPeople, resolvePerson } from '../../person-resolve'
import { calendarWindows } from '../../search-widen'
import { turnAddSetUndo } from '../state'
import { supabaseAdmin } from '@/lib/supabase'
import { foldName } from '../../speakers'

const EVENT_PROPS = {
  title: { type: 'string', description: 'Short event title, e.g. "Lunch with Chris".' },
  start_local: { type: 'string', description: 'Start as wall-clock time where the user is, YYYY-MM-DDTHH:MM (no offset). Resolve "Tuesday 1pm" from today\'s date above.' },
  zone: { type: 'string', description: 'IANA zone only if the user named a different one for this event ("3pm New York time"). Omit otherwise.' },
  duration_min: { type: 'number', description: 'Length in minutes; default 30.' },
  location: { type: 'string' },
  description: { type: 'string', description: 'A line of context, e.g. what it is about. Optional.' },
  alarm_min: { type: 'number', description: 'Reminder this many minutes before; default 30.' },
} as const

const CAL_PROP = { type: 'string', description: 'Only when the user names one of their calendars ("my work calendar", "the tryjunoapp one", an address). Omit for the default.' } as const

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_to_calendar',
    description:
      'Add an event the user asked for to their own calendar, at once (no confirmation). With a calendar connected (Google or Outlook) it is added to their default calendar ' +
      '(or the one they name); otherwise it makes a tap-to-add link (Apple Calendar on iPhone, Google Calendar on Android, plus a Google Calendar web link).',
    input_schema: {
      type: 'object',
      properties: { ...EVENT_PROPS, meet: { type: 'boolean', description: 'true only if the user asked for a video link on it (Google Meet on a Google calendar, Teams on an Outlook calendar).' }, calendar: CAL_PROP },
      required: ['title', 'start_local'],
      additionalProperties: false,
    },
  },
  {
    name: 'invite_to_meeting',
    description:
      'Invite someone to a meeting from the user (they are the organizer; replies go to them). Give to_name: their saved email is ' +
      'looked up in the user\'s contacts; only if none is saved, ask for it (to_email). With a calendar connected (Google or Outlook) the event ' +
      'is created with them as a guest (and a Meet / Teams link if meet is true) and the calendar emails the invite. Asks the user to confirm first.',
    input_schema: {
      type: 'object',
      properties: {
        ...EVENT_PROPS,
        to_name: { type: 'string', description: 'As the user said it, e.g. "Carlos V".' },
        to_email: { type: 'string', description: 'Only if the user gave it or no contact has one.' },
        meet: { type: 'boolean', description: 'true if they asked for a video link (Meet on Google, Teams on Outlook).' },
        event_id: { type: 'string', description: 'The calendar event id when inviting them to an event Juno just added (from an earlier tool result). Omit otherwise.' },
      },
      required: ['title', 'start_local'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_meet_link',
    description: 'Put a video link on a calendar event: Google Meet on a Google calendar, Teams on an Outlook calendar. Pass event_id if a tool gave it in this turn, else the event\'s title (it is looked up).',
    input_schema: { type: 'object', properties: { event_id: { type: 'string' }, title: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'set_calendar_app',
    description: 'Remember which calendar app the user uses ("I use Outlook", "uso el calendario de Apple"), so add-to-calendar sends that link only.',
    input_schema: { type: 'object', properties: { app: { type: 'string', enum: ['apple', 'google', 'outlook'] } }, required: ['app'], additionalProperties: false },
  },
  {
    name: 'find_events',
    description:
      'Find events on ALL their connected calendars by title words and/or a person (a guest or in the title: "Chris" also finds Christian Dyas and his addresses), ' +
      'optionally on a day or range. Widens on its own (a day either side, the coming weeks) before saying nothing matched. Returns event_id, title, when, guests, calendar.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words from the title, e.g. "sample meeting test", or "".' },
        person: { type: 'string', description: 'Someone on the event as the user said it ("Chris"), or "".' },
        from_date: { type: 'string', description: 'YYYY-MM-DD (the user\'s local day), or "" (then yesterday to 60 days ahead).' },
        to_date: { type: 'string', description: 'YYYY-MM-DD, inclusive; "" = same as from_date.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_events',
    description:
      'Everything on their calendars in a date range, across ALL connected calendars, merged (the same meeting on two calendars once): "what\'s on tomorrow?", ' +
      '"my meetings this week", "am I free Friday afternoon?". Dates are the user\'s local days. Returns title, when (their time), guests, calendar.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'YYYY-MM-DD, the first local day.' },
        to_date: { type: 'string', description: 'YYYY-MM-DD, the last local day (inclusive); "" = same day.' },
        calendar: CAL_PROP,
      },
      required: ['from_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_default_calendar',
    description: 'Which of their connected calendars new events go on ("use my work calendar by default"). Runs at once.',
    input_schema: { type: 'object', properties: { calendar: { type: 'string', description: 'Their words or the address.' } }, required: ['calendar'], additionalProperties: false },
  },
  {
    name: 'delete_event',
    description: 'Delete a calendar event (Google or Outlook) the user asked to delete. Deleted at once when it has no guests; with guests it asks first (they get a cancellation).',
    input_schema: { type: 'object', properties: { event_id: { type: 'string' }, title: { type: 'string', description: 'If no event_id: the title, looked up.' } }, additionalProperties: false },
  },
  {
    name: 'move_event',
    description: 'Move a calendar event (Google or Outlook) to a new time ("move it to 3pm"). Asks first only if it has guests (the calendar emails them the change).',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        title: { type: 'string', description: 'If no event_id: the title, looked up.' },
        start_local: EVENT_PROPS.start_local,
        zone: EVENT_PROPS.zone,
        duration_min: EVENT_PROPS.duration_min,
      },
      required: ['start_local'],
      additionalProperties: false,
    },
  },
]

const num = (input: Record<string, unknown>, k: string) => (typeof input[k] === 'number' ? (input[k] as number) : undefined)

/** The tool input as an event in the user's zone, or an error for the model. */
async function eventFrom(ctx: Ctx, input: Record<string, unknown>): Promise<{ ev: CalEvent; when: string } | { error: string }> {
  const given = str(input, 'zone')
  if (given && !validZone(given)) return { error: `"${given}" is not an IANA time zone` }
  const tz = given || (await zoneOf(ctx)).tz
  if (!tz) return { error: 'the user\'s timezone is unknown: ask which city they are in, call set_timezone, then try again' }
  const at = localToUtc(str(input, 'start_local'), tz)
  if (!at) return { error: 'start_local must be YYYY-MM-DDTHH:MM' }
  if (at.getTime() < Date.now() - 60 * 60 * 1000) return { error: 'that time has already passed; check the date' }
  const ev: CalEvent = {
    title: str(input, 'title') || 'Meeting',
    start: at.toISOString(),
    tz,
    durationMin: num(input, 'duration_min'),
    location: str(input, 'location') || undefined,
    description: str(input, 'description') || undefined,
    alarmMin: num(input, 'alarm_min'),
  }
  // `when` goes into yes/no questions shown as they are: the place, not "PDT".
  return { ev, when: `${localWhen(at, tz)}, ${zoneTimeLabel(tz)}` }
}

const ADDED_NOTE =
  'Say "Added to your <added_to>:" with the title and when (local_time, zone_label), in one line. Then, unless it already has a video link (or video_unavailable), offer one ' +
  'in a few words (a Meet link on Google, a Teams link on Outlook; on their yes: add_meet_link with event_id). Never add or change anything else without a yes.'

/** Writes the event to Google Calendar (default calendar, or the one `calendar` names); shared by add_to_calendar and offers. */
export async function addToGoogle(ctx: Ctx, ev: CalEvent, o: { meet?: boolean; ref?: string; calendar?: string | null } = {}) {
  const e = await createOn(ctx.email, ev, { meet: o.meet, ref: o.ref }, o.calendar)
  return {
    event_id: e.ref,
    calendar_link: e.link,
    calendar: e.calendarAddress ?? e.calendar,
    provider: e.provider,
    ...(e.meet ? { meet_link: e.meet, video: e.video ?? 'Google Meet' } : {}),
    ...(e.videoUnavailable ? { video_unavailable: 'this Outlook calendar cannot make a Teams link (personal Microsoft accounts often can\'t); the event was added without one' } : {}),
  }
}

async function addToCalendar(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const r = await eventFrom(ctx, input)
  if ('error' in r) return r
  // The user asked for it: no "are you sure?" (that is for what Juno suggests, or what touches
  // other people).
  const said = str(input, 'calendar')
  if (await anyCalendar(ctx.email)) {
    if (said) {
      const cals = await listCalendars(ctx.email)
      if (!pickCalendar(cals, said)) return { error: `no connected calendar matches "${said}"`, connected: cals.map((c) => c.address ?? c.key), next: 'ask which one in one line, or offer to connect it (connect_app google_calendar with account; app outlook for an Outlook / Microsoft 365 calendar)' }
    }
    return confirmGcalAdd(ctx, { ev: r.ev, meet: input.meet === true, calendar: said || null })
  }
  const { message } = linksMessage(r.ev, await calendarPref(ctx.email))
  return {
    ok: true,
    ...(await timeFields(ctx, r.ev.tz!, r.ev.start, { kind: 'link', local: localIso(r.ev.start, r.ev.tz!), ev: r.ev })),
    message,
    note: 'Say the event and when (local_time, zone_label) in one line, then the message exactly (translate the words, never the links): Nothing is in their calendar until they tap.',
  }
}

async function confirmGcalAdd(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const ev = args.ev as CalEvent
  try {
    const added = await addToGoogle(ctx, ev, { meet: args.meet === true, calendar: typeof args.calendar === 'string' ? args.calendar : null })
    const tz = ev.tz ?? 'UTC'
    const several = (await listCalendars(ctx.email).catch((): Calendar[] => [])).length > 1
    const name = added.provider === 'outlook' ? 'Outlook calendar' : 'Google Calendar'
    await turnAddSetUndo(ctx, { event: { ref: added.event_id, title: ev.title }, title: ev.title }).catch(() => {})
    return {
      ok: true,
      added_to: several ? `${name} (${added.calendar})` : name,
      title: ev.title,
      ...(await timeFields(ctx, tz, ev.start, { kind: 'event', id: added.event_id, local: localIso(ev.start, tz), title: ev.title })),
      ...added,
      undo: 'the user can say "undo" to take it off',
      note: ADDED_NOTE + (several ? ' Name the calendar it went on (added_to).' : '') + (added.video_unavailable ? ' They asked for a video link: say in a few words this calendar could not make one (video_unavailable).' : ''),
    }
  } catch (e) {
    // The calendar refused (access revoked, outage): the tap-to-add link still works.
    console.warn(`pen gcal add: ${(e as Error).message}`)
    const { message } = linksMessage(ev, await calendarPref(ctx.email))
    return {
      ok: false,
      calendar_error: (e as Error).message.slice(0, 200),
      message,
      note: 'Say in one line it could not be added to their calendar directly (if the error says to connect again, offer to send the link: connect_app), then give the message exactly.',
    }
  }
}

/** The event the user means: by id, else the single title match (several → the model asks).
 *  Always the event itself, with its guests: whether a change asks first depends on them. */
async function pickEvent(ctx: Ctx, input: Record<string, unknown>): Promise<{ event: UpcomingEvent } | { error: string; matches?: unknown }> {
  const id = str(input, 'event_id')
  if (id) {
    const hit = await getEventByRef(ctx.email, id)
    return hit ? { event: hit.event } : { error: 'that event is not on their calendar any more' }
  }
  const title = str(input, 'title')
  if (!title) return { error: 'say which event: its title' }
  const now = Date.now()
  const { events } = await eventsBetween(ctx.email, new Date(now - 86_400_000), new Date(now + 60 * 86_400_000), title)
  if (!events.length) return { error: `no event called "${title}" from yesterday to 60 days ahead` }
  if (events.length > 1) return { error: 'several events match; ask the user which one', matches: events.slice(0, 10).map(eventLine(ctx)) }
  return { event: events[0] }
}

/** The event as the model sees it: its ref (id + calendar), title, when in the user's zone, guests, calendar.
 *  With `own` (the user's own addresses, ownAddressesOf), guests are other people only (22 Oct). */
export const eventLine = (ctx: Ctx, own?: Set<string>) => (e: UpcomingEvent) => ({
  event_id: eventRef(e.id, e.cal),
  title: e.title,
  when: e.allDay ? e.start.slice(0, 10) : whenLabel(Date.parse(e.start), ctx.zone?.tz ?? 'UTC'),
  ...(e.end && !e.allDay ? { ends: whenLabel(Date.parse(e.end), ctx.zone?.tz ?? 'UTC') } : {}),
  guests: (own ? guestsBesides(e.others, own) : e.others).map((o) => (o.name ? `${o.name} <${o.email}>` : o.email)),
  ...(e.cals && e.cals.length > 1 ? { calendars: e.cals } : e.cal ? { calendar: e.cal } : {}),
  meet: Boolean(e.meet),
  ...(e.declined ? { declined: true } : {}),
})

/** A local day "YYYY-MM-DD" → the instant it starts in the user's zone. */
function dayStart(ctx: Ctx, day: string, plusDays = 0): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const tz = ctx.zone?.tz || 'UTC'
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + plusDays)
  return localToUtc(`${d.toISOString().slice(0, 10)}T00:00`, tz)
}

/** The user's local day range → [from, to). Empty from → null. */
export function dayRange(ctx: Ctx, fromDay: string, toDay: string): { from: Date; to: Date } | null {
  const from = dayStart(ctx, fromDay)
  const to = dayStart(ctx, toDay || fromDay, 1)
  return from && to && to > from ? { from, to } : null
}

const NOT_CONNECTED = { error: 'no calendar is connected; connect_app google_calendar (or app outlook for an Outlook calendar) gives a one-tap link' }

/** Calendars whose access died (refresh refused): not read; the user is told and offered the link. */
function needsReconnect(cals: Calendar[]): Record<string, unknown> {
  const b = cals.filter((c) => c.broken)
  if (!b.length) return {}
  return {
    needs_reconnect: b.map((c) => `${c.address ?? c.key} (${c.via === 'outlook' ? 'Outlook' : 'Google'})`),
    note_reconnect: 'After the list, say in one line that these calendars were not read because their access stopped working, and offer to send the link to connect again (on yes: connect_app, app outlook for Outlook / google_calendar with account for Google).',
  }
}

/** "Google Calendar" / "Outlook calendar" and whose cancellation/update guests get, for the event's calendar. */
async function calOf(ctx: Ctx, ref: string): Promise<{ name: string; who: 'Google' | 'Outlook' }> {
  const key = parseEventRef(ref).cal
  const cals = await listCalendars(ctx.email).catch((): Calendar[] => [])
  const cal = key ? cals.find((c) => c.key === key) : await defaultCalendar(ctx.email, cals).catch(() => null)
  return { name: calendarName(cal), who: providerOf(cal) === 'outlook' ? 'Outlook' : 'Google' }
}

/** Events matching the title words and/or the person. */
export function matching(events: UpcomingEvent[], words: string, v: PersonVariants | null): UpcomingEvent[] {
  const w = words.trim().toLowerCase().split(/\s+/).filter((x) => x.length >= 2)
  return events.filter((e) => {
    const t = e.title.toLowerCase()
    const titleOk = !w.length || w.every((x) => t.includes(x))
    const personOk = !v || isPerson(v, { text: e.title }) || e.others.some((o) => isPerson(v, o)) || (e.organizer ? isPerson(v, e.organizer) : false)
    return titleOk && personOk
  })
}

async function findEventsTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const cals = await listCalendars(ctx.email).catch((): Calendar[] => [])
  if (!cals.some((c) => !c.broken)) return NOT_CONNECTED
  const query = str(input, 'query')
  const person = str(input, 'person')
  const now = new Date()
  const range = dayRange(ctx, str(input, 'from_date'), str(input, 'to_date')) ?? { from: new Date(now.getTime() - 86_400_000), to: new Date(now.getTime() + 60 * 86_400_000) }
  const tried: string[] = []
  for (const w of calendarWindows(range.from, range.to, now)) {
    const { events, failed } = await eventsBetween(ctx.email, w.from, w.to)
    const v = person ? await resolvePerson(ctx.email, person, { mine: cals.map((c) => c.address ?? '').filter(Boolean), extra: eventPeople(events) }) : null
    let hits = matching(events, query, v)
    // The title words may be wrong when the person is right ("the sync with Chris" titled "Juno <> Christian").
    if (!hits.length && query && v) hits = matching(events, '', v)
    tried.push(`${w.step}: ${localDate(ctx.zone?.tz, w.from)} to ${localDate(ctx.zone?.tz, new Date(w.to.getTime() - 1))}`)
    if (hits.length) {
      const own = await ownAddressesOf(ctx.email, cals).catch(() => undefined)
      return { events: hits.slice(0, 12).map(eventLine(ctx, own)), calendars_read: cals.filter((c) => !c.broken).map((c) => c.address ?? c.key), ...(failed.length ? { could_not_read: failed } : {}), ...needsReconnect(cals), searched: tried, ...(w.step !== 'asked' ? { widened: `nothing on the day(s) asked; found by widening (${w.step})` } : {}) }
    }
    if (!str(input, 'from_date') && w.step === 'asked') break
  }
  return { events: [], searched: tried, calendars_read: cals.map((c) => c.address ?? c.key), note: 'Nothing on any calendar. If they asked about a meeting with someone, find_meeting also checks invitation emails and recordings.' }
}

async function listEventsTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const cals = await listCalendars(ctx.email).catch((): Calendar[] => [])
  if (!cals.some((c) => !c.broken)) return NOT_CONNECTED
  const range = dayRange(ctx, str(input, 'from_date'), str(input, 'to_date'))
  if (!range) return { error: 'from_date / to_date must be YYYY-MM-DD, to_date not before from_date' }
  if (range.to.getTime() - range.from.getTime() > 32 * 86_400_000) return { error: 'at most a month at a time' }
  const said = str(input, 'calendar')
  const pick = said ? (pickCalendar(cals, said) as Calendar | null) : null
  if (said && !pick) return { error: `no connected calendar matches "${said}"`, connected: cals.map((c) => c.address ?? c.key) }
  const { events, read, failed } = await eventsBetween(ctx.email, range.from, range.to)
  const shown = pick ? events.filter((e) => (e.cals ?? [e.cal]).includes(pick.key)) : events
  return {
    from: str(input, 'from_date'),
    to: str(input, 'to_date') || str(input, 'from_date'),
    times_are: `the user's local time (${ctx.zone?.tz ?? 'UTC'})`,
    calendars_read: read,
    ...(failed.length ? { could_not_read: failed, note_failed: 'say in one line which calendar could not be read' } : {}),
    ...needsReconnect(cals),
    count: shown.length,
    events: shown.slice(0, 40).map(eventLine(ctx, await ownAddressesOf(ctx.email, cals).catch(() => undefined))),
    note: 'List them by day, one line each: time, title, with whom (first names). Say "nothing" for an empty day. Mention the calendar only when they have more than one and it helps.' +
      (cals.some((c) => c.broken) ? ' REQUIRED last line: needs_reconnect calendars were NOT read (their access stopped working); name them and offer the link to connect again.' : ''),
  }
}

async function setDefaultCalendarTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const cals = await listCalendars(ctx.email).catch((): Calendar[] => [])
  const pick = pickCalendar(cals, str(input, 'calendar')) as Calendar | null
  if (!pick) return { error: `no connected calendar matches "${str(input, 'calendar')}"`, connected: cals.map((c) => c.address ?? c.key), next: 'ask which, or offer to connect it (connect_app google_calendar with account)' }
  await setDefaultCalendar(ctx.email, pick.key)
  return { ok: true, default_calendar: pick.address ?? pick.key, note: 'Confirm in one line: new events go on that calendar unless they name another.' }
}

async function addMeetLink(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await anyCalendar(ctx.email))) return NOT_CONNECTED
  const p = await pickEvent(ctx, input)
  if ('error' in p) return p
  try {
    const e = await addMeetByRef(ctx.email, eventRef(p.event.id, p.event.cal))
    const kind = e.video ?? 'Meet'
    if (e.videoUnavailable) return { error: 'this Outlook calendar cannot make a Teams link (personal Microsoft accounts often can\'t)', next: 'say so in one line; they can paste a link of their own into the event' }
    return e.meet ? { ok: true, meet_link: e.meet, video: kind, note: `Give the ${kind} link in one line; it is on the calendar event too.` } : { error: 'the calendar did not create a video link for that event' }
  } catch (e) {
    return { error: (e as Error).message.slice(0, 200) }
  }
}

async function deleteEventTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await anyCalendar(ctx.email))) return NOT_CONNECTED
  const p = await pickEvent(ctx, input)
  if ('error' in p) return p
  // Guests are other people: the user's own addresses on it get no confirm and aren't listed (22 Oct).
  const line = eventLine(ctx, await ownAddressesOf(ctx.email))(p.event)
  const c = await calOf(ctx, line.event_id)
  const args = { eventId: line.event_id, title: line.title, when: line.when, calName: c.name }
  if (!asksFirst('delete_event', { guests: line.guests.length > 0 })) return confirmDelete(ctx, args)
  return askConfirm(ctx, {
    kind: 'gcal_delete',
    args,
    summary: `Delete "${line.title}", ${line.when}, from your ${c.name}? ${line.guests.join(', ')} will get ${c.who}'s cancellation. Reply yes.`,
    line: `"${line.title}", ${line.when}`,
    group: `Delete {n} events from your ${c.name}`,
    people: line.guests,
    tail: `will get ${c.who}'s cancellation`,
  })
}

async function confirmDelete(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  try {
    await deleteByRef(ctx.email, String(args.eventId))
    // No "restore it from the trash": Google's API has no restore, and whether an API delete shows
    // in Calendar's Bin isn't documented. So nothing is promised.
    return {
      ok: true,
      deleted: typeof args.title === 'string' ? args.title : true,
      note: `Say exactly one line: Deleted "<title>" from your ${typeof args.calName === 'string' ? args.calName : 'calendar'}. (in the language of your reply). No date, nothing else.`,
    }
  } catch (e) {
    return { error: (e as Error).message.slice(0, 200) }
  }
}

async function moveEventTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await anyCalendar(ctx.email))) return NOT_CONNECTED
  const p = await pickEvent(ctx, input)
  if ('error' in p) return p
  const local = str(input, 'start_local')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return { error: 'start_local must be YYYY-MM-DDTHH:MM' }
  const zone = str(input, 'zone')
  const tz = validZone(zone) ? zone : ctx.zone?.tz
  if (!tz) return { error: 'time zone unknown; ask the user where they are (set_timezone)' }
  const start = localToUtc(local, tz)
  if (!start) return { error: 'that time does not exist in that zone' }
  const line = eventLine(ctx, await ownAddressesOf(ctx.email))(p.event)
  const args = { eventId: line.event_id, start: start.toISOString(), tz, duration: num(input, 'duration_min') ?? null, title: line.title, guests: line.guests.length > 0 }
  if (asksFirst('move_event', { guests: args.guests })) {
    const who = (await calOf(ctx, line.event_id)).who
    return askConfirm(ctx, {
      kind: 'gcal_move',
      args,
      summary: `Move "${line.title}" to ${localWhen(start, tz)}, ${zoneTimeLabel(tz)}? ${line.guests.join(', ')} will get ${who}'s update. Reply yes.`,
      line: `"${line.title}" to ${localWhen(start, tz)}, ${zoneTimeLabel(tz)}`,
      group: 'Move {n} events',
      people: line.guests,
      tail: `will get ${who}'s update`,
    })
  }
  return confirmMove(ctx, args)
}

async function confirmMove(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  try {
    const tz = String(args.tz)
    const e = await moveByRef(ctx.email, String(args.eventId), String(args.start), tz, typeof args.duration === 'number' ? args.duration : undefined)
    // With guests it is not kept for a zone change: moving it again would email them again.
    const item = args.guests ? undefined : { kind: 'event' as const, id: e.ref, local: localIso(String(args.start), tz), title: String(args.title ?? 'event') }
    return { ok: true, moved: true, ...(await timeFields(ctx, tz, String(args.start), item)), event_id: e.ref, note: 'Say in one line where it moved to (local_time, zone_label).' }
  } catch (e) {
    return { error: (e as Error).message.slice(0, 200) }
  }
}

/** "Carlos V" → the saved contact with an email: exact name first, else the one name that
 *  starts with or contains what was said. Several or none → null (the model asks). */
async function contactEmail(ctx: Ctx, name: string): Promise<{ name: string; email: string } | { several: string[] } | null> {
  const want = foldName(name)
  if (!want) return null
  const { data } = await supabaseAdmin.from('pen_people').select('name,email').eq('user_email', ctx.email).not('email', 'is', null)
  const rows = ((data ?? []) as { name: string; email: string }[]).filter((p) => p.email)
  const exact = rows.filter((p) => foldName(p.name) === want)
  const near = exact.length ? exact : rows.filter((p) => foldName(p.name).startsWith(want) || foldName(p.name).includes(want))
  if (near.length === 1) return near[0]
  return near.length ? { several: near.map((p) => `${p.name} <${p.email}>`) } : null
}

async function inviteToMeeting(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  let toEmail = str(input, 'to_email').toLowerCase()
  let toName = str(input, 'to_name') || null
  if (!toEmail && toName) {
    const c = await contactEmail(ctx, toName)
    if (c && 'several' in c) return { error: 'several contacts match; ask the user which one', matches: c.several }
    if (c) { toEmail = c.email.toLowerCase(); toName = c.name }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return { error: `no email saved for ${toName ?? 'them'}; ask the user for it (it is saved to the contact once given)` }
  const r = await eventFrom(ctx, input)
  if ('error' in r) return r
  const meet = input.meet === true
  // One of the user's own addresses (their work email): nobody else is emailed, so no confirm.
  const mine = (await ownAddressesOf(ctx.email).catch(() => new Set<string>())).has(toEmail)
  if (mine && (await anyCalendar(ctx.email))) return confirmGcalInvite(ctx, { ev: r.ev, toName, toEmail, eventId: str(input, 'event_id') || null, meet })
  if (await anyCalendar(ctx.email)) {
    const eventId = str(input, 'event_id') || null
    const c = await calOf(ctx, eventId ?? '')
    const video = c.who === 'Outlook' ? 'Teams' : 'Meet'
    return askConfirm(ctx, {
      kind: 'gcal_invite',
      args: { ev: r.ev, toName, toEmail, eventId, meet },
      summary: `Create "${r.ev.title}", ${r.when}${meet ? `, with a ${video} link,` : ''} and invite ${toName ? `${toName} <${toEmail}>` : toEmail}? Your ${c.name} will email them the invite from you. Reply yes.`,
    })
  }
  return askConfirm(ctx, {
    kind: 'calendar_invite',
    args: { ev: r.ev, toName, toEmail },
    summary: `Email ${toName ? `${toName} <${toEmail}>` : toEmail} an invite for "${r.ev.title}", ${r.when}, from you? Reply yes.`,
  })
}

async function confirmInvite(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const ev = args.ev as CalEvent
  const toEmail = String(args.toEmail ?? '')
  const toName = typeof args.toName === 'string' ? args.toName : null
  const r = await sendInvite(ctx.email, { ev, toName, toEmail })
  if (!r.ok) return { error: r.error }
  const { message: own } = linksMessage(ev, await calendarPref(ctx.email))
  return {
    ok: true,
    invited: toName ? `${toName} <${toEmail}>` : toEmail,
    ...(await timeFields(ctx, ev.tz ?? 'UTC', ev.start)),
    add_for_yourself: own,
    note: 'Confirm who was invited and when (local_time, zone_label), in one line; a copy went to the user by BCC and replies go to them. Then add_for_yourself exactly.',
  }
}

/** A calendar connected (Google or Outlook): the guest goes on the event and the calendar emails the invite. */
async function confirmGcalInvite(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const ev = args.ev as CalEvent
  const toEmail = String(args.toEmail ?? '')
  const toName = typeof args.toName === 'string' ? args.toName : null
  const eventId = typeof args.eventId === 'string' && args.eventId ? args.eventId : null
  const invited = toName ? `${toName} <${toEmail}>` : toEmail
  try {
    let e = eventId ? await addAttendeeByRef(ctx.email, eventId, { email: toEmail, name: toName }) : await createOn(ctx.email, ev, { attendees: [{ email: toEmail, name: toName }], meet: args.meet === true })
    if (eventId && args.meet === true && !e.meet) e = { ...(await addMeetByRef(ctx.email, eventId)), ref: e.ref }
    return {
      ok: true,
      invited,
      ...(await timeFields(ctx, ev.tz ?? 'UTC', ev.start)),
      event_id: e.ref,
      ...(e.meet ? { meet_link: e.meet } : {}),
      note: `Confirm in one line with when (local_time, zone_label): the event is on their ${(await calOf(ctx, e.ref)).name} and it emailed the invite. Unless it has a video link${e.videoUnavailable ? ' (this calendar could not make one: say so)' : ', offer one (on yes: add_meet_link)'}.`,
    }
  } catch (err) {
    console.warn(`pen gcal invite: ${(err as Error).message}`)
    return confirmInvite(ctx, args) // the emailed .ics still gets the invite out
  }
}

export const calendarModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) =>
    name === 'add_to_calendar' ? addToCalendar(ctx, input)
      : name === 'invite_to_meeting' ? inviteToMeeting(ctx, input)
        : name === 'add_meet_link' ? addMeetLink(ctx, input)
          : name === 'set_calendar_app' ? setCalendarPref(ctx.email, str(input, 'app') as CalendarApp).then(() => ({ ok: true, note: 'Confirm in one line; their next calendar links will be for that app.' }))
          : name === 'find_events' ? findEventsTool(ctx, input)
            : name === 'list_events' ? listEventsTool(ctx, input)
            : name === 'set_default_calendar' ? setDefaultCalendarTool(ctx, input)
            : name === 'delete_event' ? deleteEventTool(ctx, input)
              : name === 'move_event' ? moveEventTool(ctx, input)
                : undefined,
  confirm: { calendar_invite: confirmInvite, gcal_add: confirmGcalAdd, gcal_invite: confirmGcalInvite, gcal_delete: confirmDelete, gcal_move: confirmMove },
  prompt:
    '- Calendar: "add X to my calendar" -> add_to_calendar (with a calendar connected, Google or Outlook, it is added at once; otherwise send ' +
    'its message with the links as they are). "Delete / move / add a Meet link to <event>" -> delete_event / move_event / ' +
    'add_meet_link with the event\'s title (or event_id from a tool result in this same turn); if several match, list them and ' +
    'ask which. With no guests a delete or move happens at once: never ask "are you sure?" yourself; the tool asks when guests would be emailed. "Delete it and make a new one at 3" is move_event. Inviting someone else -> invite_to_meeting with their email ' +
    '(give to_name: the saved email is looked up; ask only if none; meet true for a video link — Meet on Google, Teams on Outlook — one step creates the event, the link and the invite). Never say you cannot delete or change events: you can, with a calendar connected (Google or Outlook). ' +
    '"I use Outlook / Apple / Google calendar" -> set_calendar_app. Times are wall-clock where the user is; never compute UTC offsets yourself.\n' +
    '- Reading their calendars: "what\'s on tomorrow?", "my meetings this week", "am I free Friday?" -> list_events (every connected calendar, merged). ' +
    'A meeting by person or title -> find_events (it widens on its own). Never say you can only search by title. "Add it to my work calendar" / "to my Outlook calendar" -> add_to_calendar with calendar; ' +
    '"use my work calendar by default" -> set_default_calendar.',
}
