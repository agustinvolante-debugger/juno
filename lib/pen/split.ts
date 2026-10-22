// One recording, two (or more) meetings → split (22 Oct, founder-approved).
//
// The pen keeps running between back-to-back meetings, so one file can hold "10:00 with Ana" and
// "10:45 with Robert". One set of notes for both is wrong for both: the to-dos mix, the people mix,
// the calendar match picks one. A split makes each meeting a recording of its own (new
// pen_sessions rows, lib/pen/split-server.ts) with its own transcript slice, notes, to-dos and
// people. The audio is shared, not cut: the rows point at the same stored file, and the transcript
// carries a `split` marker saying which slice of it each row is (nothing plays audio in the app; it
// is only ever sent to AssemblyAI, and a split row is never re-transcribed).
//
// Pure: no database, no server imports. The browser shows the same time ranges the server cuts at.
//
// Detection is a suggestion only, never automatic:
//   (i)   a silence of ≥ 2.5 minutes between utterances                       1 point (≥ 5 min: 1.5)
//   (ii)  the voices before and after are largely different people            +1.5
//   (iii) the recording spans two or more calendar events: the next event's
//         start, snapped to the best silence within 10 minutes of it          3 points (+0.5 on a ≥ 1 min gap)
// Suggested at 2.5 or more: a calendar boundary on its own, or a silence with a change of voices.
// A silence alone (a coffee break) or a change of voices alone (someone joined) is not enough.

import type { Utterance } from './store'
import { foldName, resolve, type SpeakerMap } from './speakers'

/** Recordings shorter than this are never suggested for a split. */
export const MIN_TOTAL_SEC = 20 * 60
/** Every suggested part lasts at least this long. */
export const MIN_PART_SEC = 5 * 60
/** A cut made by hand ("Split here") leaves at least this much on each side. */
export const MIN_MANUAL_SEC = 30
export const SILENCE_SEC = 150
export const LONG_SILENCE_SEC = 300
/** How far from a calendar event's start the cut may move to land on a silence. */
export const SNAP_SEC = 10 * 60
/** How much speech either side of a silence is compared for a change of voices. */
export const VOICE_WINDOW_SEC = 15 * 60
export const SUGGEST_SCORE = 2.5
/** An event counts for a recording when they overlap this long. */
export const EVENT_OVERLAP_SEC = 5 * 60

export type SplitReason = 'calendar' | 'silence' | 'speakers'

/** One part of a suggested (or performed) split, in seconds from the start of the recording. */
export type SplitPart = {
  /** Where the part's speech starts and ends (for "10:00–10:38"). */
  from_sec: number
  to_sec: number
  /** The calendar event it was, when one matches. */
  title: string | null
  /** Who it was with: the event's guests, or the named voices heard in it (never the user). */
  people: string[]
}

export type SplitHint = {
  /** Cut points, seconds from the start (a cut goes right before the utterance starting there). */
  cuts: number[]
  parts: SplitPart[]
  reasons: SplitReason[]
  score: number
  /** The recording's start, so the page can say clock times. */
  recorded_at: string | null
}

/** A file of the recording: the recording itself, or one part of a joined meeting. */
export type SplitFile = {
  id: string
  duration_sec: number | null
  utterances: Utterance[]
  speaker_map?: SpeakerMap | null
}

/** A calendar event around the recording (not all-day, not declined; the caller filters). */
export type SplitEvent = { title: string; start: string; end: string | null; names: string[] }

/** The marker every row of a split carries in its transcript (pen_sessions.transcript.split). */
export type SplitMarker = {
  /** Shared by every row of one split. */
  id: string
  /** 1-based, and how many. */
  part: number
  parts: number
  /** The recording it was split from (its first row). */
  of: string
  /** Where this row starts in the recording it came from, seconds. */
  from_sec: number
  /** The AssemblyAI transcript this slice is of, and the slice's first line in it (translation). */
  aai_id: string | null
  first_utt: number
}

/* ------------------------------------------------------------------ the timeline */

type Line = { file: number; idx: number; start: number; end: number; speaker: string; me: boolean; name: string | null; text: string }

