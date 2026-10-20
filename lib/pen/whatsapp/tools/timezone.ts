// set_timezone: "I'm in SF until Friday", "I live in Santiago" (plan E). The zone resolution
// itself is lib/pen/timezone.ts.
//
// Every tool that sets a clock time (reminders, calendar events, offers) adds timeFields to its
// result: the local time and the place ("Santiago time"), so the reply always says where, and,
// when Juno is not sure the user is still there (zoneFreshness), a zone_check question for the
// same reply. Asking is never a step before the action: it is done in the zone Juno has. If the
// answer is another place, set_timezone moves what was just set to the same local time there.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { getPending, setPending, type Pending } from '../confirm'
import { str, type ToolModule } from './types'
import {
  localIso, localToUtc, localWhen, markZoneChecked, setSaidZone, userZone, validZone, zoneCheckQuestion, zoneFreshness, zonePlace, zoneTimeLabel, type Zone,
} from '../../timezone'
import { getProfileRaw } from '../../profile'
import { moveReminder } from '../../reminders'
import { moveByRef } from '../../calendars'
import { calendarPref, linksMessage } from '../../calendar-pref'
import type { CalEvent } from '../../calendar'

/** The user's zone for this turn: the one runAgent resolved, else looked up now. */
export async function zoneOf(ctx: Ctx): Promise<Zone> {
  if (!ctx.zone) ctx.zone = await userZone(ctx.email, ctx.phone).catch((): Zone => ({ tz: null, source: 'none', sure: false }))
  return ctx.zone
}

/** Something set this turn at a local time in the user's zone, kept with the zone check so a
 *  "no, I'm in SF" can move it. Events with guests are not kept: moving them emails the guests. */
export type ZoneItem =
  | { kind: 'reminder'; id: string; local: string; text: string }
  | { kind: 'event'; id: string; local: string; title: string }
  | { kind: 'link'; local: string; ev: CalEvent }

/** Per turn: the check question if one was added (null: decided, none), and what was set. */
export type ZoneTurn = { question?: string | null; tz?: string; items: ZoneItem[] }

/**
 * What a time tool adds to its result: local_time + zone_label always; zone_check the first time
 * in a turn that Juno is unsure (recorded as asked at once: silence means yes). A zone named for
 * this one thing ("3pm New York time") is not where the user is: label only, no check. Neither
 * is a time that doesn't depend on the zone ("in 20 minutes").
 */
export async function timeFields(ctx: Ctx, tz: string, at: Date | number | string, item?: ZoneItem, o: { check?: boolean } = {}): Promise<Record<string, string>> {
  const out: Record<string, string> = { local_time: localWhen(at, tz, ctx.lang), zone_label: zoneTimeLabel(tz, ctx.lang) }
  // check false: the time doesn't depend on the zone ("in 20 minutes").
  if (o.check === false || (await zoneOf(ctx)).tz !== tz) return out
  const turn = (ctx.zoneTurn ??= { items: [] })
  if (item) turn.items.push(item)
  if (turn.question === undefined) {
    const p = (await getProfileRaw(ctx.email).catch(() => null)) ?? {}
    const f = zoneFreshness(p, ctx.phone)
    turn.question = f.needsCheck && f.zone.tz === tz ? zoneCheckQuestion(tz, ctx.lang) : null
    if (turn.question) {
      turn.tz = tz
      await markZoneChecked(ctx.email, tz).catch((e) => console.warn(`pen zone check: ${(e as Error).message}`))
      return { ...out, zone_check: turn.question }
    }
  }
  return out
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The reply already asks it: the place, then a "?" within a few words. */
export function asksZone(text: string, tz: string): boolean {
  const t = fold(text)
  return (['en', 'es', 'pt'] as const).some((l) => {
    const place = fold(zonePlace(tz, l)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`${place}[^?.!\\n]{0,20}\\?`).test(t)
  })
}

/**
 * End of a turn that added a zone check: it becomes the question waiting for an answer
 * (confirm.ts), unless the turn asked a real yes/no (that is the latest question and wins).
 * Returns the reply with the question added if the model left it out.
 */
export async function finishZoneTurn(ctx: Ctx, text: string): Promise<string> {
  const t = ctx.zoneTurn
  if (!t?.question || !t.tz || ctx.askedNow) return text
  await setPending(ctx.email, {
    kind: 'zone_check',
    args: { tz: t.tz, items: t.items },
    summary: t.question,
    msgId: ctx.msgId,
    createdAt: new Date().toISOString(),
  }).catch((e) => console.warn(`pen zone check pending: ${(e as Error).message}`))
  ctx.pendingTouched = true
  if (asksZone(text, t.tz)) return text
  const q = t.question.replace(/^(¿?)(\p{L})/u, (_, a: string, b: string) => a + b.toUpperCase())
  return `${text}${text ? '\n\n' : ''}${q}`
}

/** The system-prompt line while "still in Santiago?" waits for an answer. */
export function zoneAskLine(p: Pending): string {
  const items = (p.args.items ?? []) as ZoneItem[]
  const what = items.map((i) => (i.kind === 'reminder' ? `reminder "${i.text}"` : i.kind === 'event' ? `calendar event "${i.title}"` : `calendar link "${i.ev.title}"`) + ` at ${i.local} local`)
  return (
    `\nYou asked "${p.summary}" in your last message${what.length ? `, after setting: ${what.join('; ')}` : ''}. ` +
    'If they now say they are somewhere else ("no, SF", "estoy en Lima"), call set_timezone with that zone: it moves those to the ' +
    'same local clock time there and returns the new times; confirm in one line with the new place name. Otherwise carry on; ' +
    'never ask it again.\n'
  )
}

/** "No, I'm in SF" after the check: what was just set keeps its local clock time, in the new zone. */
async function rezone(ctx: Ctx, tz: string): Promise<unknown[]> {
  const asked = await getPending(ctx.email).catch(() => null)
  if (!asked || asked.kind !== 'zone_check' || asked.msgId === ctx.msgId) return []
  ctx.pendingTouched = true
  await setPending(ctx.email, null)
  const moved: unknown[] = []
  for (const i of (asked.args.items ?? []) as ZoneItem[]) {
    const at = localToUtc(i.local, tz)
    if (!at || at.getTime() < Date.now() + 30_000) {
      moved.push({ what: i.kind === 'reminder' ? i.text : i.kind === 'event' ? i.title : i.ev.title, error: 'that local time has already passed there; not moved' })
      continue
    }
    const when = { local_time: localWhen(at, tz, ctx.lang), zone_label: zoneTimeLabel(tz, ctx.lang) }
    try {
      if (i.kind === 'reminder') {
        moved.push((await moveReminder(ctx.email, i.id, at)) ? { reminder: i.text, ...when } : { reminder: i.text, error: 'already sent or cancelled' })
      } else if (i.kind === 'event') {
        await moveByRef(ctx.email, i.id, at.toISOString(), tz)
        moved.push({ event: i.title, ...when })
      } else {
        // A tap-to-add link can't be changed once sent: a new one, for the new time.
        const { message } = linksMessage({ ...i.ev, start: at.toISOString(), tz }, await calendarPref(ctx.email))
        moved.push({ event: i.ev.title, ...when, new_link_message: message })
      }
    } catch (e) {
      moved.push({ what: i.kind === 'reminder' ? i.text : i.kind === 'event' ? i.title : i.ev.title, error: (e as Error).message.slice(0, 200) })
    }
  }
  return moved
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'set_timezone',
    description:
      'Remember the time zone the user is in, when they say where they are or answer which city they are in. ' +
      'For a trip ("in SF until Friday") pass until; afterwards their usual zone comes back by itself. ' +
      'Right after Juno asked "still in <place>?", it also moves what was just set to the same local time in the new zone.',
    input_schema: {
      type: 'object',
      properties: {
        zone: { type: 'string', description: 'IANA zone for the place they named, e.g. America/Los_Angeles for San Francisco, America/Santiago for Chile.' },
        until: { type: 'string', description: 'Last day there, YYYY-MM-DD, for a temporary stay. Omit when they live there or did not say.' },
      },
      required: ['zone'],
      additionalProperties: false,
    },
  },
]

