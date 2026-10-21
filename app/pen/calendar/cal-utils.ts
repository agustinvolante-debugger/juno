// Calendar page helpers: dates in the browser's zone, the calendar palette, and the week grid's
// overlap layout. No React, no server imports.

import type { CSSProperties } from 'react'
import type { CalAccount, CalViewEvent } from '@/lib/pen/calendar-view'
import { foldName } from '@/lib/pen/speakers'

export const DAY_MS = 86_400_000
/** Height of one hour in the week grid, in px. */
export const HOUR_PX = 52
export const SNAP_MIN = 15

// ------------------------------------------------------------------------------------- dates

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
}
/** Weeks start on Monday (founder, 22 Oct: "Oct 19 – 25"). */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d)
  return addDays(s, -((s.getDay() + 6) % 7))
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
/** Local 'YYYY-MM-DD'. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function parseYmd(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
/** 'HH:MM' for an <input type="time">. */
export function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function withTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0)
}
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}
export function snap(min: number, step = SNAP_MIN): number {
  return Math.round(min / step) * step
}
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** An event's span as local Dates. All-day ends are exclusive dates; a missing end = +1h / +1 day. */
export function evSpan(e: Pick<CalViewEvent, 'start' | 'end' | 'allDay'>): { s: Date; e: Date } {
  if (e.allDay) {
    const s = parseYmd(e.start)
    const end = e.end ? parseYmd(e.end) : addDays(s, 1)
    return { s, e: end > s ? end : addDays(s, 1) }
  }
  const s = new Date(e.start)
  const end = e.end ? new Date(e.end) : new Date(s.getTime() + 3_600_000)
  return { s, e: end > s ? end : new Date(s.getTime() + 15 * 60_000) }
}

export function overlaps(a: { s: Date; e: Date }, from: Date, to: Date): boolean {
  return a.s < to && a.e > from
}

// ------------------------------------------------------------------------------------ palette

export type Hue = { base: string; ink: string; wash: string; line: string }

// Five calm hues that sit beside the app blue. Each `ink` holds 4.5:1+ on its own `wash`, so an
// event's title stays readable; `base` is for dots, bars and the drag ghost.
export const HUES: Hue[] = [
  { base: '#0066cc', ink: '#004c99', wash: '#e6f0fb', line: '#b5d3f3' }, // app blue (default)
  { base: '#0f8577', ink: '#0a5c52', wash: '#e2f3f0', line: '#a9dbd3' }, // teal
  { base: '#7a52cc', ink: '#56379e', wash: '#efeafb', line: '#cfc0f0' }, // violet
  { base: '#b8467e', ink: '#8a2b5c', wash: '#f9e8f0', line: '#ecbdd4' }, // rose
  { base: '#9a6a00', ink: '#6e4b00', wash: '#f8efd9', line: '#e6cf98' }, // ochre
]

/** One hue per calendar: the default keeps the app blue, the rest take the others in Settings order. */
export function huesFor(cals: CalAccount[]): Record<string, Hue> {
  const out: Record<string, Hue> = {}
  const def = cals.find((c) => c.isDefault)
  let i = def ? 1 : 0
  for (const c of cals) {
    if (def && c.key === def.key) out[c.key] = HUES[0]
    else out[c.key] = HUES[i++ % HUES.length]
  }
  return out
}

export function hueVars(h: Hue | undefined): CSSProperties {
  const x = h ?? HUES[0]
  return { ['--c' as string]: x.base, ['--c-ink' as string]: x.ink, ['--c-wash' as string]: x.wash, ['--c-line' as string]: x.line }
}

export function calLabel(c: CalAccount | undefined): string {
  if (!c) return ''
  return c.address || (c.provider === 'google' ? 'Google Calendar' : 'Outlook')
}

// ------------------------------------------------------------------------------------- layout

export type Placed = { ev: CalViewEvent; top: number; height: number; col: number; cols: number; startsBefore: boolean; endsAfter: boolean }