/**
 * Every utterance of every file on one clock (ms from the start of the recording). A voice is its
 * name where Who's who named it (so the same person across files of a joined meeting is one voice),
 * else its label within its file (labels restart in each file).
 */
export function timeline(files: SplitFile[]): Line[] {
  const out: Line[] = []
  let offset = 0
  files.forEach((f, k) => {
    for (const [i, u] of (f.utterances ?? []).entries()) {
      const { entry } = resolve(f.speaker_map ?? null, u.speaker)
      const name = entry?.name?.trim() || null
      out.push({
        file: k, idx: i, start: u.start + offset, end: u.end + offset, text: u.text ?? '',
        speaker: name ? `n:${foldName(name)}` : `${k}:${u.speaker}`, me: !!entry?.me, name: entry?.me ? null : name,
      })
    }
    offset += (f.duration_sec ?? 0) * 1000
  })
  return out
}

export const totalSec = (files: SplitFile[]) => files.reduce((t, f) => t + (f.duration_sec ?? 0), 0)

/** Voices that really take part in a stretch: two turns or more, or a tenth of the words. */
function voices(lines: Line[]): Set<string> {
  const turns = new Map<string, number>()
  const words = new Map<string, number>()
  let total = 0
  for (const l of lines) {
    const w = l.text.split(/\s+/).filter(Boolean).length
    turns.set(l.speaker, (turns.get(l.speaker) ?? 0) + 1)
    words.set(l.speaker, (words.get(l.speaker) ?? 0) + w)
    total += w
  }
  return new Set([...turns.keys()].filter((s) => (turns.get(s) ?? 0) >= 2 || (words.get(s) ?? 0) >= total / 10))
}

/**
 * Are the voices before line `at` and after it largely different people? The user (a "me" voice)
 * is in both meetings and doesn't count; while nobody is marked as the user, one shared voice is
 * allowed (it is probably them). Only within one file: labels restart at a file seam.
 */
export function voicesChange(lines: Line[], at: number, windowSec = VOICE_WINDOW_SEC): boolean {
  const pivot = lines[at]
  if (!pivot || at === 0) return false
  const w = windowSec * 1000
  const before = lines.slice(0, at).filter((l) => l.file === pivot.file && l.start >= pivot.start - w)
  const after = lines.slice(at).filter((l) => l.file === pivot.file && l.start < pivot.start + w)
  if (before.length < 3 || after.length < 3) return false
  const meKnown = lines.some((l) => l.me)
  const mine = new Set(lines.filter((l) => l.me).map((l) => l.speaker))
  const b = new Set([...voices(before)].filter((s) => !mine.has(s)))
  const a = new Set([...voices(after)].filter((s) => !mine.has(s)))
  if (!b.size || !a.size) return false
  const shared = [...b].filter((s) => a.has(s)).length
  const gone = [...b].filter((s) => !a.has(s)).length
  const fresh = [...a].filter((s) => !b.has(s)).length
  return gone > 0 && fresh > 0 && shared <= (meKnown ? 0 : 1)
}

/* ------------------------------------------------------------------ detection */

type Candidate = { at: number; score: number; reasons: Set<SplitReason> }

/** Seconds from the recording's start of a line's start, as a cut point. */
const cutOf = (l: Line) => l.start / 1000

/**
 * The split worth suggesting, or null. `startIso` is when the recording began (recorded_at is the
 * start); without it the calendar can't be lined up and only silences and voices count.
 */
