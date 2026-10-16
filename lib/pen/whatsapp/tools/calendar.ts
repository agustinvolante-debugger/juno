// Calendar (plan F1): "add lunch with Chris Tuesday 1pm" -> a tap-to-add link for the user's own
// calendar; "send Chris an invite" -> an emailed .ics invite, after a yes. lib/pen/calendar.ts
// builds the links and invites.
//
// With Google Calendar connected (plan F2, lib/pen/google-calendar.ts) the same tools write to it
// instead. "Add X to my calendar" is the user's own request, so it is added at once; what touches
// other people or removes something asks first: an invite (Google emails the guest), deleting an
// event, moving one that has guests. Events are found by name (find_events), since the id from an
// earlier turn is not in the chat history.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { askConfirm } from '../confirm'
import { str, type ToolModule } from './types'
import { zoneOf } from './timezone'
import { sendInvite, type CalEvent } from '../../calendar'
import { calendarPref, linksMessage, setCalendarPref, type CalendarApp } from '../../calendar-pref'
import { addAttendee, addMeet, createEvent, deleteEvent, findEvents, gcalConnected, moveEvent, type UpcomingEvent } from '../../google-calendar'
import { localToUtc, validZone, whenLabel } from '../../timezone'
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

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_to_calendar',
    description:
      'Add an event the user asked for to their own calendar. With Google Calendar connected it is added there at once; ' +
      'otherwise it makes a tap-to-add link (Apple Calendar on iPhone, Google Calendar on Android, plus a Google Calendar web link).',
    input_schema: {
      type: 'object',
      properties: { ...EVENT_PROPS, meet: { type: 'boolean', description: 'true only if the user asked for a Google Meet / video link on it.' } },
      required: ['title', 'start_local'],
      additionalProperties: false,
    },
  },
  {
    name: 'invite_to_meeting',
    description:
      'Invite someone to a meeting from the user (they are the organizer; replies go to them). Give to_name: their saved email is ' +
      'looked up in the user\'s contacts; only if none is saved, ask for it (to_email). With Google Calendar connected the event ' +
      'is created with them as a guest (and a Meet link if meet is true) and Google emails the invite. Asks the user to confirm first.',
    input_schema: {
      type: 'object',
      properties: {
        ...EVENT_PROPS,
        to_name: { type: 'string', description: 'As the user said it, e.g. "Carlos V".' },
        to_email: { type: 'string', description: 'Only if the user gave it or no contact has one.' },
        meet: { type: 'boolean', description: 'true if they asked for a Google Meet / video link.' },
        event_id: { type: 'string', description: 'The Google Calendar event id when inviting them to an event Juno just added (from an earlier tool result). Omit otherwise.' },
      },
      required: ['title', 'start_local'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_meet_link',
    description: 'Put a Google Meet link on a Google Calendar event. Pass event_id if a tool gave it in this turn, else the event\'s title (it is looked up).',
    input_schema: { type: 'object', properties: { event_id: { type: 'string' }, title: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'set_calendar_app',
    description: 'Remember which calendar app the user uses ("I use Outlook", "uso el calendario de Apple"), so add-to-calendar sends that link only.',
    input_schema: { type: 'object', properties: { app: { type: 'string', enum: ['apple', 'google', 'outlook'] } }, required: ['app'], additionalProperties: false },
  },
  {
    name: 'find_events',
    description: 'Look up Google Calendar events by name (yesterday to 60 days ahead), to change, delete or add a Meet link to one. Returns ids, titles, times.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Words from the title, e.g. "sample meeting test".' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'delete_event',
    description: 'Delete a Google Calendar event the user asked to delete. Asks the user first (guests, if any, get Google\'s cancellation).',
    input_schema: { type: 'object', properties: { event_id: { type: 'string' }, title: { type: 'string', description: 'If no event_id: the title, looked up.' } }, additionalProperties: false },
  },
  {
    name: 'move_event',
    description: 'Move a Google Calendar event to a new time ("move it to 3pm"). Asks first only if it has guests (Google emails them the change).',
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
  return { ev, when: whenLabel(at, tz) }
}

const ADDED_NOTE =
  'Say "Added to your Google Calendar:" with the title and when, in one line. Then, unless it already has a Meet link, offer one ' +
  'in a few words (on their yes: add_meet_link with event_id). Never add or change anything else without a yes.'

/** Writes the confirmed event to Google Calendar; shared by add_to_calendar and offers. */
export async function addToGoogle(ctx: Ctx, ev: CalEvent, o: { meet?: boolean; ref?: string } = {}) {
  const e = await createEvent(ctx.email, ev, { meet: o.meet, ref: o.ref })
  return { event_id: e.id, google_calendar_link: e.link, ...(e.meet ? { meet_link: e.meet } : {}) }
}

async function addToCalendar(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const r = await eventFrom(ctx, input)
  if ('error' in r) return r
  // The user asked for it: no "are you sure?" (that is for what Juno suggests, or what touches
  // other people).
  if (await gcalConnected(ctx.email)) return confirmGcalAdd(ctx, { ev: r.ev, meet: input.meet === true })
  const { message } = linksMessage(r.ev, await calendarPref(ctx.email))
  return {
    ok: true,
    when: r.when,
    message,
    note: 'Say the event and when in one line, then the message exactly (translate the words, never the links): Nothing is in their calendar until they tap.',
  }
}

async function confirmGcalAdd(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const ev = args.ev as CalEvent
  try {
    const added = await addToGoogle(ctx, ev, { meet: args.meet === true })
    return { ok: true, added_to: 'Google Calendar', title: ev.title, when: whenLabel(Date.parse(ev.start), ev.tz ?? 'UTC'), ...added, note: ADDED_NOTE }
  } catch (e) {
    // Google refused (access revoked, outage): the tap-to-add link still works.
    console.warn(`pen gcal add: ${(e as Error).message}`)
    const { message } = linksMessage(ev, await calendarPref(ctx.email))
    return {
      ok: false,
      google_calendar_error: (e as Error).message.slice(0, 200),
      message,
      note: 'Say in one line it could not be added to Google Calendar directly, then give the message exactly.',
    }
  }
}

/** The event the user means: by id, else the single title match (several → the model asks). */
async function pickEvent(ctx: Ctx, input: Record<string, unknown>): Promise<{ event: UpcomingEvent } | { id: string } | { error: string; matches?: unknown }> {
  const id = str(input, 'event_id')
  if (id) return { id }
  const title = str(input, 'title')
  if (!title) return { error: 'say which event: its title' }
  const hits = await findEvents(ctx.email, title)
  if (!hits.length) return { error: `no event called "${title}" from yesterday to 60 days ahead` }
  if (hits.length > 1) return { error: 'several events match; ask the user which one', matches: hits.map(eventLine(ctx)) }
  return { event: hits[0] }
}

const eventLine = (ctx: Ctx) => (e: UpcomingEvent) => ({
  event_id: e.id,
  title: e.title,
  when: e.allDay ? e.start.slice(0, 10) : whenLabel(Date.parse(e.start), ctx.zone?.tz ?? 'UTC'),
  guests: e.others.map((o) => o.name ?? o.email),
  meet: Boolean(e.meet),
})

async function findEventsTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await gcalConnected(ctx.email))) return { error: 'Google Calendar is not connected; connect_app google_calendar gives a one-tap link' }
  const hits = await findEvents(ctx.email, str(input, 'query'))
  return { events: hits.map(eventLine(ctx)) }
}

async function addMeetLink(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await gcalConnected(ctx.email))) return { error: 'Google Calendar is not connected' }
  const p = await pickEvent(ctx, input)
  if ('error' in p) return p
  try {
    const e = await addMeet(ctx.email, 'id' in p ? p.id : p.event.id)
    return e.meet ? { ok: true, meet_link: e.meet, note: 'Give the Meet link in one line; it is on the calendar event too.' } : { error: 'Google did not create a Meet link for that event' }
  } catch (e) {
    return { error: (e as Error).message.slice(0, 200) }
  }
}

