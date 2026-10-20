// The Calendar page's server decisions (22 Oct), pure, for tests (.pentest/calendar-page-unit.mts):
// the /api/pen/calendar routes do the reading and writing, this file decides. No network, no DB.
//
//   · toViewEvent: a merged calendar event → what the page shows (lib/pen/calendar-view.ts). It can
//     be changed here when the user organised it, nobody did, or the organiser is one of their own
//     connected addresses; it has a brief when it is upcoming, timed, with guests and not declined.
//   · changeGate: the one place that says no. An event the user didn't organise → 403 readOnly;
//     a change that would email guests without confirm → 409 needsConfirm (the page asks first).
//   · datedTodos: the user's own to-dos with a due date on the days shown (the Home rule from
//     lib/pen/proactive.ts dueOn: labels used only when they line up with the actions).
//   · providerError: what a Google / Microsoft failure becomes for the browser.

import type { UpcomingEvent } from './google-calendar'
import type { CalBrief, CalTodo, CalViewEvent } from './calendar-view'
import { eventRef } from './calendar-merge'
import { isDay } from './calendar-edit'
import { isMine, type ActionMeta } from './todo-labels'

export const MAX_SPAN_DAYS = 42

/** ?from=&to= → the instants, or why not (bad dates, to ≤ from, more than six weeks). */
export function parseRange(from: string | null, to: string | null): { from: Date; to: Date } | { error: string } {
  const f = from ? Date.parse(from) : NaN
  const t = to ? Date.parse(to) : NaN
  if (Number.isNaN(f) || Number.isNaN(t)) return { error: 'from and to must be dates' }
  if (t <= f) return { error: 'to must be after from' }
  if (t - f > MAX_SPAN_DAYS * 86_400_000) return { error: `at most ${MAX_SPAN_DAYS} days at a time` }
  return { from: new Date(f), to: new Date(t) }
}

/** The user's own addresses: their sign-in email and every connected calendar's. */
export function ownAddresses(email: string, cals: { address: string | null; key: string }[]): Set<string> {
  const s = new Set<string>([email.toLowerCase()])
  for (const c of cals) {
    if (c.address) s.add(c.address.toLowerCase())
    if (c.key.includes('@')) s.add(c.key.toLowerCase())
  }
  return s
}

export function isEditable(e: Pick<UpcomingEvent, 'organizerSelf' | 'organizer'>, own: Set<string>): boolean {
  return Boolean(e.organizerSelf) || !e.organizer || own.has(e.organizer.email.toLowerCase())
}

export function toViewEvent(e: UpcomingEvent, o: { own: Set<string>; now?: Date; recording?: { id: string; title: string } | null }): CalViewEvent {
  const now = (o.now ?? new Date()).getTime()
  const startMs = Date.parse(e.start)
  return {
    ref: eventRef(e.id, e.cal),
    cal: e.cal ?? '',
    cals: e.cals?.length ? e.cals : e.cal ? [e.cal] : [],
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    location: e.location,
    description: e.description ?? null,
    meet: e.meet,
    link: e.link,
    declined: e.declined,
    guests: e.others.map((g) => ({ email: g.email, name: g.name })),
    organizer: e.organizer ? { email: e.organizer.email, name: e.organizer.name } : null,
    editable: isEditable(e, o.own),
    juno: e.juno,
    recording: o.recording ?? null,
    hasBrief: !e.allDay && !e.declined && e.others.length > 0 && !Number.isNaN(startMs) && startMs > now,
  }
}

export type Gate = { status: 403; body: { readOnly: true; error: string } } | { status: 409; body: { needsConfirm: true; guests: number } } | null

/**
 * Whether a change may go ahead. kind 'create': only the guests check (a new event is the user's).
 * 'patch' / 'delete': read-only first, then guests (the event's guests are emailed the update or
 * the cancellation).
 */
export function changeGate(kind: 'create' | 'patch' | 'delete', o: { guests: number; editable?: boolean; confirm?: boolean }): Gate {
  if (kind !== 'create' && o.editable === false) return { status: 403, body: { readOnly: true, error: 'someone else organised this event: change it in Google Calendar or Outlook' } }
  if (o.guests > 0 && !o.confirm) return { status: 409, body: { needsConfirm: true, guests: o.guests } }
  return null
}