export function findSplit(o: { files: SplitFile[]; startIso: string | null; events?: SplitEvent[] }): SplitHint | null {
  const total = totalSec(o.files)
  if (total < MIN_TOTAL_SEC) return null
  const lines = timeline(o.files)
  if (lines.length < 6) return null
  const startMs = o.startIso ? Date.parse(o.startIso) : NaN
  const endMs = startMs + total * 1000
  const cands: Candidate[] = []
  const gapBefore = (i: number) => (i > 0 ? lines[i].start - lines[i - 1].end : 0)
  const inRange = (sec: number) => sec >= MIN_PART_SEC && sec <= total - MIN_PART_SEC

  // (iii) calendar: each later event's start, snapped to the best silence within SNAP_SEC.
  const evs = Number.isFinite(startMs) ? usableEvents(o.events ?? [], startMs, endMs) : []
  for (let k = 1; k < evs.length; k++) {
    const t = Date.parse(evs[k].start) - startMs
    let best = -1, bestScore = -Infinity
    for (let i = 1; i < lines.length; i++) {
      const g = gapBefore(i)
      const dist = Math.abs(lines[i].start - t)
      if (dist > SNAP_SEC * 1000 || g < 5000) continue
      // A long silence near the event start beats a short one right on it.
      const s = g - dist / 20
      if (s > bestScore) { bestScore = s; best = i }
    }
    if (best < 0) best = lines.findIndex((l) => l.start >= t)
    if (best <= 0 || !inRange(cutOf(lines[best]))) continue
    cands.push({ at: best, score: 3 + (gapBefore(best) >= 60_000 ? 0.5 : 0), reasons: new Set(['calendar']) })
  }

  // (i) + (ii) silences, with or without a change of voices.
  for (let i = 1; i < lines.length; i++) {
    const g = gapBefore(i) / 1000
    if (g < SILENCE_SEC || !inRange(cutOf(lines[i]))) continue
    const change = voicesChange(lines, i)
    const near = cands.find((c) => Math.abs(lines[c.at].start - lines[i].start) <= SNAP_SEC * 1000)
    const score = (g >= LONG_SILENCE_SEC ? 1.5 : 1) + (change ? 1.5 : 0)
    if (near) {
      // Same boundary as a calendar one: it backs it up.
      near.reasons.add('silence')
      if (change) near.reasons.add('speakers')
      continue
    }
    cands.push({ at: i, score, reasons: new Set<SplitReason>(change ? ['silence', 'speakers'] : ['silence']) })
  }

  // The confident ones, best first, each part at least MIN_PART_SEC long.
  const picked: Candidate[] = []
  for (const c of cands.filter((x) => x.score >= SUGGEST_SCORE).sort((a, b) => b.score - a.score)) {
    const t = lines[c.at].start
    if (picked.some((p) => Math.abs(lines[p.at].start - t) < MIN_PART_SEC * 1000)) continue
    picked.push(c)
  }
  if (!picked.length) return null
  picked.sort((a, b) => a.at - b.at)
  const cuts = picked.map((c) => cutOf(lines[c.at]))
  return {
    cuts,
    parts: describeParts(lines, cuts, total, Number.isFinite(startMs) ? { startMs, events: evs } : null),
    reasons: [...new Set(picked.flatMap((c) => [...c.reasons]))].sort() as SplitReason[],
    score: Math.min(...picked.map((c) => c.score)),
    recorded_at: o.startIso,
  }
}

/** Events that overlap the recording meaningfully, in order, each starting well after the one before. */
function usableEvents(events: SplitEvent[], startMs: number, endMs: number): SplitEvent[] {
  const list = events
    .map((e) => ({ e, s: Date.parse(e.start), en: e.end ? Date.parse(e.end) : Date.parse(e.start) + 30 * 60_000 }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.en) && x.en > x.s)
    .filter((x) => Math.min(x.en, endMs) - Math.max(x.s, startMs) >= EVENT_OVERLAP_SEC * 1000)
    .sort((a, b) => a.s - b.s)
  const out: typeof list = []
  for (const x of list) {
    // Two events at the same time (a hold and the real invite): the first one stands.
    if (out.length && x.s < out[out.length - 1].s + 10 * 60_000) continue
    out.push(x)
  }
  return out.map((x) => x.e)
}

/**
 * Each part's speech span, the calendar event it best overlaps (its title and guests), else the
 * named voices heard in it. Exported for the server, which describes a split made by hand the
 * same way.
 */
