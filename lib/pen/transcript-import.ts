// Turning a pasted or uploaded transcript into utterances.
//
// People arrive with text from other recorders: Pocket's free plan exports text but not
// audio, Otter and Plaud export text, and subtitle files (.srt, .vtt) come from everywhere.
// Nothing is transcribed here, so an import costs only the notes. Pure: the browser uses it
// to preview, the server uses it to store.

import type { Utterance } from './store'

export type Parsed = {
  utterances: Utterance[]
  /** Label -> the name the text gave that speaker ("A" -> "Sarah"). */
  names: Record<string, string>
  /** Estimated length from the word count, for the meter and the recording's duration. */
  estSec: number
}

/** Speaking pace used to estimate a duration when the text carries no timestamps. */
const WORDS_PER_MIN = 150
const MAX_NAME = 40

const TIME = /\[?\(?\b(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\b\)?\]?/g
const SRT_ARROW = /-->/

/** "Sarah:", "Speaker 1:", "[00:01] Sarah:", "Sarah (00:01):" at the start of a line. */
const SPEAKER_LINE = /^\s*(?:\[?\(?(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\)?\]?\s*[-–]?\s*)?([\p{L}][\p{L}\p{M}'’.\- ]{0,38}?|Speaker\s*\d+)\s*(?:\((?:\d{1,2}:)?\d{1,2}:\d{2}\))?\s*:\s+(.+)$/u

/** A line that is only a name, with the words on the following lines (Otter, Pocket style). */
const NAME_ONLY = /^\s*([\p{L}][\p{L}\p{M}'’.\- ]{0,38}?|Speaker\s*\d+)\s*(?:\(?(?:\d{1,2}:)?\d{1,2}:\d{2}\)?)?\s*$/u

function label(i: number): string {
  // A, B, ... Z, AA, AB: matches AssemblyAI's labels so everything downstream treats an
  // import like any other recording.
  let s = ''
  let n = i
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

/** Words that look like a speaker name but open ordinary sentences. */
const NOT_NAMES = new Set(['note', 'notes', 'summary', 'action items', 'nota', 'resumen', 'ps', 'p.s', 'http', 'https', 're', 'fw'])

function looksLikeName(s: string): boolean {
  const t = s.trim()
  if (!t || t.length > MAX_NAME) return false
  if (NOT_NAMES.has(t.toLowerCase())) return false
  // At most four words: "Maria José", "Dr. Okonkwo", "Speaker 2".
  return t.split(/\s+/).length <= 4
}

/** "Sarah Henderson", "Speaker 2": every word capitalised, no sentence punctuation. */
function isTitleCase(s: string): boolean {
  if (/[.?!,]$/.test(s.trim())) return false
  return s.trim().split(/\s+/).every((w) => /^(\p{Lu}|\d)/u.test(w))
}

export function parseTranscript(raw: string): Parsed {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/^WEBVTT.*$/m, '')
    .split('\n')
    // Subtitle files: drop cue numbers and "00:00:01,000 --> 00:00:04,000" lines.
    .filter((l) => !SRT_ARROW.test(l) && !/^\s*\d+\s*$/.test(l))

  const turns: { who: string | null; text: string }[] = []
  let pendingName: string | null = null
  let paragraphBreak = false

  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      paragraphBreak = true
      continue
    }
    const m = SPEAKER_LINE.exec(t)
    if (m && looksLikeName(m[1])) {
      turns.push({ who: m[1].trim(), text: m[2].trim() })
      pendingName = null
      continue
    }
    const n = NAME_ONLY.exec(t)
    if (n && looksLikeName(n[1]) && (/\d:\d{2}/.test(t) || isTitleCase(n[1]))) {
      // Only treat a bare line as a name when the next text line belongs to it.
      pendingName = n[1].trim()
      continue
    }
    const text = t.replace(TIME, '').trim()
    if (!text) continue
    if (pendingName) {
      turns.push({ who: pendingName, text })
      pendingName = null
    } else if (turns.length && turns[turns.length - 1].who === null && !paragraphBreak) {
      // Unattributed text keeps flowing into one paragraph until a blank line breaks it.
      turns[turns.length - 1].text += ` ${text}`
    } else {
      turns.push({ who: null, text })
    }
    paragraphBreak = false
  }

  // Names in order of first appearance become A, B, C.
  const labelOf = new Map<string, string>()
  const names: Record<string, string> = {}
  for (const turn of turns) {
    if (!turn.who) continue
    const key = turn.who.toLowerCase()
    if (!labelOf.has(key)) {
      const l = label(labelOf.size)
      labelOf.set(key, l)
      // "Speaker 1" is a label, not a name: keep the letter, leave it unnamed.
      if (!/^speaker\s*\d+$/i.test(turn.who)) names[l] = turn.who
    }
  }
  const unknown = labelOf.size ? label(labelOf.size) : 'A'

  let offset = 0
  let words = 0
  const utterances: Utterance[] = turns.map((turn) => {
    const w = turn.text.split(/\s+/).filter(Boolean).length
    words += w
    const ms = Math.round((w / WORDS_PER_MIN) * 60000)
    const u = { speaker: turn.who ? labelOf.get(turn.who.toLowerCase())! : unknown, text: turn.text, start: offset, end: offset + ms }
    offset += ms
    return u
  })

  return { utterances, names, estSec: Math.round((words / WORDS_PER_MIN) * 60) }
}
