// Which Pen recording was which past meeting (Calendar page, 22 Oct). Pure, for tests
// (.pentest/calendar-page-unit.mts): no network, no DB. app/api/pen/calendar reads the events and
// the recordings and calls matchRecordings on each read; nothing is stored.
//
//   · A recording's time: recorded_at is the file's mtime off the pen, which the pen stamps with
//     the START of the recording (same time as the R<date>-<time>.WAV name; measured 21 Oct: a
//     61 s file named 15:12:31 has mtime 15:12:30). So it spans [recorded_at, recorded_at +
//     duration]. No duration yet (still being transcribed) = a 20-minute guess forward.
//   · A pair counts only when the times overlap meaningfully: ≥ 50% of the shorter of the two, or
//     ≥ 10 minutes. Then the score: overlap share + 2 when a guest's email is one of the people
//     linked to the recording (pen_session_people → pen_people.email) + title likeness (0..1).
//   · One recording per meeting and one meeting per recording: best pairs first (greedy).
//   · Only past meetings (ended before now), timed, not declined.

import { foldName } from './speakers'

const MIN = 60_000
const GUESS_MS = 20 * MIN

export type MatchEvent = {
  /** Anything unique (the event ref). */
  key: string
  title: string
  start: string
  end: string | null
  allDay: boolean
  declined: boolean
  others: { email: string }[]
}

export type MatchRecording = {
  id: string
  title: string
  /** ISO: the START of the recording (file mtime; the pen stamps the start). */
  recordedAt: string
  durationSec: number | null
  /** Emails of the people linked to it (lower case). */
  emails: string[]
}

/** [start, end] of a recording in ms, or null when it has no usable time. */
export function recordingSpan(r: Pick<MatchRecording, 'recordedAt' | 'durationSec'>): [number, number] | null {
  const start = Date.parse(r.recordedAt)
  if (Number.isNaN(start)) return null
  const len = r.durationSec && r.durationSec > 0 ? r.durationSec * 1000 : GUESS_MS
  return [start, start + len]
}

/** Words of a title, folded, without the filler that every meeting title shares. */
const STOP = new Set(['the', 'and', 'with', 'call', 'meeting', 'sync', 'reunion', 'reuniao', 'con', 'com', 'de', 'del', 'da', 'do', 'y', 'e', 'a', 'x', 'for', 'para', 'por', 'chat', 'catch', 'up'])
const words = (s: string) => new Set(foldName(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)))

/** Title likeness 0..1: shared words over the smaller title's words. */
export function titleLike(a: string, b: string): number {
  const x = words(a), y = words(b)
  if (!x.size || !y.size) return 0
  let hit = 0
  for (const w of x) if (y.has(w)) hit++
  return hit / Math.min(x.size, y.size)
}

/** The pair's score, or 0 when the times don't overlap enough to be the same meeting. */
export function matchScore(e: MatchEvent, r: MatchRecording): number {
  const span = recordingSpan(r)
  const es = Date.parse(e.start)
  const ee = e.end ? Date.parse(e.end) : es + 30 * MIN
  if (!span || Number.isNaN(es) || Number.isNaN(ee) || ee <= es) return 0
  const overlap = Math.min(ee, span[1]) - Math.max(es, span[0])
  if (overlap <= 0) return 0
  const shorter = Math.max(MIN, Math.min(ee - es, span[1] - span[0]))
  const share = Math.min(1, overlap / shorter)
  if (share < 0.5 && overlap < 10 * MIN) return 0
  const mine = new Set(r.emails.map((m) => m.toLowerCase()))
  const guest = e.others.some((o) => mine.has(o.email.toLowerCase())) ? 2 : 0
  return share + guest + titleLike(e.title, r.title)
}

/** Event key → the recording of that meeting. Only past, timed, not-declined events. */
export function matchRecordings(events: MatchEvent[], recordings: MatchRecording[], now = new Date()): Map<string, { id: string; title: string }> {
  const t = now.getTime()
  const past = events.filter((e) => {
    if (e.allDay || e.declined) return false
    const end = e.end ? Date.parse(e.end) : Date.parse(e.start)
    return !Number.isNaN(end) && end < t
  })
  const pairs: { e: string; r: MatchRecording; s: number }[] = []
  for (const e of past) for (const r of recordings) {
    const s = matchScore(e, r)
    if (s > 0) pairs.push({ e: e.key, r, s })
  }
  pairs.sort((a, b) => b.s - a.s)
  const out = new Map<string, { id: string; title: string }>()
  const used = new Set<string>()
  for (const p of pairs) {
    if (out.has(p.e) || used.has(p.r.id)) continue
    out.set(p.e, { id: p.r.id, title: p.r.title })
    used.add(p.r.id)
  }
  return out
}