export function describeParts(lines: Line[], cuts: number[], total: number, cal: { startMs: number; events: SplitEvent[] } | null): SplitPart[] {
  const bounds = [0, ...cuts, total]
  const parts: SplitPart[] = []
  for (let p = 0; p < bounds.length - 1; p++) {
    const lo = bounds[p] * 1000, hi = bounds[p + 1] * 1000
    const mine = lines.filter((l) => l.start >= lo - 0.5 && (p === bounds.length - 2 || l.start < hi - 0.5))
    const from = mine.length ? mine[0].start / 1000 : bounds[p]
    const to = mine.length ? Math.max(...mine.map((l) => l.end)) / 1000 : bounds[p + 1]
    let ev: SplitEvent | null = null
    if (cal) {
      let best = 0
      for (const e of cal.events) {
        const es = Date.parse(e.start) - cal.startMs, ee = (e.end ? Date.parse(e.end) : Date.parse(e.start) + 30 * 60_000) - cal.startMs
        const ov = Math.min(ee, hi) - Math.max(es, lo)
        if (ov > best && (ov >= (hi - lo) / 2 || ov >= 10 * 60_000)) { best = ov; ev = e }
      }
    }
    const heard = [...new Set(mine.filter((l) => l.name).map((l) => l.name!))]
    parts.push({
      from_sec: Math.round(from),
      to_sec: Math.round(to),
      title: ev?.title?.trim() || null,
      people: (ev?.names.length ? ev.names : heard).slice(0, 4),
    })
  }
  return parts
}

/* ------------------------------------------------------------------ the cut */

/** Where each output recording's pieces come from: a stretch of utterances of one file. */
export type Piece = {
  /** Index into the files. */
  file: number
  /** Utterances [from, to) of that file. */
  from: number
  to: number
  /** Where the piece starts in its file, whole seconds, and how long it is. */
  offsetSec: number
  durationSec: number
  /** The first piece of each file keeps that file's row; the others become new rows. */
  reuse: boolean
  /** Where the piece starts in the whole recording, seconds. */
  startSec: number
}

/**
 * The cut, as pieces grouped into the output recordings. A cut goes right before the first
 * utterance starting at or after it; a cut on a file seam of a joined meeting only regroups the
 * files. Every output lasts at least `minSec`. Pure.
 */
export function planSplit(files: SplitFile[], cutsSec: number[], minSec = MIN_MANUAL_SEC): Piece[][] | { error: string } {
  const lines = timeline(files)
  if (!lines.length) return { error: 'this recording has no transcript to split' }
  const total = totalSec(files)
  const at = new Set<number>()
  for (const c of cutsSec) {
    if (!Number.isFinite(c)) return { error: 'that is not a time in the recording' }
    const i = lines.findIndex((l) => l.start >= c * 1000 - 1)
    if (i <= 0) return { error: i === 0 ? 'that is the very start of the recording' : 'that is past the end of the recording' }
    at.add(i)
  }
  if (!at.size) return { error: 'say where to split' }
  const cutLines = [...at].sort((a, b) => a - b).map((i) => lines[i])
  // Within each file, the local cut indexes; a cut on a file's first line is a seam.
  const local = files.map((_, k) => cutLines.filter((l) => l.file === k && l.idx > 0).map((l) => l.idx))
  const seams = new Set(cutLines.filter((l) => l.idx === 0).map((l) => l.file))
  const outs: Piece[][] = [[]]
  let startOfFile = 0
  files.forEach((f, k) => {
    const u = f.utterances ?? []
    const dur = f.duration_sec ?? 0
    if (seams.has(k) && outs[outs.length - 1].length) outs.push([])
    const idx = [0, ...local[k], u.length]
    // Whole seconds into the file where each piece starts; never backwards, never past the end.
    const offs = idx.slice(0, -1).map((i, j) => (j === 0 ? 0 : Math.min(dur, Math.max(0, Math.floor(u[i].start / 1000)))))
    for (let j = 0; j < idx.length - 1; j++) {
      if (j > 0) outs.push([])
      const off = offs[j]
      const end = j + 1 < offs.length ? offs[j + 1] : dur
      outs[outs.length - 1].push({ file: k, from: idx[j], to: idx[j + 1], offsetSec: off, durationSec: Math.max(0, end - off), reuse: j === 0, startSec: startOfFile + off })
    }
    startOfFile += dur
  })
  const real = outs.filter((o) => o.length)
  if (real.length < 2) return { error: 'that would leave the recording as it is' }
  for (let r = 0; r < real.length; r++) {
    const from = real[r][0].startSec
    const to = r + 1 < real.length ? real[r + 1][0].startSec : total
    if (to - from < minSec) return { error: 'one of the parts would be too short' }
  }
  return real
}

type Word = { start?: number; end?: number }

