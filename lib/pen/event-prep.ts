// Conference prep for the Juno Pen (21 Oct, behind PEN_EVENT_PREP=1, off by default).
//
// From the user's calendars (lib/pen/calendars.ts upcomingAll), the conference-like events in the
// next ~36 h: all-day, or timed and at least 3 hours, or titled like one (conference, summit,
// expo, congress / congreso, feria, fair, trade show, convention / convención, conferência,
// simpósio / symposium, forum / fórum; whole words, accents ignored). Not declined. Length alone
// skips the usual noise (birthdays, holidays, out-of-office, focus blocks, week-long all-day
// spans); a conference word always counts.
//
// Three uses:
//   · the message (lib/pen/proactive.ts kind 'pen_event_prep'): the evening before, 18:00–20:00
//     local, once per event: "Tomorrow: *Sales Summit*. Plug in your Juno Pen…";
//   · the pen's settings (GET /api/pen/pen-settings): from 18:00 the day before until the event
//     ends, what goes onto the pen is the saved settings with CONFERENCE_PRESET over them; the
//     saved ones stay untouched in the profile and come back by themselves after the event;
//   · recordings made during one are treated as event-like (lib/pen/conference.ts isEventLike),
//     so they get split into conversations.
// Only for users who own a pen (an upload named like the pen's files: proactive.ts lastPenUploadAt).
//
// Pure helpers first (tests: .pentest/proactive-unit.mts), the calendar reads at the bottom.

import type { UpcomingEvent } from './google-calendar'
import type { PenPreset, PenSettings } from './pen-device'
import { withDefaults } from './pen-settings'
import { localToUtc } from './timezone'
import type { Lang } from './currency'

export const eventPrepOn = () => process.env.PEN_EVENT_PREP === '1'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** How far ahead the calendar is read for this. */
export const PREP_HORIZON_MS = 36 * HOUR
/** A timed event at least this long counts on its length alone. */
export const LONG_EVENT_MS = 3 * HOUR
/** An all-day span longer than this is a holiday or a trip, not an event (unless titled like one). */
const MAX_ALLDAY_DAYS = 5
/** The message's slot, local minutes: 18:00 to the start of quiet hours (20:00). */
export const PREP_FROM_MIN = 18 * 60
export const PREP_TO_MIN = 20 * 60

/** What goes onto the pen for a big room: far voices, always recording, best quality, hour files. */
export const CONFERENCE_PRESET: Pick<PenSettings, 'sensitivity' | 'voiceActivated' | 'quality' | 'splitMin'> = {
  sensitivity: 'soft',
  voiceActivated: false,
  quality: 'high',
  splitMin: 60,
}

/** Lower case, accents off (é → e, ç → c), so "Conferência" and "conferencia" match alike. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Folded already. \b is ASCII-only, which is why the title is folded first.
// "feria" singular only: folded, Portuguese "férias" (holidays) is "ferias".
const CONF_WORDS = /\b(conferences?|conferencias?|summits?|cumbres?|expos?|congress(es)?|congresos?|congressos?|feria|fairs?|trade ?shows?|tradeshows?|conventions?|convencion(es)?|convencoes|convencao|simposios?|symposi(um|a|ums)|forums?|foros?|foruns)\b/
// Long or all-day, but not an event. Folded. Only checked for events that match on length.
const NOT_EVENT = /\b(birthday|cumpleanos|aniversario|holiday|feriado|vacation|vacaciones|ferias|ooo|out of (the )?office|fuera de (la )?oficina|fora do escritorio|pto|day off|dia libre|folga|focus|deep work|blocked?|bloqueado|busy|ocupado|hold|commute|travel|viaje|viagem|flight|vuelo|voo|home|casa|office|oficina|escritorio|working location|wfh|remote)\b/

/** Is this calendar event conference-like? Pure. */
export function isConferenceLike(e: Pick<UpcomingEvent, 'title' | 'start' | 'end' | 'allDay' | 'declined'>): boolean {
  if (e.declined) return false
  const title = fold(e.title ?? '').trim()
  if (!title) return false
  if (CONF_WORDS.test(title)) return true
  if (NOT_EVENT.test(title)) return false
  if (e.allDay) {
    const days = e.end ? (Date.parse(`${e.end.slice(0, 10)}T00:00:00Z`) - Date.parse(`${e.start.slice(0, 10)}T00:00:00Z`)) / DAY : 1
    return Number.isFinite(days) && days >= 1 && days <= MAX_ALLDAY_DAYS
  }
  const s = Date.parse(e.start)
  const end = e.end ? Date.parse(e.end) : NaN
  return Number.isFinite(s) && Number.isFinite(end) && end - s >= LONG_EVENT_MS
}

