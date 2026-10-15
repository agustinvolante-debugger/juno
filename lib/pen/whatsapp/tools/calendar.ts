// Calendar (plan F1): "add lunch with Chris Tuesday 1pm" -> a tap-to-add link for the user's own
// calendar; "send Chris an invite" -> an emailed .ics invite, after a yes. lib/pen/calendar.ts
// builds the links and invites.
//
// With Google Calendar connected (plan F2, lib/pen/google-calendar.ts) the same tools write to it
// instead, always after a yes: add_to_calendar asks "Add … to your Google Calendar?", and the
// invite becomes a guest on the event (Google emails them). add_meet_link puts a Meet link on an
// event Juno added, after the user's yes to that offer.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { askConfirm } from '../confirm'
import { str, type ToolModule } from './types'
import { zoneOf } from './timezone'
import { calendarLinks, sendInvite, type CalEvent } from '../../calendar'
import { addAttendee, addMeet, createEvent, gcalConnected } from '../../google-calendar'
import { localToUtc, validZone, whenLabel } from '../../timezone'

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
      'Add an event to the user\'s own calendar. With Google Calendar connected it asks the user first, then adds it there on their yes; ' +
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
      'Email someone else a calendar invite from the user (they are the organizer; replies go to them). Needs the other person\'s email: ' +
      'ask for it if you do not have it. Asks the user to confirm first.',
    input_schema: {
      type: 'object',
      properties: {
        ...EVENT_PROPS,
        to_name: { type: 'string' },
        to_email: { type: 'string' },
        event_id: { type: 'string', description: 'The Google Calendar event id when inviting them to an event Juno just added (from an earlier tool result). Omit otherwise.' },
      },
      required: ['title', 'start_local', 'to_email'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_meet_link',
    description: 'Put a Google Meet link on a Google Calendar event Juno added, after the user said yes to that offer. event_id from the earlier tool result.',
    input_schema: { type: 'object', properties: { event_id: { type: 'string' } }, required: ['event_id'], additionalProperties: false },
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
  if (await gcalConnected(ctx.email)) {
    const meet = input.meet === true
    return askConfirm(ctx, {
      kind: 'gcal_add',
      args: { ev: r.ev, meet },
      summary: `Add "${r.ev.title}", ${r.when}, to your Google Calendar${meet ? ' with a Meet link' : ''}? Reply yes.`,
    })
  }
  const links = calendarLinks(r.ev)
  return {
    ok: true,
    when: r.when,
    message: `Tap to add it, then come back: ${links.ics}  (Google Calendar: ${links.google})`,
    note: 'Say the event and when in one line, then the message exactly (translate the words, never the links). Nothing is in their calendar until they tap.',
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
    const links = calendarLinks(ev)
    return {
      ok: false,
      google_calendar_error: (e as Error).message.slice(0, 200),
      message: `Tap to add it, then come back: ${links.ics}  (Google Calendar: ${links.google})`,
      note: 'Say in one line it could not be added to Google Calendar directly, then give the message exactly.',
    }
  }
}

async function addMeetLink(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const id = str(input, 'event_id')
  if (!id) return { error: 'need the event_id from when the event was added' }
  if (!(await gcalConnected(ctx.email))) return { error: 'Google Calendar is not connected' }
  try {
    const e = await addMeet(ctx.email, id)
    return e.meet ? { ok: true, meet_link: e.meet, note: 'Give the Meet link in one line; it is on the calendar event too.' } : { error: 'Google did not create a Meet link for that event' }
  } catch (e) {
    return { error: (e as Error).message.slice(0, 200) }
  }
}

async function inviteToMeeting(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const toEmail = str(input, 'to_email').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return { error: 'need the other person\'s email address; ask the user for it' }
  const r = await eventFrom(ctx, input)
  if ('error' in r) return r
  const toName = str(input, 'to_name') || null
  if (await gcalConnected(ctx.email)) {
    const eventId = str(input, 'event_id') || null
    return askConfirm(ctx, {
      kind: 'gcal_invite',
      args: { ev: r.ev, toName, toEmail, eventId },
      summary: `Invite ${toName ? `${toName} <${toEmail}>` : toEmail} to "${r.ev.title}", ${r.when}? Google Calendar will email them the invite from you. Reply yes.`,
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
  const links = calendarLinks(ev)
  return {
    ok: true,
    invited: toName ? `${toName} <${toEmail}>` : toEmail,
    when: whenLabel(Date.parse(ev.start), ev.tz ?? 'UTC'),
    add_for_yourself: `Tap to add it, then come back: ${links.ics}  (Google Calendar: ${links.google})`,
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
    const e = eventId ? await addAttendee(ctx.email, eventId, { email: toEmail, name: toName }) : await createEvent(ctx.email, ev, { attendees: [{ email: toEmail, name: toName }] })
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
    name === 'add_to_calendar'
      ? addToCalendar(ctx, input)
      : name === 'invite_to_meeting'
        ? inviteToMeeting(ctx, input)
        : name === 'add_meet_link'
          ? addMeetLink(ctx, input)
          : undefined,
  confirm: { calendar_invite: confirmInvite, gcal_add: confirmGcalAdd, gcal_invite: confirmGcalInvite },
  prompt:
    '- Calendar: "add X to my calendar" -> add_to_calendar. If it returns ask_user (Google Calendar is connected), ask exactly ' +
    'that; otherwise send its message with the links as they are. Inviting someone else -> invite_to_meeting with their email ' +
    '(ask for it if you do not have it; pass event_id when it is for an event Juno just added). Offer a Meet link only after an ' +
    'event was added to Google Calendar; on yes, add_meet_link. Times are wall-clock where the user is; never compute UTC offsets yourself.',
}
