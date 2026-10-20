// A meeting out of an invitation email (20 Oct): the .ics a calendar attaches (text/calendar), or,
// when there is none, the invitation's own words (Google: "Invitation: Juno sync @ Tue Oct 20, 2026
// 1pm - 1:30pm (GMT-4) (agustin@tryjunoapp.com)"). Pure, for tests (.pentest/search-unit.mts).
//
// The email is untrusted: this only reads a start, an end, a title and who is invited; nothing
// here can make Juno do anything but know when a meeting is.

import { localToUtc, validZone } from './timezone'

export type Invite = {
  title: string
  /** UTC ISO start / end. */
  start: string
  end: string | null
  allDay: boolean
  /** The zone the invite was written in (IANA, or "UTC-04:00" for a bare offset), for "1:00 pm New York time". */
  zone: string | null
  organizer: { email: string; name: string | null } | null
  attendees: { email: string; name: string | null }[]
  uid: string | null
  /** REQUEST (an invite), CANCEL (cancelled), REPLY… */
  method: string | null
  cancelled: boolean
  from: 'ics' | 'text'
}

/* ------------------------------------------------------------------ .ics */

/** RFC 5545 line unfolding: a CRLF followed by a space or tab continues the line. */
const unfold = (t: string) => t.replace(/\r?\n[ \t]/g, '')
const unescape = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()

/** Windows zone names Outlook writes as TZID. */
const WINDOWS: Record<string, string> = {
  'eastern standard time': 'America/New_York', 'central standard time': 'America/Chicago', 'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles', 'pacific sa standard time': 'America/Santiago', 'e. south america standard time': 'America/Sao_Paulo',
  'argentina standard time': 'America/Argentina/Buenos_Aires', 'sa pacific standard time': 'America/Bogota', 'central standard time (mexico)': 'America/Mexico_City',
  'gmt standard time': 'Europe/London', 'w. europe standard time': 'Europe/Berlin', 'romance standard time': 'Europe/Paris', 'utc': 'UTC',
}

function zoneFrom(tzid: string | null | undefined): string | null {
  if (!tzid) return null
  const t = tzid.replace(/^"|"$/g, '').trim()
  if (validZone(t)) return t
  return WINDOWS[(t as string).toLowerCase()] ?? null
}

/** DTSTART value → UTC ISO. 20261020T170000Z; TZID=America/New_York:20261020T130000; VALUE=DATE:20261020. */
function icsTime(params: string, value: string, fallbackTz: string | null): { iso: string; allDay: boolean; zone: string | null } | null {
  const v = value.trim()
  const d = /^(\d{4})(\d\d)(\d\d)$/.exec(v)
  if (d) return { iso: `${d[1]}-${d[2]}-${d[3]}`, allDay: true, zone: null }
  const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?(Z)?$/.exec(v)
  if (!m) return null
  if (m[7]) return { iso: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toISOString(), allDay: false, zone: 'UTC' }
  const tz = zoneFrom(/TZID=([^;:]+)/i.exec(params)?.[1]) ?? fallbackTz
  if (!tz) return null
  const at = localToUtc(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, tz)
  return at ? { iso: at.toISOString(), allDay: false, zone: tz } : null
}

function person(params: string, value: string): { email: string; name: string | null } | null {
  const email = /mailto:([^\s;]+)/i.exec(value)?.[1]?.toLowerCase()
  if (!email || !email.includes('@')) return null
  const cn = /CN=("([^"]*)"|[^;:]*)/i.exec(params)
  return { email, name: (cn?.[2] ?? cn?.[1] ?? '').trim() || null }
}