export async function setTimezone(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const tz = str(input, 'zone')
  if (!validZone(tz)) return { error: `"${tz}" is not an IANA time zone; use one like America/Los_Angeles` }
  const day = str(input, 'until')
  let until: string | null = null
  if (day) {
    if (!/^\d{4}-\d\d-\d\d$/.test(day)) return { error: 'until must be YYYY-MM-DD' }
    // The end of that day where they are.
    const end = localToUtc(`${day}T23:59`, tz)
    if (!end || end.getTime() < Date.now()) return { error: 'that end date has already passed' }
    until = end.toISOString()
  }
  await setSaidZone(ctx.email, tz, until)
  ctx.zone = { tz, source: 'chat', sure: true, ...(until ? { until } : {}) }
  // Said this turn: a check added earlier in it is answered already (and later tools find the
  // zone fresh).
  if (ctx.zoneTurn?.question) ctx.zoneTurn.question = null
  const moved = await rezone(ctx, tz)
  return {
    ok: true,
    zone: tz,
    zone_label: zoneTimeLabel(tz, ctx.lang),
    ...(day ? { until: day } : {}),
    ...(moved.length ? { moved } : {}),
    note: moved.length
      ? 'Confirm in one or two lines with the new place name: the zone, and each thing moved with its new local_time and zone_label ' +
        '(give any new_link_message exactly; the old link is for the old time).'
      : 'Confirm in one line with the place name, e.g. "Got it, I\'ll use Pacific time" (plus "until Friday" when there is an end date).',
  }
}

export const timezoneModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => (name === 'set_timezone' ? setTimezone(ctx, input) : undefined),
  prompt:
    '- Time zone: when the user says where they are ("I\'m in SF until Friday", "I live in Santiago") or answers ' +
    'which city they are in, call set_timezone (until = their last day there, for a trip) and confirm in one line. ' +
    'If the timezone above is unknown, ask which city first, only when a clock time matters.\n' +
    '- Whenever you confirm or propose a clock time (reminder, calendar event, invite, offer), say it with the place, using ' +
    'the tool\'s local_time and zone_label: "tomorrow 10:00 am, Santiago time" / "mañana 10:00, hora de Santiago" / "amanhã ' +
    '10:00, horário de São Paulo" (zone_label in the language of your reply). Never "GMT-3" or a zone id.\n' +
    '- If a tool result has zone_check, the action is done anyway: end the same reply with that question, once, in the ' +
    'language of your reply, e.g. "… Santiago time — still in Santiago?". Don\'t explain why you ask.',
}