/* ------------------------------------------------------------- time zones */

/** Local calendar date and minutes past midnight of `at` in `tz` (as proactive.ts localParts). */
export function localDay(at: Date, tz: string): { date: string; minutes: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

/** The instant that is `date` (YYYY-MM-DD) at `minutes` past midnight in `tz`. */
export function atLocal(date: string, minutes: number, tz: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const wall = new Date(Date.UTC(y, m - 1, d, 0, minutes)).toISOString().slice(0, 16)
  return (localToUtc(wall, tz) as Date).getTime()
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/* ------------------------------------------------------------- detector */

export type Conference = {
  /** Once-per-event key (pen_proactive_log ref): calendar uid or id, and its start day. */
  ref: string
  title: string
  /** ISO instants; an all-day event runs from local midnight to local midnight after its last day. */
  start: string
  end: string
  allDay: boolean
  /** Local start date in the user's zone. */
  day: string
}

/** Start and end of an event as instants in `tz`. Null when unreadable. */
export function spanOf(e: Pick<UpcomingEvent, 'start' | 'end' | 'allDay'>, tz: string): { start: number; end: number } | null {
  if (e.allDay) {
    const d = e.start.slice(0, 10)
    if (!/^\d{4}-\d\d-\d\d$/.test(d)) return null
    const endDate = e.end && /^\d{4}-\d\d-\d\d/.test(e.end) ? e.end.slice(0, 10) : addDays(d, 1)
    const start = atLocal(d, 0, tz)
    const end = atLocal(endDate > d ? endDate : addDays(d, 1), 0, tz)
    return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null
  }
  const start = Date.parse(e.start)
  if (!Number.isFinite(start)) return null
  const end = e.end ? Date.parse(e.end) : NaN
  return { start, end: Number.isFinite(end) && end > start ? end : start + HOUR }
}

/** A title as one plain line (templates refuse newlines, tabs and runs of spaces), at most 60 chars. */
export function cleanTitle(t: string): string {
  const s = (t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/[*_~`]/g, '').trim()
  return s.length > 60 ? `${s.slice(0, 59).trimEnd()}…` : s
}

/**
 * The conference-like events that haven't ended and start within `horizon` of now, soonest first,
 * the same event once (two calendars). Pure.
 */
export function detectConferences(events: UpcomingEvent[], now: Date, tz: string, horizon = PREP_HORIZON_MS): Conference[] {
  const t = now.getTime()
  const out: Conference[] = []
  const seen = new Set<string>()
  for (const e of events) {
    if (!isConferenceLike(e)) continue
    const span = spanOf(e, tz)
    if (!span || span.end <= t || span.start >= t + horizon) continue
    const day = e.allDay ? e.start.slice(0, 10) : localDay(new Date(span.start), tz).date
    const ref = `${String(e.uid || e.id).slice(0, 160)}:${day}`
    if (seen.has(ref)) continue
    seen.add(ref)
    out.push({ ref, title: cleanTitle(e.title), start: new Date(span.start).toISOString(), end: new Date(span.end).toISOString(), allDay: e.allDay, day })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** When the pen set-up for `c` starts: 18:00 local the day before it starts. */
export function prepFrom(c: Conference, tz: string): number {
  return atLocal(addDays(c.day, -1), PREP_FROM_MIN, tz)
}

/** The conference the pen should be set up for right now (upcoming from 18:00 the day before, or on), or null. Pure. */
export function activeConference(confs: Conference[], now: Date, tz: string): Conference | null {
  const t = now.getTime()
  return confs.find((c) => t >= prepFrom(c, tz) && t < Date.parse(c.end)) ?? null
}

/**
 * The message is due for this conference: it starts tomorrow (local), and it's 18:00–20:00 now.
 * Pure. Once per event is the log's job (ref = c.ref).
 */
export function prepMessageDue(confs: Conference[], now: Date, tz: string): Conference | null {
  const { date, minutes } = localDay(now, tz)
  if (minutes < PREP_FROM_MIN || minutes >= PREP_TO_MIN) return null
  const tomorrow = addDays(date, 1)
  return confs.find((c) => c.day === tomorrow && Date.parse(c.start) > now.getTime()) ?? null
}

export function presetOf(c: Conference | null): PenPreset | null {
  return c ? { kind: 'conference', event: c.title, start: c.start, end: c.end } : null
}

/** What to write onto the pen now: the saved settings, with the conference set-up over them while one is on. Pure. */
export function effectiveSettings(saved: unknown, preset: PenPreset | null): PenSettings {
  const s = withDefaults(saved)
  return preset ? { ...s, ...CONFERENCE_PRESET } : s
}

/* ----------------------------------------------------------------- copy */

export const PREP_COPY: Record<Lang, (event: string) => string> = {
  en: (e) => `Tomorrow: *${e}*. Plug in your Juno Pen and open Juno tonight, and I'll set it up for a big room.`,
  es: (e) => `Mañana: *${e}*. Conecta tu Juno Pen y abre Juno esta noche, y lo dejo listo para una sala grande.`,
  pt: (e) => `Amanhã: *${e}*. Conecte sua Juno Pen e abra o Juno hoje à noite, que eu deixo ela pronta para uma sala grande.`,
}

/* ------------------------------------------------------- calendar reads */

/** The user's conferences from now (every connected calendar). [] with no calendar or on any failure. */
export async function upcomingConferences(email: string, now: Date, tz: string): Promise<Conference[]> {
  try {
    const { anyCalendar, upcomingAll } = await import('./calendars')
    if (!(await anyCalendar(email))) return []
    return detectConferences(await upcomingAll(email, 2, now), now, tz)
  } catch (e) {
    console.warn(`pen event prep: calendar for ${email}: ${(e as Error).message}`)
    return []
  }
}

/**
 * Did any part of [from, to) fall inside a conference on the user's calendars? For recordings
 * (conference.ts isEventLike). False with no calendar or on any failure.
 */
export async function duringConference(email: string, from: Date, to: Date, tz: string): Promise<boolean> {
  try {
    const { anyCalendar, eventsBetween } = await import('./calendars')
    if (!(await anyCalendar(email))) return false
    // A day either side: an all-day event's span depends on the zone, and a timed one may have
    // started hours before the recording.
    const r = await eventsBetween(email, new Date(from.getTime() - DAY), new Date(to.getTime() + DAY))
    return overlapsConference(r.events, from.getTime(), to.getTime(), tz)
  } catch (e) {
    console.warn(`pen event prep: recording check for ${email}: ${(e as Error).message}`)
    return false
  }
}

/** Pure half of duringConference. */
export function overlapsConference(events: UpcomingEvent[], from: number, to: number, tz: string): boolean {
  return events.some((e) => {
    if (!isConferenceLike(e)) return false
    const s = spanOf(e, tz)
    return !!s && s.start < to && s.end > from
  })
}