async function deleteEventTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await gcalConnected(ctx.email))) return { error: 'Google Calendar is not connected' }
  const p = await pickEvent(ctx, input)
  if ('error' in p) return p
  const line = 'event' in p ? eventLine(ctx)(p.event) : null
  const guests = line?.guests.length ? ` ${line.guests.join(', ')} will get Google's cancellation.` : ''
  return askConfirm(ctx, {
    kind: 'gcal_delete',
    args: { eventId: 'id' in p ? p.id : p.event.id },
    summary: `Delete "${line?.title ?? 'that event'}"${line ? `, ${line.when}` : ''}, from your Google Calendar?${guests} Reply yes.`,
  })
}

async function confirmDelete(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  try {
    await deleteEvent(ctx.email, String(args.eventId))
    return { ok: true, deleted: true, note: 'Say in one line it is deleted from their Google Calendar.' }
  } catch (e) {
    return { error: (e as Error).message.slice(0, 200) }
  }
}

async function moveEventTool(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await gcalConnected(ctx.email))) return { error: 'Google Calendar is not connected' }
  const p = await pickEvent(ctx, input)
  if ('error' in p) return p
  const local = str(input, 'start_local')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return { error: 'start_local must be YYYY-MM-DDTHH:MM' }
  const zone = str(input, 'zone')
  const tz = validZone(zone) ? zone : ctx.zone?.tz
  if (!tz) return { error: 'time zone unknown; ask the user where they are (set_timezone)' }
  const start = localToUtc(local, tz)
  if (!start) return { error: 'that time does not exist in that zone' }
  const args = { eventId: 'id' in p ? p.id : p.event.id, start: start.toISOString(), tz, duration: num(input, 'duration_min') ?? null }
  const line = 'event' in p ? eventLine(ctx)(p.event) : null
  if (line?.guests.length) {
    return askConfirm(ctx, {
      kind: 'gcal_move',
      args,
      summary: `Move "${line.title}" to ${whenLabel(start.getTime(), tz)}? ${line.guests.join(', ')} will get Google's update. Reply yes.`,
    })
  }
  return confirmMove(ctx, args)
}

