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
const SEAM_TOLERANCE_SEC = 90

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
 * on the timeline and is left alone rather than guessed at.
 */
export function findRuns(sessions: PenSession[]): SegmentRun[] {
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
    if (gapSec >= -2 && gapSec <= SEAM_TOLERANCE_SEC) current.push(c)
    else {
      flush()
      current = [c]
    }
  }
  flush()
  return runs
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