/** A piece's transcript: its utterances moved to start at 0, its corrections and translation re-keyed. */
export function slicePiece(
  s: { utterances: Utterance[]; transcript_edits?: Record<string, string> | null; translation?: { lang: string; utterances: string[] } | null },
  p: Pick<Piece, 'from' | 'to' | 'offsetSec'>,
) {
  const shift = p.offsetSec * 1000
  const utterances = s.utterances.slice(p.from, p.to).map((u) => {
    const x = { ...u, start: u.start - shift, end: u.end - shift } as Utterance & { words?: Word[] }
    const words = (u as Utterance & { words?: Word[] }).words
    if (Array.isArray(words)) x.words = words.map((w) => ({ ...w, ...(typeof w.start === 'number' ? { start: w.start - shift } : {}), ...(typeof w.end === 'number' ? { end: w.end - shift } : {}) }))
    return x
  })
  const edits: Record<string, string> = {}
  for (const [k, v] of Object.entries(s.transcript_edits ?? {})) {
    const i = Number(k)
    if (Number.isInteger(i) && i >= p.from && i < p.to) edits[String(i - p.from)] = v
  }
  const tr = s.translation?.utterances?.length === s.utterances.length ? { lang: s.translation.lang, utterances: s.translation.utterances.slice(p.from, p.to) } : null
  return { utterances, edits, translation: tr, text: utterances.map((u) => u.text).join(' ') }
}

/**
 * A pen filename moved on by `sec` ("R20260922-213209.WAV" + 600 → "R20260922-214209.WAV"), so
 * the part's name still says when it started. Any other name gets " · 2".
 */
export function shiftedName(name: string | null, sec: number, part: number): string {
  const m = /R(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name ?? '')
  if (!m) return `${(name ?? 'Recording').replace(/\s·\s\d+$/, '')} · ${part}`
  const [, y, mo, d, h, mi, s] = m.map(Number)
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s) + Math.round(sec) * 1000)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const stamp = `R${t.getUTCFullYear()}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}-${p2(t.getUTCHours())}${p2(t.getUTCMinutes())}${p2(t.getUTCSeconds())}`
  return name!.replace(m[0], stamp)
}

/**
 * Which output recordings each person the user put on the recording belongs to: the ones where
 * their voice (Who's who) or their name is heard; all of them when it can't be told.
 */
export function peopleForParts(people: { id: string; name: string }[], heard: Set<string>[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const all = heard.map((_, i) => i)
  for (const p of people) {
    const full = foldName(p.name)
    const first = full.split(/\s+/)[0]
    const hit = all.filter((i) => [...heard[i]].some((h) => h === full || (first.length >= 3 && h.split(/\s+/)[0] === first)))
    out.set(p.id, hit.length ? hit : all)
  }
  return out
}

/* ------------------------------------------------------------------ "split at …" from chat */

const pad = (n: number) => String(n).padStart(2, '0')

/** The UTC instant of a wall-clock time in a time zone. */
export function zonedMs(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (t: number) => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const v = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    return Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day), Number(v.hour) % 24, Number(v.minute), Number(v.second)) - t
  }
  const first = guess - offsetAt(guess)
  return guess - offsetAt(first)
}

/** "10:45" where the user is, from a start instant. */
export function clockAt(ms: number, tz: string): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return f.format(new Date(ms))
}

export type SplitAt = { sec: number; how: 'clock' | 'offset' | 'person'; who?: string } | { error: string }

/**
 * What the user said to split at, as seconds from the start of the recording:
 *   2700 / "2700" / "2700s"     seconds in
 *   "45 min" / "45m"            minutes in
 *   "10:45" / "10.45am"         the clock time where the user is, when the recording ran then;
 *                               otherwise minutes:seconds in ("45:00", "1:05:00")
 *   "where Robert joins"        just before Robert first speaks (Who's who), else first named;
 *                               moved back to a silence in the two minutes before, if there is one
 */
