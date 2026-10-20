// Changing events from the Calendar page (22 Oct): the pure half shared by google-calendar.ts and
// outlook-graph.ts, for tests (.pentest/calendar-page-unit.mts). A new event can carry an explicit
// end or be all-day; a change (EventPatch) names only the fields that change. No network, no DB.

import type { CalEvent } from './calendar'

/**
 * A new event from the Calendar page (22 Oct): a CalEvent plus an explicit `end` (ISO, overrides
 * durationMin, so a timed event can run past a day), or an all-day span: allDay with start/end as
 * 'YYYY-MM-DD' (end exclusive, like Google's; missing = one day).
 */
export type NewEvent = CalEvent & { end?: string; allDay?: boolean }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
export const isDay = (s: string | null | undefined): s is string => typeof s === 'string' && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
/** The day after 'YYYY-MM-DD'. */
export const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** An all-day span, checked: [start, end) in days, end after start (default the next day). */
export function daySpan(start: string, end?: string | null): { start: string; end: string } {
  if (!isDay(start)) throw new Error('an all-day event needs a date (YYYY-MM-DD)')
  const e = isDay(end) && end > start ? end : nextDay(start)
  return { start, end: e }
}

/** A timed event's length in ms: `end` when given (must be after start), else durationMin (5 min to a day, default 30). */
export function timedLen(startMs: number, ev: { end?: string; durationMin?: number }): number {
  const endMs = ev.end ? Date.parse(ev.end) : NaN
  if (!Number.isNaN(endMs)) {
    if (endMs <= startMs) throw new Error('the end must be after the start')
    return endMs - startMs
  }
  return Math.min(24 * 60, Math.max(5, Math.round(ev.durationMin ?? 30))) * 60000
}

/**
 * A change from the Calendar page (22 Oct). Only the fields given change; start and end travel
 * together (the route fills the missing one from the event), both 'YYYY-MM-DD' for all-day (end
 * exclusive) or both ISO instants. null/'' location or description clears it.
 */
export type EventPatch = { title?: string; start?: string; end?: string; location?: string | null; description?: string | null; tz?: string }

/** An event's notes as short plain text: Google's description can be HTML (<br>, links). */
export function plainNotes(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1000)
}