/** The first VEVENT of an iCalendar text, or null. `fallbackTz` for floating times (no zone given). */
export function parseIcs(text: string, fallbackTz: string | null = null): Invite | null {
  const t = unfold(text)
  const method = /^METHOD:(.+)$/im.exec(t)?.[1]?.trim().toUpperCase() ?? null
  const ev = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/i.exec(t)?.[1]
  if (!ev) return null
  const lines = ev.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const get = (name: string) => {
    const l = lines.find((x) => new RegExp(`^${name}[;:]`, 'i').test(x))
    if (!l) return null
    const colon = l.search(/:(?![^"]*"[^"]*$)/)
    const i = colon >= 0 ? colon : l.indexOf(':')
    return { params: l.slice(name.length, i), value: l.slice(i + 1) }
  }
  const ds = get('DTSTART')
  if (!ds) return null
  const start = icsTime(ds.params, ds.value, fallbackTz)
  if (!start) return null
  const de = get('DTEND')
  const end = de ? icsTime(de.params, de.value, start.zone ?? fallbackTz) : null
  const org = get('ORGANIZER')
  const attendees = lines.filter((l) => /^ATTENDEE[;:]/i.test(l)).map((l) => {
    const i = l.toLowerCase().lastIndexOf(':mailto:')
    return i > 0 ? person(l.slice(8, i), l.slice(i + 1)) : null
  }).filter((x): x is { email: string; name: string | null } => Boolean(x))
  const status = get('STATUS')?.value.trim().toUpperCase()
  return {
    title: unescape(get('SUMMARY')?.value ?? '') || 'Meeting',
    start: start.iso,
    end: end?.iso ?? null,
    allDay: start.allDay,
    zone: start.zone,
    organizer: org ? person(org.params, org.value) : null,
    attendees,
    uid: get('UID')?.value.trim() ?? null,
    method,
    cancelled: method === 'CANCEL' || status === 'CANCELLED',
    from: 'ics',
  }
}

/* ---------------------------------------------------------- the words */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1, janeiro: 1, feb: 2, february: 2, febrero: 2, fev: 2, fevereiro: 2, mar: 3, march: 3, marzo: 3, marco: 3, março: 3,
  apr: 4, april: 4, abr: 4, abril: 4, may: 5, mayo: 5, mai: 5, maio: 5, jun: 6, june: 6, junio: 6, junho: 6, jul: 7, july: 7, julio: 7, julho: 7,
  aug: 8, august: 8, ago: 8, agosto: 8, sep: 9, sept: 9, september: 9, septiembre: 9, set: 9, setembro: 9, oct: 10, october: 10, octubre: 10, out: 10, outubro: 10,
  nov: 11, november: 11, noviembre: 11, novembro: 11, dec: 12, december: 12, dic: 12, diciembre: 12, dez: 12, dezembro: 12,
}

/** Zone names Google writes in invitations ("Eastern Time - New York", "Hora de Chile"). */
const NAMED: [RegExp, string][] = [
  [/eastern|new york|hora del este/i, 'America/New_York'], [/central time|chicago/i, 'America/Chicago'], [/mountain|denver/i, 'America/Denver'],
  [/pacific|los angeles|hora del pac[ií]fico/i, 'America/Los_Angeles'], [/chile|santiago/i, 'America/Santiago'], [/bras[ií]lia|s[aã]o paulo/i, 'America/Sao_Paulo'],
  [/argentina|buenos aires/i, 'America/Argentina/Buenos_Aires'], [/colombia|bogot[aá]/i, 'America/Bogota'], [/mexico|ciudad de m[eé]xico/i, 'America/Mexico_City'],
  [/peru|per[uú]|lima/i, 'America/Lima'], [/london|british|greenwich mean/i, 'Europe/London'], [/central european|berlin|paris|madrid/i, 'Europe/Madrid'],
]

/** "(GMT-4)", "(UTC-04:00)", "(GMT-03:00) Santiago", "(Eastern Time - New York)" → a zone. Offsets as minutes east of UTC. */
export function zoneOfLabel(label: string): { tz: string | null; offsetMin: number | null } {
  const off = /\b(?:GMT|UTC)\s*([+-−])\s*(\d{1,2})(?::?(\d\d))?/i.exec(label)
  if (off) {
    const sign = off[1] === '+' ? 1 : -1
    return { tz: null, offsetMin: sign * (Number(off[2]) * 60 + Number(off[3] ?? 0)) }
  }
  if (/\((GMT|UTC)\)|\bUTC\b|\bGMT\b/i.test(label)) return { tz: 'UTC', offsetMin: 0 }
  for (const [re, tz] of NAMED) if (re.test(label)) return { tz, offsetMin: null }
  const iana = /\b([A-Z][a-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)\b/.exec(label)?.[1]
  return iana && validZone(iana) ? { tz: iana, offsetMin: null } : { tz: null, offsetMin: null }
}

/** "1pm", "1:30pm", "13:00", "1:00 PM", "1 p.m." → minutes after midnight. */
function clockMin(s: string): number | null {
  const m = /^(\d{1,2})(?::(\d\d))?\s*([ap])?\.?\s*m?\.?$/i.exec(s.trim())
  if (!m) return null
  let h = Number(m[1])
  const mi = Number(m[2] ?? 0)
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'p'
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
  }
  return h < 24 && mi < 60 ? h * 60 + mi : null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Wall time in a zone (or a fixed offset) → UTC ISO. */
function toUtc(y: number, mo: number, d: number, min: number, z: { tz: string | null; offsetMin: number | null }, fallbackTz: string | null): { iso: string; zone: string | null } | null {
  if (z.offsetMin != null) {
    const iso = new Date(Date.UTC(y, mo - 1, d, 0, min) - z.offsetMin * 60000).toISOString()
    const a = Math.abs(z.offsetMin)
    return { iso, zone: `UTC${z.offsetMin < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}` }
  }
  const tz = z.tz ?? fallbackTz
  if (!tz) return null
  const at = localToUtc(`${y}-${pad(mo)}-${pad(d)}T${pad(Math.floor(min / 60))}:${pad(min % 60)}`, tz)
  return at ? { iso: at.toISOString(), zone: tz } : null
}

/**
 * A meeting from an invitation's subject and text, when there is no .ics: "<Title> @ Tue Oct 20,
 * 2026 1pm - 1:30pm (GMT-4)" (Google, EN), "mar 20 oct 2026 13:00 - 13:30 (GMT-3)" (ES/PT), and
 * Google's body line "Tuesday Oct 20, 2026 ⋅ 1pm – 1:30pm (Eastern Time - New York)". A date with no
 * year is the next one from `now`. A time with no zone uses `fallbackTz` (the user's), else null.
 */
export function parseInviteText(subject: string, body: string, o: { now?: Date; fallbackTz?: string | null } = {}): Invite | null {
  const now = o.now ?? new Date()
  const text = `${subject}\n${body}`.replace(/ | /g, ' ')
  const DATE_EN = /(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i
  const DATE_ES = /(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom|seg|ter|qua|qui|sex)[a-zçáéíóú]*\.?,?\s+(\d{1,2})\s+(?:de\s+)?([a-zç]{3,10})\.?\s+(?:de\s+)?(\d{4})?/i
  const TIMES = /(\d{1,2}(?::\d\d)?\s*(?:[ap]\.?m\.?)?)\s*[-–—]\s*(\d{1,2}(?::\d\d)?\s*(?:[ap]\.?m\.?)?)\s*(\([^)]*\))?/i
  for (const line of text.split(/\n/)) {
    let y: number | null = null, mo: number | null = null, d: number | null = null, rest = ''
    const en = DATE_EN.exec(line)
    const es = en ? null : DATE_ES.exec(line)
    if (en && MONTHS[en[1].toLowerCase()]) {
      mo = MONTHS[en[1].toLowerCase()]; d = Number(en[2]); y = en[3] ? Number(en[3]) : null; rest = line.slice(en.index + en[0].length)
    } else if (es && MONTHS[es[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ) {
      mo = MONTHS[es[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]; d = Number(es[1]); y = es[3] ? Number(es[3]) : null; rest = line.slice(es.index + es[0].length)
    } else continue
    const tm = TIMES.exec(rest)
    if (!tm) continue
    let s = clockMin(tm[1]), e = clockMin(tm[2])
    // "1 - 1:30pm": the first takes the second's am/pm.
    if (s != null && e != null && !/[ap]/i.test(tm[1]) && /p/i.test(tm[2]) && s < 12 * 60 && s + 12 * 60 <= e) s += 12 * 60
    if (s == null) continue
    const label = tm[3] ?? (/\((?:GMT|UTC)[^)]*\)/i.exec(rest)?.[0] ?? '')
    const z = zoneOfLabel(label)
    if (y == null) {
      y = now.getUTCFullYear()
      if (Date.UTC(y, mo - 1, d) < now.getTime() - 2 * 86_400_000) y += 1
    }
    const st = toUtc(y, mo, d, s, z, o.fallbackTz ?? null)
    if (!st) continue
    const en2 = e != null ? toUtc(y, mo, d, e < s ? e + 24 * 60 : e, z, o.fallbackTz ?? null) : null
    const title = (/^(?:updated\s+)?(?:invitation|invitación|convite|invite)\s*(?:actualizada|atualizado)?:\s*(.+?)\s+@\s+/i.exec(subject)?.[1] ?? subject.replace(/^(?:re|fwd?):\s*/i, '')).trim().slice(0, 200)
    return { title: title || 'Meeting', start: st.iso, end: en2?.iso ?? null, allDay: false, zone: st.zone, organizer: null, attendees: [], uid: null, method: /cancel/i.test(subject) ? 'CANCEL' : 'REQUEST', cancelled: /cancel/i.test(subject), from: 'text' }
  }
  return null
}