/** Timed events of one day, placed in side-by-side columns where they overlap. */
export function layoutDay(events: CalViewEvent[], day: Date): Placed[] {
  const d0 = startOfDay(day)
  const d1 = addDays(d0, 1)
  const items = events
    .filter((e) => !e.allDay)
    .map((ev) => ({ ev, sp: evSpan(ev) }))
    .filter((x) => overlaps(x.sp, d0, d1))
    .map((x) => {
      const s = x.sp.s < d0 ? d0 : x.sp.s
      const e = x.sp.e > d1 ? d1 : x.sp.e
      const sm = (s.getTime() - d0.getTime()) / 60_000
      const em = Math.max(sm + 20, (e.getTime() - d0.getTime()) / 60_000)
      return { ev: x.ev, sm, em, startsBefore: x.sp.s < d0, endsAfter: x.sp.e > d1 }
    })
    .sort((a, b) => a.sm - b.sm || b.em - a.em)

  const out: Placed[] = []
  let cluster: { it: (typeof items)[number]; col: number }[] = []
  let colEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = colEnds.length || 1
    for (const c of cluster) {
      out.push({
        ev: c.it.ev,
        top: (c.it.sm / 60) * HOUR_PX,
        height: ((c.it.em - c.it.sm) / 60) * HOUR_PX,
        col: c.col,
        cols,
        startsBefore: c.it.startsBefore,
        endsAfter: c.it.endsAfter,
      })
    }
    cluster = []
    colEnds = []
  }
  for (const it of items) {
    if (it.sm >= clusterEnd) {
      flush()
      clusterEnd = -1
    }
    let col = colEnds.findIndex((end) => end <= it.sm)
    if (col < 0) {
      col = colEnds.length
      colEnds.push(it.em)
    } else colEnds[col] = it.em
    cluster.push({ it, col })
    clusterEnd = Math.max(clusterEnd, it.em)
  }
  flush()
  return out
}

/** Emails out of free text ("ana@x.com, Bo <bo@y.io>"). */
export function parseEmails(s: string): string[] {
  return Array.from(new Set((s.match(/[^\s,;<>()"']+@[^\s,;<>()"']+\.[^\s,;<>()"']+/g) ?? []).map((x) => x.toLowerCase())))
}

// ------------------------------------------------------------------------- guest suggestions

/**
 * Saved people for what is typed in the guest box, best first: accent- and case-blind, on the
 * full name ("titi" finds Chris "titi" Dyas, "martin" finds Martín) and on the email. The name
 * starting with it beats a word in it starting with it beats it anywhere; ties go to whoever has
 * the most calls, then the most recent. People with an email come before those without.
 */
export function suggestPeople<P extends { name: string; email: string | null; calls: number; lastAt: string | null }>(
  people: P[],
  typed: string,
  skip: Set<string>,
  max = 6,
): P[] {
  const q = foldName(typed).replace(/\s+/g, ' ')
  if (!q) return []
  const rank = (p: P): number => {
    const name = foldName(p.name).replace(/\s+/g, ' ')
    if (name.startsWith(q)) return 0
    // Word starts: after a space, a quote, a bracket or a hyphen.
    if (name.split(/[^\p{L}\p{N}]+/u).some((w, i) => i > 0 && w.startsWith(q)) || name.includes(` ${q}`)) return 1
    if (name.includes(q) || (p.email ?? '').toLowerCase().includes(q)) return 2
    return -1
  }
  return people
    .filter((p) => !(p.email && skip.has(p.email.toLowerCase())))
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r >= 0)
    .sort(
      (a, b) =>
        Number(!a.p.email) - Number(!b.p.email) ||
        a.r - b.r ||
        b.p.calls - a.p.calls ||
        (b.p.lastAt ?? '').localeCompare(a.p.lastAt ?? '') ||
        a.p.name.localeCompare(b.p.name),
    )
    .slice(0, max)
    .map((x) => x.p)
}
