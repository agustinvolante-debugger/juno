// Deciding which recordings are one meeting, and stitching their transcripts together.
//
// Pure: no database, no server-only imports, so the browser can run the same detector the
// server does and offer the join button without a round trip.
//
// The hardware stops at 60 minutes and opens a new file, so a long meeting arrives as two or
// three recordings with a seam in the middle. The filenames encode the start time, so whether
// two files are one meeting is arithmetic, not a guess.
//
// Why the transcripts are joined rather than the audio: byte-concatenating two Opus files was
// measured on a real pair — the duration came out exactly right (72.9 min) and 99.6% of the
// words survived, but utterances collapsed from 230 to 17 and a speaker disappeared. Chained
// Ogg decodes; the diarizer does not survive it. Joining after transcription keeps each half's
// diarization intact, at the cost that speaker A in part one is not necessarily speaker A in
// part two — which the extraction prompt is told explicitly.

import type { PenSession, Utterance } from './store'
import { namedDialogue, type SpeakerMap } from './speakers'

/** Two files count as one meeting if the second starts within this many seconds of the
 *  first ending. The pen is sample-accurate, but a second of slack costs nothing. */
export const SEAM_TOLERANCE_SEC = 90

/**
 * The pen only starts a new file ON ITS OWN when the current one reaches its split length
 * (MRECSET PART, 10-240 min; Juno's default 60). A file that ends short of it was stopped by
 * someone, so whatever starts next is a new recording, however close: the founder's 22 Oct pair
 * (27 min, then a new call 9 s later) was two calls back to back, not one cut in half. So the
 * EARLIER file must last a split length, give or take this much, for the next to continue it.
 */
export const SPLIT_SLACK_SEC = 20
/** Split lengths always accepted, besides the user's saved one: older settings and other pens. */
export const COMMON_SPLITS_MIN = [30, 60, 120, 180, 240]
/**
 * What a split-length file MEASURES as, relative to its nominal length. Every real 60-minute pen
 * split in the database (22 Sep, 24 Sep, 26 Sep, 30 Sep; next file 0-1 s after) is stored as
 * 3552 s, not 3600: the pen's clock runs ~1.3% fast, so it cuts at 59:12 of real audio. Both
 * the nominal and the measured length are accepted.
 */
export const PEN_CLOCK = 3552 / 3600

export type RunOptions = {
  /** The user's saved split length in minutes (profile pen.splitMin), if any. */
  splitMin?: number | null
  /** Seams the user said are NOT one recording ("No, keep separate"), as "earlierId:laterId". */
  separate?: Set<string> | null
}

/** Did a file of this length end because the pen reached its split length? */
export function endsAtSplit(durationSec: number, splitMin?: number | null): boolean {
  const lengths = splitMin && splitMin > 0 ? [splitMin, ...COMMON_SPLITS_MIN] : COMMON_SPLITS_MIN
  return lengths.some((m) =>
    Math.abs(durationSec - m * 60) <= SPLIT_SLACK_SEC || Math.abs(durationSec - m * 60 * PEN_CLOCK) <= SPLIT_SLACK_SEC)
}

/** The key a "keep separate" seam is stored under. */
export const seamKey = (earlierId: string, laterId: string) => `${earlierId}:${laterId}`

/** Pen filenames look like R20260922-213209.WAV — date and wall-clock start. */
export function startFromName(name: string | null | undefined): Date | null {
  const m = /R(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name ?? '')
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  return Number.isNaN(t.getTime()) ? null : t
}

/** When a recording actually began, preferring the filename over the file's mtime. */
function startOf(s: PenSession): Date | null {
  return startFromName(s.source_name) ?? (s.recorded_at ? new Date(s.recorded_at) : null)
}

export type SegmentRun = { sessions: PenSession[]; totalSec: number }

/**
 * Runs of consecutive segments among the given recordings.
 *
 * Only considers recordings that are not already joined, have a duration, and whose filename
 * carries a start time — a file the user renamed or uploaded from elsewhere cannot be placed
 * on the timeline and is left alone rather than guessed at. A file continues the one before it
 * only if that one lasted a split length (endsAtSplit) and this one starts within the seam
 * tolerance of its end, and the user hasn't marked that seam as separate.
 */
