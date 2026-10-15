// Calendar links (plan F1): a signed .ics link that opens Apple Calendar's "Add event" sheet on
// iPhone (Google Calendar on Android), and a Google Calendar template link. No calendar
// connection: the user taps, adds it, comes back.
//
// The event travels inside the link (compact JSON, base64url) with an HMAC from NEXTAUTH_SECRET,
// so there is nothing to store and nothing to clean up. A link expires after LINK_TTL_DAYS;
// rotating the secret breaks old links, which is fine for a "tap to add" link.
//
// Also the invite: an emailed .ics (METHOD:REQUEST) to the other person, sent as "Name via
// Juno" with the user as ORGANIZER, Reply-To and BCC, through the follow-up email path.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'
import { DAILY_SEND_CAP, bodyHtml, fromLine, sentToday } from './follow-up'
import { getProfile } from './profile'
import { validZone, wallIn, whenLabel, zoneOffsetMin } from './timezone'

export type CalEvent = {
  title: string
  /** ISO with offset, or UTC. */
  start: string
  durationMin?: number
  /** IANA zone the time was said in, e.g. America/Los_Angeles. */
  tz?: string
  description?: string
  location?: string
  /** Alarm before the start, in minutes (default 30). */
  alarmMin?: number
}

export const LINK_TTL_DAYS = 60
const DEFAULT_DURATION = 30
const DEFAULT_ALARM = 30

const baseUrl = () => (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set; calendar links cannot be signed.')
  return s
}

const sign = (body: string) => crypto.createHmac('sha256', secret()).update(`ics.${body}`).digest('base64url').slice(0, 22)

/** Bounded copy of the event, so a link stays short and a token cannot carry a novel. */
function tidy(ev: CalEvent): CalEvent {
  const startMs = Date.parse(ev.start)
  if (Number.isNaN(startMs)) throw new Error('calendar event needs a valid start')
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d)
  return {
    title: (ev.title ?? '').trim().slice(0, 200) || 'Meeting',
    start: new Date(startMs).toISOString(),
    durationMin: n(ev.durationMin, 5, 24 * 60, DEFAULT_DURATION),
    tz: validZone(ev.tz) ? ev.tz : undefined,
    description: ev.description?.trim().slice(0, 300) || undefined,
    location: ev.location?.trim().slice(0, 200) || undefined,
    alarmMin: n(ev.alarmMin, 0, 7 * 24 * 60, DEFAULT_ALARM),
  }
}

type Packed = { t: string; s: number; d: number; z?: string; n?: string; l?: string; a: number; x: number }

export function eventToken(ev: CalEvent, ttlDays = LINK_TTL_DAYS): string {
  const e = tidy(ev)
  const p: Packed = {
    t: e.title,
    s: Math.floor(Date.parse(e.start) / 1000),
    d: e.durationMin!,
    ...(e.tz ? { z: e.tz } : {}),
    ...(e.description ? { n: e.description } : {}),
    ...(e.location ? { l: e.location } : {}),
    a: e.alarmMin!,
    x: Math.floor(Date.now() / 1000) + ttlDays * 86400,
  }
  const body = Buffer.from(JSON.stringify(p)).toString('base64url')
  return `${body}.${sign(body)}`
}

/** The event in a token, or null when it is forged, malformed or expired. */
export function readToken(token: string): CalEvent | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = sign(body)
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Packed
    if (typeof p.x !== 'number' || p.x * 1000 < Date.now()) return null
    return tidy({ title: p.t, start: new Date(p.s * 1000).toISOString(), durationMin: p.d, tz: p.z, description: p.n, location: p.l, alarmMin: p.a })
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ .ics */

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const wallStamp = (w: ReturnType<typeof wallIn>) => `${w.y}${pad(w.mo)}${pad(w.d)}T${pad(w.h)}${pad(w.mi)}${pad(w.s)}`

