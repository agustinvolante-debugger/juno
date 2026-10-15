// Calendar (plan F1): "add lunch with Chris Tuesday 1pm" -> a tap-to-add link for the user's own
// calendar; "send Chris an invite" -> an emailed .ics invite, after a yes. No calendar
// connection yet (F2 is Google Calendar OAuth); lib/pen/calendar.ts builds the links and invites.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { askConfirm } from '../confirm'
import { str, type ToolModule } from './types'
import { zoneOf } from './timezone'
import { calendarLinks, sendInvite, type CalEvent } from '../../calendar'
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
      'Make a link that adds an event to the user\'s own calendar (Apple Calendar on iPhone, Google Calendar on Android, plus a Google Calendar web link). ' +
      'Nothing is added until they tap it.',
    input_schema: { type: 'object', properties: { ...EVENT_PROPS }, required: ['title', 'start_local'], additionalProperties: false },
  },
  {
    name: 'invite_to_meeting',
    description:
      'Email someone else a calendar invite from the user (they are the organizer; replies go to them). Needs the other person\'s email: ' +
      'ask for it if you do not have it. Asks the user to confirm first.',
    input_schema: {
      type: 'object',
      properties: { ...EVENT_PROPS, to_name: { type: 'string' }, to_email: { type: 'string' } },
      required: ['title', 'start_local', 'to_email'],
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

async function addToCalendar(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const r = await eventFrom(ctx, input)
  if ('error' in r) return r
  const links = calendarLinks(r.ev)
  return {
    ok: true,
    when: r.when,
    message: `Tap to add it, then come back: ${links.ics}  (Google Calendar: ${links.google})`,
    note: 'Say the event and when in one line, then the message exactly (translate the words, never the links). Nothing is in their calendar until they tap.',
  }
}

async function inviteToMeeting(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const toEmail = str(input, 'to_email').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return { error: 'need the other person\'s email address; ask the user for it' }
  const r = await eventFrom(ctx, input)
  if ('error' in r) return r
  const toName = str(input, 'to_name') || null
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

export const calendarModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) =>
    name === 'add_to_calendar' ? addToCalendar(ctx, input) : name === 'invite_to_meeting' ? inviteToMeeting(ctx, input) : undefined,
  confirm: { calendar_invite: confirmInvite },
  prompt:
    '- Calendar: "add X to my calendar" -> add_to_calendar; send its message with the links as they are (Juno cannot add ' +
    'it for them yet). Inviting someone else -> invite_to_meeting with their email (ask for it if you do not have it). ' +
    'Times are wall-clock where the user is; never compute UTC offsets yourself.',
}