/** 'YYYY-MM-DD' of an instant in a zone (UTC when the zone is unknown or bad). */
export function localDay(ms: number, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

export type TodoSession = {
  id: string
  source_channel?: string | null
  storage_path?: string | null
  merge_index?: number | null
  notes: { actions?: { action: string }[] } | null
  action_meta: ActionMeta[] | null
  action_done: number[] | null
}

/** The user's own to-dos due on a day in [fromDay, toDay] (inclusive, 'YYYY-MM-DD'), done ones too. */
export function datedTodos(sessions: TodoSession[], fromDay: string, toDay: string): CalTodo[] {
  const out: CalTodo[] = []
  for (const s of sessions) {
    // The sample recording is nobody's; a merged day's later parts repeat the first's notes.
    if (s.source_channel === 'sample' || String(s.storage_path ?? '').startsWith('sample')) continue
    if (s.merge_index != null && s.merge_index > 0) continue
    const acts = s.notes?.actions ?? []
    const meta = Array.isArray(s.action_meta) && s.action_meta.length === acts.length ? s.action_meta : null
    if (!meta) continue
    const done = new Set(Array.isArray(s.action_done) ? s.action_done : [])
    acts.forEach((a, i) => {
      const d = meta[i]?.due_date
      if (!isMine(meta[i]) || !isDay(d) || d < fromDay || d > toDay) return
      const text = String(a?.action ?? '').trim()
      if (text) out.push({ ref: `${s.id}#${i}`, sessionId: s.id, text, date: d, done: done.has(i) })
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** A Google / Graph failure → status + message for the browser. */
export function providerError(e: unknown): { status: number; error: string } {
  const msg = (e as Error)?.message || 'the calendar did not answer'
  const s = (e as { status?: number })?.status
  if (/no calendar is connected|not connected any more|no connected calendar/i.test(msg)) return { status: 400, error: msg }
  if (/needs a valid start|must be after|needs a date|start and an end|does not look right/i.test(msg)) return { status: 400, error: msg }
  if (s === 400) return { status: 400, error: msg }
  if (s === 401) return { status: 502, error: 'this calendar needs reconnecting (Settings)' }
  if (s === 403) return { status: 403, error: msg }
  if (s === 404 || s === 410) return { status: 404, error: 'that event is gone' }
  if (s === 409 || s === 412) return { status: 409, error: msg }
  if (s === 429) return { status: 429, error: 'the calendar is busy, try again in a minute' }
  return { status: 502, error: msg }
}

/** "chris.park@acme.com" → "Chris Park", for guests the calendar gives no name for. */
export function nameFromEmail(email: string): string {
  return email.split('@')[0].split(/[._+-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** What lib/pen/whatsapp/agent.ts personBriefFor returns (the parts used here). */
export type BriefSource = {
  last_calls?: { session_id: string; date: string; title: string | null; summary: string | null }[]
  open_todos?: Record<string, unknown>[]
  error?: string
}

const noDot = (s: string) => s.trim().replace(/[.。]+$/, '')

/** One guest's part of a CalBrief. No brief (unknown guest, ambiguous name) = nulls and empty lists. */
export function briefPerson(guest: { email: string | null; name: string | null }, b: BriefSource | null): CalBrief['people'][number] {
  const name = guest.name?.trim() || (guest.email ? nameFromEmail(guest.email) : '') || 'Guest'
  if (!b || b.error) return { name, email: guest.email, lastCall: null, youOwe: [], theyOwe: [] }
  const last = b.last_calls?.[0]
  const todos = (b.open_todos ?? []) as { action?: unknown; whose?: unknown }[]
  const text = (t: { action?: unknown }) => noDot(String(t.action ?? ''))
  return {
    name,
    email: guest.email,
    lastCall: last ? { sessionId: last.session_id, date: last.date, title: last.title ?? '', summary: (last.summary ?? '').slice(0, 600) } : null,
    youOwe: todos.filter((t) => t.whose !== 'other').map(text).filter(Boolean).slice(0, 5),
    theyOwe: todos.filter((t) => t.whose === 'other').map(text).filter(Boolean).slice(0, 5),
  }
}
