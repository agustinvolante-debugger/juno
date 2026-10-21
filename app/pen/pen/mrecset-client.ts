// MRECSET.TXT on the browser side (21 Oct): read the pen's settings file and write the clock and
// the saved settings back, keeping its shape (one "KEY:value<TAB>// comment" line each, CRLF, the
// comments untouched, the file padded to 512 bytes with \n). Format: lib/pen/pen-device.ts.
//
// TODO(merge): replace with lib/pen/pen-settings.ts helpers at merge (penSettingsToKeys,
// parseMrecset, writeMrecset, timeLine). Same names and the same shapes on purpose, so the
// swap is an import change.

import { BIT_OF, GAIN_OF, type PenSettings } from '@/lib/pen/pen-device'

export type MrecsetKeys = { VOR: number; BIT: number; GAIN: number; PART: number }

const PAD_TO = 512
const LINE_RE = /^([A-Z]+):([^\t\r\n]*?)(\s*\t.*)?$/

/** The four settings keys a PenSettings stands for. */
export function penSettingsToKeys(s: PenSettings): MrecsetKeys {
  return {
    VOR: s.voiceActivated ? Math.min(7, Math.max(1, Math.round(s.voiceLevel))) : 0,
    BIT: BIT_OF[s.quality],
    GAIN: GAIN_OF[s.sensitivity],
    PART: Math.min(240, Math.max(10, Math.round(s.splitMin))),
  }
}

/** "TIME:14:58 2026/10/21", the browser's local time. */
export function timeLine(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `TIME:${p(d.getHours())}:${p(d.getMinutes())} ${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

/** KEY → raw value (comments dropped). Unknown and blank lines are ignored. */
export function parseMrecset(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = LINE_RE.exec(line)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

/** The TIME line as a local Date, or null when missing or unreadable. */
export function parseTime(v: string | undefined): Date | null {
  const m = v && /^(\d{1,2}):(\d{2})\s+(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(v.trim())
  if (!m) return null
  const d = new Date(+m[3], +m[4] - 1, +m[5], +m[1], +m[2])
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The file with `set` applied: a key that's there keeps its place, its comment and its own line
 * ending (the real pen's TIME line ends in LF only, the rest CRLF); a missing key is added at the
 * end with CRLF. Lines Juno doesn't know stay as they are. The trailing \n padding is put back
 * so the file keeps its length (the real one is 511 bytes; 512 when there was no file).
 */
export function writeMrecset(text: string, set: Partial<Record<string, string | number>>): string {
  const target = text ? new TextEncoder().encode(text).length : PAD_TO
  // Lines with their endings; the padding is the run of bare \n at the very end.
  // (a CRLF line keeps its \n; a last line ending in LF alone gets CRLF back below).
  const body = text.replace(/\r?\n*$/, (m) => (m.startsWith('\r') ? '\r\n' : ''))
  const parts = body.match(/[^\r\n]*(\r\n|\n|\r|$)/g)?.filter((x) => x !== '') ?? []
  const left = new Map(Object.entries(set).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
  const out = parts.map((part) => {
    const end = /(\r\n|\n|\r)$/.exec(part)?.[0] ?? ''
    const line = part.slice(0, part.length - end.length)
    const m = LINE_RE.exec(line)
    if (!m || !left.has(m[1])) return part
    const v = left.get(m[1])!
    left.delete(m[1])
    return `${m[1]}:${v}${m[3] ?? ''}${end || '\r\n'}`
  })
  if (out.length && !/(\r\n|\n|\r)$/.test(out[out.length - 1])) out[out.length - 1] += '\r\n'
  for (const [k, v] of left) out.push(`${k}:${v}\r\n`)
  let next = out.join('')
  const bytes = new TextEncoder().encode(next).length
  if (bytes < target) next += '\n'.repeat(target - bytes)
  return next
}