/** RFC 5545 TEXT escaping. */
export function icsEscape(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Folds a content line at 75 octets (CRLF + space), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = Buffer.byteLength(ch)
    const limit = out.length ? 74 : 75 // continuation lines start with a space
    if (bytes + b > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

const offStr = (min: number) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`

/**
 * A VTIMEZONE with the zone's real transitions from the year before the event to the year
 * after, found by asking Intl. Calendars mostly know IANA names, but RFC 5545 wants the
 * definition and Outlook relies on it.
 */
function vtimezone(tz: string, startMs: number): string[] {
  const year = new Date(startMs).getUTCFullYear()
  const from = Date.UTC(year - 1, 0, 1)
  const to = Date.UTC(year + 2, 0, 1)
  const H = 3600000
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tz}`]
  const shifts: { at: number; before: number; after: number }[] = []
  let prev = zoneOffsetMin(tz, from)
  for (let t = from + 6 * H; t <= to; t += 6 * H) {
    const off = zoneOffsetMin(tz, t)
    if (off === prev) continue
    let lo = t - 6 * H
    let hi = t
    while (hi - lo > 60000) {
      const mid = Math.floor((lo + hi) / 2 / 60000) * 60000
      if (zoneOffsetMin(tz, mid) === prev) lo = mid
      else hi = mid
    }
    shifts.push({ at: hi, before: prev, after: off })
    prev = off
  }
  if (!shifts.length) {
    const off = offStr(prev)
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${off}`, `TZOFFSETTO:${off}`, 'END:STANDARD')
  } else {
    for (const s of shifts) {
      const kind = s.after > s.before ? 'DAYLIGHT' : 'STANDARD'
      // DTSTART of a transition is the local time just before it, in the old offset.
      const w = wallIn('UTC', s.at + s.before * 60000)
      lines.push(`BEGIN:${kind}`, `DTSTART:${wallStamp(w)}`, `TZOFFSETFROM:${offStr(s.before)}`, `TZOFFSETTO:${offStr(s.after)}`, `END:${kind}`)
    }
  }
  lines.push('END:VTIMEZONE')
  return lines
}

export type IcsOpts = {
  /** PUBLISH (add to my calendar) or REQUEST (an invite). */
  method?: 'PUBLISH' | 'REQUEST'
  uid?: string
  organizer?: { name?: string | null; email: string }
  attendees?: { name?: string | null; email: string }[]
  /** For REQUEST: the address that actually sent it on the organizer's behalf. */
  sentBy?: string
}

const cn = (name: string | null | undefined) => {
  const c = (name ?? '').replace(/["\r\n;:,]/g, '').trim()
  return c ? `;CN="${c}"` : ''
}

export function buildIcs(input: CalEvent, o: IcsOpts = {}): string {
  const ev = tidy(input)
  const startMs = Date.parse(ev.start)
  const endMs = startMs + ev.durationMin! * 60000
  const uid = o.uid ?? `${crypto.createHash('sha256').update(`${ev.title}|${ev.start}|${ev.durationMin}`).digest('hex').slice(0, 24)}@tryjunoapp.com`
  const time = (ms: number) => (ev.tz ? `;TZID=${ev.tz}:${wallStamp(wallIn(ev.tz, ms))}` : `:${utcStamp(ms)}`)
  const method = o.method ?? 'PUBLISH'

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Juno Pen//Calendar//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`]
  if (ev.tz) lines.push(...vtimezone(ev.tz, startMs))
  lines.push(
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(Date.now())}`,
    `DTSTART${time(startMs)}`,
    `DTEND${time(endMs)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
  )
  if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`)
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`)
  if (o.organizer) {
    lines.push(`ORGANIZER${cn(o.organizer.name)}${o.sentBy ? `;SENT-BY="mailto:${o.sentBy}"` : ''}:mailto:${o.organizer.email}`)
  }
  for (const a of o.attendees ?? []) {
    lines.push(`ATTENDEE${cn(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`)
  }
  if (method === 'REQUEST') lines.push('SEQUENCE:0', 'STATUS:CONFIRMED')
  lines.push('TRANSP:OPAQUE')
  if (ev.alarmMin! > 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${ev.alarmMin}M`, 'END:VALARM')
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/* ------------------------------------------------------------------ links */

export function googleLink(input: CalEvent): string {
  const ev = tidy(input)
  const startMs = Date.parse(ev.start)
  const endMs = startMs + ev.durationMin! * 60000
  // With ctz, Google reads floating dates as that zone's wall time; without it, UTC stamps.
  const dates = ev.tz ? `${wallStamp(wallIn(ev.tz, startMs))}/${wallStamp(wallIn(ev.tz, endMs))}` : `${utcStamp(startMs)}/${utcStamp(endMs)}`
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates })
  if (ev.tz) q.set('ctz', ev.tz)
  if (ev.description) q.set('details', ev.description)
  if (ev.location) q.set('location', ev.location)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export function calendarLinks(ev: CalEvent): { ics: string; google: string } {
  return { ics: `${baseUrl()}/api/pen/ics/${eventToken(ev)}`, google: googleLink(ev) }
}

/* ------------------------------------------------------------------ invite */

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

/**
 * Emails `toEmail` a calendar invite for `ev`, on behalf of the user (`email`): ORGANIZER is
 * the user, so accept/decline replies go to them; Reply-To and BCC the user. Counts toward the
 * same daily cap and log as follow-up emails.
 */
export async function sendInvite(
  email: string,
  o: { ev: CalEvent; toName?: string | null; toEmail: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = o.toEmail.trim().toLowerCase()
  if (!EMAIL_RE.test(to)) return { ok: false, error: 'that email address does not look right' }
  if ((await sentToday(email)) >= DAILY_SEND_CAP) return { ok: false, error: `daily limit of ${DAILY_SEND_CAP} emails reached` }
  const ev = tidy(o.ev)
  const profile = await getProfile(email).catch(() => null)
  const userName = profile?.name?.trim() || null
  const from = fromLine(userName)
  const fromAddr = /<([^>]+)>/.exec(from)?.[1]
  const ics = buildIcs(ev, {
    method: 'REQUEST',
    uid: `${crypto.randomUUID()}@tryjunoapp.com`,
    organizer: { name: userName, email },
    attendees: [{ name: o.toName, email: to }],
    sentBy: fromAddr,
  })
  const when = whenLabel(Date.parse(ev.start), ev.tz ?? 'UTC')
  const who = userName || email
  const text =
    `${who} invited you: ${ev.title}\n${when}` +
    (ev.location ? `\n${ev.location}` : '') +
    (ev.description ? `\n\n${ev.description}` : '') +
    `\n\nThe invite is attached. Reply to this email to reach ${userName?.split(/\s+/)[0] || 'them'}.`
  const r = await sendEmailResult({
    from,
    to,
    subject: `Invitation: ${ev.title} @ ${when}`,
    html: bodyHtml(text),
    text,
    replyTo: email,
    bcc: email,
    attachments: [{ filename: 'invite.ics', content: Buffer.from(ics, 'utf8'), contentType: 'text/calendar; charset=utf-8; method=REQUEST' }],
  })
  await supabaseAdmin.from('pen_sent_emails').insert({
    user_email: email,
    to_email: to,
    session_id: null,
    channel: 'whatsapp',
    ok: r.ok,
    error: r.ok ? null : (r.error ?? 'unknown').slice(0, 500),
  })
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'the mail provider rejected it' }
}