export function parseSplitAt(at: unknown, o: { files: SplitFile[]; startIso: string | null; tz: string | null }): SplitAt {
  const total = totalSec(o.files)
  const lines = timeline(o.files)
  if (typeof at === 'number') return Number.isFinite(at) ? { sec: at, how: 'offset' } : { error: 'not a time' }
  const s = String(at ?? '').trim().toLowerCase()
  if (!s) return { error: 'say where to split: a time ("10:45") or a person ("where Robert joins")' }
  // "10.45" is a clock time, not ten seconds and a bit.
  let m = /^\d{1,2}\.\d{2}$/.test(s) ? null : /^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|segundos?)?$/.exec(s)
  if (m) return { sec: Number(m[1]), how: 'offset' }
  m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|minutos?)$/.exec(s)
  if (m) return { sec: Number(m[1]) * 60, how: 'offset' }
  m = /^(?:at\s+|a\s+las\s+|às\s+)?(\d{1,2})[:.h](\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s)
  if (m) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null]
    const start = o.startIso ? Date.parse(o.startIso) : NaN
    if (Number.isFinite(start) && c === null && b < 60) {
      let h = a
      if (m[4]?.startsWith('p') && h < 12) h += 12
      if (m[4]?.startsWith('a') && h === 12) h = 0
      const tz = o.tz || 'UTC'
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(start))
      const [y, mo, d] = day.split('-').map(Number)
      for (const plus of [0, 1, -1]) {
        const dd = new Date(Date.UTC(y, mo - 1, d + plus))
        const t = zonedMs(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate(), h, b, tz)
        if (t >= start && t <= start + total * 1000) return { sec: (t - start) / 1000, how: 'clock' }
      }
      // 12-hour times said without am/pm: the afternoon one.
      if (!m[4] && h < 12) {
        const dd = new Date(Date.UTC(y, mo - 1, d))
        const t = zonedMs(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate(), h + 12, b, tz)
        if (t >= start && t <= start + total * 1000) return { sec: (t - start) / 1000, how: 'clock' }
      }
    }
    if (!m[4]) {
      const sec = c === null ? a * 60 + b : a * 3600 + b * 60 + c
      if (sec > 0 && sec < total) return { sec, how: 'offset' }
    }
    const span = Number.isFinite(start) && o.tz ? ` (it runs ${clockAt(start, o.tz)}–${clockAt(start + total * 1000, o.tz)})` : ''
    return { error: `${m[0]} is not during this recording${span}` }
  }
  // A person: "where Robert joins", "when Ana arrives", "Robert".
  const who = s
    .replace(/^(split\s+)?(it\s+)?(at\s+|from\s+)?(where|when|once|after|before|right before|cuando|donde|quando|onde)\s+/, '')
    .replace(/\s+(joins?|join[s]? in|arrives?|comes? in|starts? talking|speaks?|llega|entra|se une|chega|entra na call)\b.*$/, '')
    .trim()
  if (!who || /\d/.test(who)) return { error: 'say where to split: a time ("10:45") or a person ("where Robert joins")' }
  const want = foldName(who)
  const named = (l: Line) => {
    const n = l.name ? foldName(l.name) : ''
    return !!n && (n === want || n.split(/\s+/)[0] === want.split(/\s+/)[0])
  }
  let i = lines.findIndex(named)
  if (i >= 0 && lines[i].start < 120_000) {
    // Their voice is there from the start: maybe they are greeted later on by name.
    const j = lines.findIndex((l, k) => k > 0 && l.start >= MIN_PART_SEC * 1000 && foldName(l.text).includes(want))
    if (j < 0) return { error: `${who} is there from the start of the recording` }
    i = j
  }
  if (i < 0) i = lines.findIndex((l, k) => k > 0 && foldName(l.text).split(/[^a-z0-9]+/).includes(want.split(/\s+/)[0]))
  if (i <= 0) return { error: `I can't find where ${who} joins in this recording` }
  // Back to the longest silence in the two minutes before, if any is longer than 10 seconds.
  let best = i, gap = 10_000
  for (let k = i; k > 0 && lines[i].start - lines[k].start <= 120_000; k--) {
    const g = lines[k].start - lines[k - 1].end
    if (g > gap) { gap = g; best = k }
  }
  return { sec: lines[best].start / 1000, how: 'person', who }
}

/** "0:45" / "1:05:00" from seconds into the recording. */
export function fmtOffset(sec: number): string {
  const t = Math.max(0, Math.round(sec))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