export function findRuns(sessions: PenSession[], opts: RunOptions = {}): SegmentRun[] {
  const candidates = sessions
    .filter((s) => !s.merge_group && (s.duration_sec ?? 0) > 0 && startFromName(s.source_name))
    .map((s) => ({ s, start: startOf(s)! }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const runs: SegmentRun[] = []
  let current: typeof candidates = []

  const flush = () => {
    if (current.length > 1) {
      runs.push({
        sessions: current.map((c) => c.s),
        totalSec: current.reduce((n, c) => n + (c.s.duration_sec ?? 0), 0),
      })
    }
    current = []
  }

  for (const c of candidates) {
    if (!current.length) {
      current = [c]
      continue
    }
    const prev = current[current.length - 1]
    const prevEnd = prev.start.getTime() + (prev.s.duration_sec ?? 0) * 1000
    const gapSec = (c.start.getTime() - prevEnd) / 1000
    // Negative gap means overlap, which is not a seam — treat it as a separate recording.
    const continues =
      gapSec >= -2 && gapSec <= SEAM_TOLERANCE_SEC &&
      endsAtSplit(prev.s.duration_sec ?? 0, opts.splitMin) &&
      !opts.separate?.has(seamKey(prev.s.id, c.s.id))
    if (continues) current.push(c)
    else {
      flush()
      current = [c]
    }
  }
  flush()
  return runs
}


/**
 * The runs worth a "Join into one meeting" banner: every part written up. While a part is still
 * transcribing or being written up, the server joins the run itself when the last transcript
 * lands (lib/pen/merge.ts autoJoin), so offering a button then only invites a double join. (A
 * part that failed or is held can't be joined either: the join needs every transcript.)
 */
export function runsToOffer(sessions: PenSession[], opts: RunOptions = {}): SegmentRun[] {
  return findRuns(sessions, opts).filter((r) => r.sessions.every((s) => s.status === 'noted'))
}

/**
 * One transcript from several, with each part's timestamps pushed along by everything before
 * it, so a citation at 01:05:00 means an hour into the MEETING rather than five minutes into
 * part two.
 */
export function combineUtterances(segments: PenSession[]): Utterance[] {
  const out: Utterance[] = []
  let offsetMs = 0
  for (const s of segments) {
    const u = s.transcript?.utterances ?? []
    for (const x of u) {
      out.push({ ...x, start: x.start + offsetMs, end: x.end + offsetMs })
    }
    offsetMs += (s.duration_sec ?? 0) * 1000
  }
  return out
}

/**
 * The dialogue for the whole meeting, with the seams marked.
 *
 * The markers matter: AssemblyAI labels speakers per file, so the same person can be A in one
 * part and B in the next. Saying where the seam is lets the model reconcile them from names
 * and roles instead of silently treating them as different people.
 */
export function combinedDialogue(segments: PenSession[]): string {
  const parts: string[] = []
  let offsetSec = 0
  segments.forEach((s, i) => {
    const u = s.transcript?.utterances ?? []
    const body = u.length
      ? namedDialogue(u, s.speaker_map as SpeakerMap | null, s.transcript_edits)
      : (s.transcript?.text ?? '')
    const mins = Math.round(offsetSec / 60)
    parts.push(
      i === 0
        ? `--- PART 1 of ${segments.length} (from 0:00) ---\n${body}`
        : `\n\n--- PART ${i + 1} of ${segments.length} (continues at ${mins} minutes; the recorder ` +
          `started a new file here, so SPEAKER LABELS RESTART — "Speaker A" below is not ` +
          `necessarily the same person as "Speaker A" above. Reconcile them from names, roles ` +
          `and what they talk about.) ---\n${body}`,
    )
    offsetSec += s.duration_sec ?? 0
  })
  return parts.join('\n')
}

/** "6:33" from seconds since the start of the meeting. */
function hm(sec: number): string {
  const m = Math.floor(sec / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Every part of a meeting in order, each line stamped with its time FROM THE START OF THE
 * MEETING ("[6:33] Pedro: …"), so an answer can point to the moment the user will find on the
 * page. Part headers say where the recorder started a new file and that labels restart there.
 */
export function timedDialogue(segments: PenSession[], markers?: Map<string, Map<number, string>>): string {
  const out: string[] = []
  let offsetSec = 0
  segments.forEach((s, i) => {
    if (segments.length > 1) {
      out.push(i === 0
        ? `--- PART 1 of ${segments.length} (from 0:00) ---`
        : `--- PART ${i + 1} of ${segments.length} (from ${hm(offsetSec)}; a new file, so speaker labels restart here) ---`)
    }
    const u = s.transcript?.utterances ?? []
    if (u.length) {
      u.forEach((x, k) => {
        // An event's conversation starts here: say so in place, with who it was with.
        const mark = markers?.get(s.id)?.get(k)
        if (mark) out.push(`=== ${mark} ===`)
        const line = namedDialogue([x], s.speaker_map as SpeakerMap | null, s.transcript_edits?.[String(k)] !== undefined ? { '0': s.transcript_edits[String(k)] } : null)
        out.push(`[${hm(offsetSec + x.start / 1000)}] ${line}`)
      })
    } else if (s.transcript?.text) out.push(s.transcript.text)
    offsetSec += s.duration_sec ?? 0
  })
  return out.join('\n')
}
