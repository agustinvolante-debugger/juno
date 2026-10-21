// Juno Pen settings ↔ the pen's MRECSET.TXT (21 Oct). Pure, no server imports: the browser imports
// this to write the file onto the pen, the server (lib/pen/profile.ts, /api/pen/pen-settings) to
// clean what it stores. Tests: .pentest/pen-device-unit.mts.
//
// The file as measured on the founder's pen (/Volumes/JUNO/MRECSET.TXT, 21 Oct):
//   TIME:15:30 2026/10/21\n                       ← the maker's Windows tool rewrote this line, LF only
//   VOR:0\t//Voice activated setting (0--7) ...\r\n
//   BIT:4\t// Bit Rate Setting, 1 is 32K, ...\r\n
//   GAIN:5\t// Recording Sensitivity (1--7) ...\r\n
//   PART:60\t//Recording File Segmented Time (10--240 minutes). Example: 60.\r\n
//   \n × padding                                  ← factory file = 512 bytes; after the tool, 511
// writeMrecset changes only the values it is given and keeps every line's comment and ending and
// the file's length (longer content is padded to the next 512 multiple, never cut).

import { BIT_OF, GAIN_OF, PEN_DEFAULTS, type PenQuality, type PenSensitivity, type PenSettings } from './pen-device'

export type MrecsetKey = 'TIME' | 'VOR' | 'BIT' | 'GAIN' | 'PART'
const KEYS: MrecsetKey[] = ['TIME', 'VOR', 'BIT', 'GAIN', 'PART']

/** The factory comments, for a key the file doesn't have yet (a file the maker's tool cut down to TIME). */
const FACTORY_COMMENT: Record<MrecsetKey, string> = {
  TIME: '',
  VOR: '\t//Voice activated setting (0--7) 0 is off, 1-7 is voice activated on, the larger  number is, the more sensitive will be.',
  BIT: '\t// Bit Rate Setting, 1 is 32K, 2 is 64K, 3 is 128K, 4 is 192K',
  GAIN: '\t// Recording Sensitivity (1--7) The larger number is, the louder recording sound will be.',
  PART: '\t//Recording File Segmented Time (10--240 minutes). Example: 60.',
}

const BLOCK = 512

const int = (v: unknown, lo: number, hi: number): number | undefined => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

/**
 * What may be stored: known keys only, enums checked, numbers rounded and clamped to the pen's
 * ranges, anything else dropped. undefined when nothing valid is left.
 */
export function cleanPenSettings(raw: unknown): Partial<PenSettings> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const out: Partial<PenSettings> = {}
  if (r.quality === 'standard' || r.quality === 'high') out.quality = r.quality as PenQuality
  if (r.sensitivity === 'soft' || r.sensitivity === 'normal' || r.sensitivity === 'loud') out.sensitivity = r.sensitivity as PenSensitivity
  if (typeof r.voiceActivated === 'boolean') out.voiceActivated = r.voiceActivated
  const vl = int(r.voiceLevel, 1, 7)
  if (vl !== undefined) out.voiceLevel = vl
  const sm = int(r.splitMin, 10, 240)
  if (sm !== undefined) out.splitMin = sm
  if (r.autoClear === true || r.autoClear === false || r.autoClear === null) out.autoClear = r.autoClear
  return Object.keys(out).length ? out : undefined
}

/** Full settings: the defaults under whatever valid values were saved. */
export function withDefaults(saved: unknown): PenSettings {
  return { ...PEN_DEFAULTS, ...(cleanPenSettings(saved) ?? {}) }
}

/** The settings as the pen's keys. VOR 0 = off; values clamped again, so a bad object can't reach the pen. */
export function penSettingsToKeys(s: PenSettings): { VOR: number; BIT: number; GAIN: number; PART: number } {
  const f = withDefaults(s)
  return { VOR: f.voiceActivated ? f.voiceLevel : 0, BIT: BIT_OF[f.quality], GAIN: GAIN_OF[f.sensitivity], PART: f.splitMin }
}

/** 'HH:MM YYYY/MM/DD' from the Date's LOCAL fields (the pen has no time zone: it shows what it's given). */
export function timeLine(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} ${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

type Line = { text: string; eol: string }

/** Lines with their own endings; the trailing run of empty lines (the \n padding) dropped. */
function contentLines(text: string): Line[] {
  const lines: Line[] = []
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0] === '') break
    lines.push({ text: m[1], eol: m[2] })
  }
  while (lines.length && lines[lines.length - 1].text.trim() === '') lines.pop()
  return lines
}

/** KEY: value <comment>. The comment starts at the first tab or "//". */
const LINE_RE = /^(\s*)(TIME|VOR|BIT|GAIN|PART)(\s*:\s*)(.*?)((?:[ \t]*(?:\t|\/\/)).*)?$/i

/** The keys in a MRECSET.TXT. TIME as written; the rest as integers when they are integers. */
export function parseMrecset(text: string): { TIME?: string; VOR?: number; BIT?: number; GAIN?: number; PART?: number } {
  const out: { TIME?: string; VOR?: number; BIT?: number; GAIN?: number; PART?: number } = {}
  for (const { text: line } of contentLines(text)) {
    const m = LINE_RE.exec(line)
    if (!m) continue
    const key = m[2].toUpperCase() as MrecsetKey
    const value = m[4].trim()
    if (key === 'TIME') {
      if (value) out.TIME = value
    } else if (/^\d+$/.test(value)) {
      out[key] = Number(value)
    }
  }
  return out
}

/**
 * The file with only the given keys' values replaced. Each line keeps its comment and its own
 * line ending; a key the file lacks is added (TIME first, the others after, with the factory
 * comment, CRLF). Padded with \n to the original length, or to the next 512 multiple when the
 * new content no longer fits (never truncated). An empty original = a fresh 512-byte file.
 */
export function writeMrecset(original: string, keys: Partial<Record<MrecsetKey, string | number>>): string {
  const lines = contentLines(original)
  const seen = new Set<MrecsetKey>()
  for (const l of lines) {
    const m = LINE_RE.exec(l.text)
    if (!m) continue
    const key = m[2].toUpperCase() as MrecsetKey
    seen.add(key)
    if (keys[key] === undefined) continue
    l.text = `${m[1]}${m[2]}${m[3]}${keys[key]}${m[5] ?? ''}`
  }
  if (lines.length && !lines[lines.length - 1].eol) lines[lines.length - 1].eol = '\r\n'
  for (const k of KEYS) {
    if (seen.has(k) || keys[k] === undefined) continue
    const line = { text: `${k}:${keys[k]}${FACTORY_COMMENT[k]}`, eol: '\r\n' }
    if (k === 'TIME') lines.unshift(line)
    else lines.push(line)
  }
  const body = lines.map((l) => l.text + l.eol).join('')
  const was = original.length || BLOCK
  const size = body.length <= was ? was : Math.ceil(body.length / BLOCK) * BLOCK
  return body + '\n'.repeat(size - body.length)
}
