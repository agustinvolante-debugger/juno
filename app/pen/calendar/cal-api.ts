// The Calendar page's connection to /api/pen/calendar, and a local stand-in for the dev preview.
//
// Mutations use fetch directly rather than lib/pen/http.ts: a 409 { needsConfirm, guests } and a
// 403 { readOnly } carry a body the page must read, and the shared helpers only keep the message.

import { getJson } from '@/lib/pen/http'
import type { CalBrief, CalCreate, CalPatch, CalRange, CalViewEvent } from '@/lib/pen/calendar-view'
import { evSpan, overlaps } from './cal-utils'

export type MutResult<T> = { ok: true; value: T } | { needsConfirm: true; guests: number } | { readOnly: true }

export type CalApi = {
  load(from: Date, to: Date): Promise<CalRange>
  brief(ref: string): Promise<CalBrief>
  create(body: CalCreate): Promise<MutResult<CalViewEvent>>
  patch(body: CalPatch): Promise<MutResult<CalViewEvent>>
  remove(ref: string, confirm: boolean): Promise<MutResult<true>>
}

async function send<T>(method: string, url: string, body?: unknown): Promise<MutResult<T>> {
  const r = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let data: Record<string, unknown> | null = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (r.status === 409 && data?.needsConfirm) return { needsConfirm: true, guests: Number(data.guests) || 0 }
  if (r.status === 403 && data?.readOnly) return { readOnly: true }
  if (!r.ok) {
    const msg = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : `HTTP ${r.status}`
    throw new Error(msg)
  }
  return { ok: true, value: (data?.event ?? true) as T }
}

export const liveApi: CalApi = {
  load: (from, to) =>
    getJson<CalRange>(`/api/pen/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
  brief: async (ref) => (await getJson<{ brief: CalBrief }>(`/api/pen/calendar/brief?ref=${encodeURIComponent(ref)}`)).brief,
  create: (body) => send<CalViewEvent>('POST', '/api/pen/calendar/events', body),
  patch: (body) => send<CalViewEvent>('PATCH', '/api/pen/calendar/events', body),
  remove: (ref, confirm) => send<true>('DELETE', `/api/pen/calendar/events?ref=${encodeURIComponent(ref)}${confirm ? '&confirm=1' : ''}`),
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Dev preview only: the same contract, answered from memory. Nothing leaves the browser. */
export function mockApi(seed: CalRange, brief: (ref: string) => CalBrief): CalApi {
  const db: CalRange = JSON.parse(JSON.stringify(seed))
  let n = 0
  return {
    async load(from, to) {
      await wait(220)
      return {
        ...db,
        events: db.events.filter((e) => overlaps(evSpan(e), from, to)),
      }
    },
    async brief(ref) {
      await wait(500)
      return brief(ref)
    },
    async create(body) {
      await wait(250)
      if (body.guests?.length && !body.confirm) return { needsConfirm: true, guests: body.guests.length }
      const cal = body.cal ?? db.calendars.find((c) => c.isDefault)?.key ?? db.calendars[0].key
      const ev: CalViewEvent = {
        ref: `mock-new-${++n}|${cal}`, cal, cals: [cal], title: body.title, start: body.start, end: body.end,
        allDay: !!body.allDay, location: body.location || null, description: body.description || null,
        meet: body.video ? 'https://meet.google.com/abc-defg-hij' : null, link: null, declined: false,
        guests: body.guests ?? [], organizer: null, editable: true, juno: true, recording: null, hasBrief: false,
      }
      db.events.push(ev)
      return { ok: true, value: ev }
    },
    async patch(body) {
      await wait(250)
      const ev = db.events.find((e) => e.ref === body.ref)
      if (!ev) throw new Error('That event is gone.')
      if (!ev.editable) return { readOnly: true }
      // The same rules as lib/pen/calendar-page.ts patchGate.
      const move = !!body.cal && body.cal !== ev.cal
      if (move && ev.guests.length) throw new Error('Meetings with guests can’t move between calendars; create it on the other calendar instead.')
      if (move && body.guests?.length) throw new Error('Move it to the other calendar first, then add the guests.')
      const before = new Set(ev.guests.map((g) => g.email))
      const after = new Set((body.guests ?? ev.guests).map((g) => g.email))
      const added = [...after].filter((m) => !before.has(m)).length
      const removed = [...before].filter((m) => !after.has(m)).length
      const kept = [...after].filter((m) => before.has(m)).length
      const other = ['title', 'start', 'end', 'location', 'description'].some((k) => k in body) || (body.video && !ev.meet)
      const emailed = added + removed + (other ? kept : 0)
      if (emailed && !body.confirm) return { needsConfirm: true, guests: emailed }
      // A new object: the page holds the old one (and compares refs after a move).
      const next: CalViewEvent = { ...ev }
      if (body.title !== undefined) next.title = body.title
      if (body.start !== undefined) next.start = body.start
      if (body.end !== undefined) next.end = body.end
      if (body.location !== undefined) next.location = body.location
      if (body.description !== undefined) next.description = body.description
      if (body.guests !== undefined) next.guests = body.guests
      if (body.video && !ev.meet) next.meet = 'https://meet.google.com/new-link-abc'
      if (move) {
        next.ref = `mock-moved-${++n}|${body.cal}`
        next.cal = body.cal!
        next.cals = [body.cal!]
      }
      db.events = db.events.map((e) => (e === ev ? next : e))
      return { ok: true, value: next }
    },
    async remove(ref, confirm) {
      await wait(250)
      const ev = db.events.find((e) => e.ref === ref)
      if (!ev) return { ok: true, value: true }
      if (!ev.editable) return { readOnly: true }
      if (ev.guests.length && !confirm) return { needsConfirm: true, guests: ev.guests.length }
      db.events = db.events.filter((e) => e.ref !== ref)
      return { ok: true, value: true }
    },
  }
}