async function confirmMove(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  try {
    const e = await moveEvent(ctx.email, String(args.eventId), String(args.start), String(args.tz), typeof args.duration === 'number' ? args.duration : undefined)
    return { ok: true, moved_to: whenLabel(Date.parse(String(args.start)), String(args.tz)), event_id: e.id, note: 'Say in one line where it moved to.' }
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
  if (await gcalConnected(ctx.email)) {
    const eventId = str(input, 'event_id') || null
    return askConfirm(ctx, {
      kind: 'gcal_invite',
      args: { ev: r.ev, toName, toEmail, eventId, meet },
      summary: `Create "${r.ev.title}", ${r.when}${meet ? ', with a Meet link,' : ''} and invite ${toName ? `${toName} <${toEmail}>` : toEmail}? Google Calendar will email them the invite from you. Reply yes.`,
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
    when: whenLabel(Date.parse(ev.start), ev.tz ?? 'UTC'),
    add_for_yourself: own,
    note: 'Confirm who was invited and when, in one line; a copy went to the user by BCC and replies go to them. Then add_for_yourself exactly.',
  }
}

/** Google Calendar connected: the guest goes on the event and Google emails the invite. */
async function confirmGcalInvite(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const ev = args.ev as CalEvent
  const toEmail = String(args.toEmail ?? '')
  const toName = typeof args.toName === 'string' ? args.toName : null
  const eventId = typeof args.eventId === 'string' && args.eventId ? args.eventId : null
  const invited = toName ? `${toName} <${toEmail}>` : toEmail
  try {
    let e = eventId ? await addAttendee(ctx.email, eventId, { email: toEmail, name: toName }) : await createEvent(ctx.email, ev, { attendees: [{ email: toEmail, name: toName }], meet: args.meet === true })
    if (eventId && args.meet === true && !e.meet) e = await addMeet(ctx.email, eventId)
    return {
      ok: true,
      invited,
      when: whenLabel(Date.parse(ev.start), ev.tz ?? 'UTC'),
      event_id: e.id,
      ...(e.meet ? { meet_link: e.meet } : {}),
      note: 'Confirm in one line: the event is on their Google Calendar and Google emailed the invite. Unless it has a Meet link, offer one (on yes: add_meet_link).',
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
            : name === 'delete_event' ? deleteEventTool(ctx, input)
              : name === 'move_event' ? moveEventTool(ctx, input)
                : undefined,
  confirm: { calendar_invite: confirmInvite, gcal_add: confirmGcalAdd, gcal_invite: confirmGcalInvite, gcal_delete: confirmDelete, gcal_move: confirmMove },
  prompt:
    '- Calendar: "add X to my calendar" -> add_to_calendar (with Google Calendar connected it is added at once; otherwise send ' +
    'its message with the links as they are). "Delete / move / add a Meet link to <event>" -> delete_event / move_event / ' +
    'add_meet_link with the event\'s title (or event_id from a tool result in this same turn); if several match, list them and ' +
    'ask which. "Delete it and make a new one at 3" is move_event. Inviting someone else -> invite_to_meeting with their email ' +
    '(give to_name: the saved email is looked up; ask only if none; meet true for a video link — one step creates the event, the Meet link and the invite). Never say you cannot delete or change events: you can, with Google Calendar connected. ' +
    '"I use Outlook / Apple / Google calendar" -> set_calendar_app. Times are wall-clock where the user is; never compute UTC offsets yourself.',
}
