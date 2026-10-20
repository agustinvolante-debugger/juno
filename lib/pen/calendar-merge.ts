// Several calendars, one view (20 Oct): the pure half of lib/pen/calendars.ts, for tests
// (.pentest/calendars-unit.mts). Which calendar is the default for new events, which one the
// user means by "my work calendar", event refs that say which calendar an event is on, and the
// same meeting on two calendars shown once.

import type { UpcomingEvent } from './google-calendar'
import { foldName } from './speakers'

/** One connected calendar. key = its Google address (or 'gcal' for an old connection that never said which). */
export type CalInfo = {
  key: string
  address: string | null
  /** Where its token lives: the Settings → Google connection (pen_gcal), a connected Google address (pen_gmail) or a Microsoft one (pen_outlook). */
  via: 'google' | 'email' | 'outlook'
  broken: boolean
}

const CONSUMER = /@(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac)\.[a-z.]+$/i

/**
 * The calendar new events go on: the one the user chose (Settings, or "make my work calendar the
 * default"), while it is still connected and working; else the Settings → Google one (what Juno
 * used before there could be several); else the oldest working one.
 */
export function chooseDefault(cals: CalInfo[], saved?: string | null): CalInfo | null {
  const ok = cals.filter((c) => !c.broken)
  const pool = ok.length ? ok : cals
  if (!pool.length) return null
  const s = saved?.toLowerCase()
  return (s && pool.find((c) => c.key === s)) || pool.find((c) => c.via === 'google') || pool[0]
}

/** "my work calendar", "the tryjunoapp one", "agustin@x.com", "personal" → that calendar, or null. */
export function pickCalendar(cals: CalInfo[], said: string | null | undefined): CalInfo | null {
  const q = (said ?? '').trim().toLowerCase()
  if (!q) return null
  const exact = cals.find((c) => c.key === q || c.address === q)
  if (exact) return exact
  const words = q.split(/[^a-z0-9.@_-]+/).filter((w) => w.length >= 3 && !['the', 'my', 'calendar', 'calendario', 'agenda', 'cal', 'one', 'mio', 'meu', 'mi', 'account', 'cuenta', 'conta', 'google', 'gmail', 'del', 'de', 'do', 'da'].includes(w))
  const hits = cals.filter((c) => c.address && words.some((w) => c.address!.includes(w)))
  if (hits.length === 1) return hits[0]
  // "my Outlook calendar" / "the Google one": the only calendar of that provider.
  if (/\b(outlook|microsoft|office ?365|m365|hotmail|teams)\b/.test(q)) {
    const ms = cals.filter((c) => c.via === 'outlook')
    if (ms.length === 1) return ms[0]
  }
  if (/\b(google|gmail|gcal)\b/.test(q)) {
    const g = cals.filter((c) => c.via !== 'outlook')
    if (g.length === 1) return g[0]
  }
  if (/\b(work|trabajo|trabalho|empresa|company|office|oficina|job|laboral)\b/.test(q)) {
    const biz = cals.filter((c) => c.address && !CONSUMER.test(c.address))
    if (biz.length === 1) return biz[0]
  }
  if (/\b(personal|private|privado|pessoal|propio|own)\b/.test(q)) {
    const own = cals.filter((c) => c.address && CONSUMER.test(c.address))
    if (own.length === 1) return own[0]
  }
  return null
}

/** The id the model sees for an event: Google's id, and which calendar it is on. Google ids never contain '|'. */
export function eventRef(id: string, cal?: string | null): string {
  return cal ? `${id}|${cal}` : id
}

/** Back from eventRef. A bare id (older turns, offers) = the default calendar. */
export function parseEventRef(ref: string): { id: string; cal: string | null } {
  const i = ref.lastIndexOf('|')
  return i > 0 ? { id: ref.slice(0, i), cal: ref.slice(i + 1).toLowerCase() || null } : { id: ref, cal: null }
}

const startMs = (e: UpcomingEvent) => {
  const t = Date.parse(e.start)
  return Number.isNaN(t) ? 0 : t
}

/** Same meeting: same iCalendar UID at the same start (recurring instances share a UID), else same title at the same start. */
export function sameMeetingKey(e: UpcomingEvent): string {
  const at = e.allDay ? e.start.slice(0, 10) : String(startMs(e))
  return e.uid ? `u:${e.uid}|${at}` : `t:${foldName(e.title).replace(/\s+/g, ' ')}|${at}`
}

/** Same title at the same start: the fallback that catches one meeting on a Google and an Outlook calendar whose UIDs differ. */
export function titleKey(e: UpcomingEvent): string {
  const at = e.allDay ? e.start.slice(0, 10) : String(startMs(e))
  return `t:${foldName(e.title).replace(/\s+/g, ' ')}|${at}`
}

/**
 * Events from every calendar (each tagged with `cal`) → one list, soonest first, the same meeting
 * once. Same meeting = same UID at the same start, or (across two different calendars only, since
 * Google and Outlook don't always agree on a UID) the same title at the same start. The copy kept:
 * the user's own (they organised it) > the default calendar's > the first read; `cals` lists every
 * calendar it is on.
 */
export function mergeEvents(lists: UpcomingEvent[][], defaultKey?: string | null): UpcomingEvent[] {
  const byKey = new Map<string, UpcomingEvent>()
  const byTitle = new Map<string, string>()
  for (const list of lists) {
    for (const e of list) {
      let k = sameMeetingKey(e)
      if (!byKey.has(k)) {
        const alias = byTitle.get(titleKey(e))
        const other = alias ? byKey.get(alias) : undefined
        if (alias && other && !(other.cals ?? []).includes(e.cal ?? '')) k = alias
      }
      const have = byKey.get(k)
      if (!have) {
        byKey.set(k, { ...e, cals: e.cal ? [e.cal] : [] })
        if (!byTitle.has(titleKey(e))) byTitle.set(titleKey(e), k)
        continue
      }
      const cals = [...new Set([...(have.cals ?? []), ...(e.cal ? [e.cal] : [])])]
      const better = (!have.organizerSelf && e.organizerSelf) || (!have.organizerSelf && !e.organizerSelf && defaultKey != null && e.cal === defaultKey && have.cal !== defaultKey)
      // Guests from either copy (one calendar may only list the user).
      const others = [...(better ? e.others : have.others)]
      for (const o of better ? have.others : e.others) if (!others.some((x) => x.email === o.email)) others.push(o)
      byKey.set(k, { ...(better ? e : have), others, cals, meet: (better ? e.meet : have.meet) ?? e.meet ?? have.meet })
    }
  }
  return [...byKey.values()].sort((a, b) => startMs(a) - startMs(b))
}
