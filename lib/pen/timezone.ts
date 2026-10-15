// Which time zone the user is in (plan E). WhatsApp gives no location, so it is pieced together
// from what we have, newest first:
//
//   chat   the user said it ("I'm in SF until Friday" -> set_timezone). With an end date it wins
//          until then, and the zone they had before comes back afterwards.
//   web    the browser's zone, stored on each visit to the app (at most once a day).
//   phone  the country code. +1 spans six zones and is never guessed: the agent asks once.
//
// A web visit never replaces a chat zone that still has an active end date: someone in SF for
// three days who opens the app on a hotel laptop has not moved there.
//
// Pen clocks can be hours off, so recording timestamps are never used as a signal.

import { supabaseAdmin } from '@/lib/supabase'
import { cleanProfile, getProfileRaw } from './profile'
import type { AgentProfile } from './profile-fields'

export type Zone = { tz: string | null; source: 'chat' | 'web' | 'phone' | 'none'; sure: boolean; until?: string }

/** Country code -> zone. `sure: false` where the country has several zones and we picked the main one. */
const PHONE_ZONES: [string, string, boolean][] = [
  ['56', 'America/Santiago', true],
  ['55', 'America/Sao_Paulo', true],
  ['54', 'America/Argentina/Buenos_Aires', true],
  ['52', 'America/Mexico_City', false],
  ['57', 'America/Bogota', true],
  ['51', 'America/Lima', true],
  ['58', 'America/Caracas', true],
  ['593', 'America/Guayaquil', true],
  ['598', 'America/Montevideo', true],
  ['595', 'America/Asuncion', true],
  ['591', 'America/La_Paz', true],
  ['506', 'America/Costa_Rica', true],
  ['507', 'America/Panama', true],
  ['34', 'Europe/Madrid', true],
  ['44', 'Europe/London', true],
  ['33', 'Europe/Paris', true],
  ['49', 'Europe/Berlin', true],
  ['39', 'Europe/Rome', true],
  ['351', 'Europe/Lisbon', true],
  ['31', 'Europe/Amsterdam', true],
  ['353', 'Europe/Dublin', true],
  ['41', 'Europe/Zurich', true],
  ['972', 'Asia/Jerusalem', true],
  ['971', 'Asia/Dubai', true],
  ['91', 'Asia/Kolkata', true],
  ['65', 'Asia/Singapore', true],
  ['81', 'Asia/Tokyo', true],
  ['61', 'Australia/Sydney', false],
]

/** The zone a phone number suggests, or null (+1 and unknown codes). Longest prefix wins. */
export function phoneZone(phone: string | null | undefined): { tz: string; sure: boolean } | null {
  const d = (phone ?? '').replace(/\D/g, '')
  if (!d || d.startsWith('1')) return null
  const hit = PHONE_ZONES.filter(([p]) => d.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0]
  return hit ? { tz: hit[1], sure: hit[2] } : null
}

export function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The pure resolution, for tests. */
export function resolveZone(p: AgentProfile, phone?: string | null, now = Date.now()): Zone {
  if (p.timeZoneSaid && p.timeZoneUntil && new Date(p.timeZoneUntil).getTime() > now) {
    return { tz: p.timeZoneSaid, source: 'chat', sure: true, until: p.timeZoneUntil }
  }
  // A temporary zone that has run out falls back to the one said before it.
  const saidTz = p.timeZoneUntil ? p.timeZoneBefore : p.timeZoneSaid
  const said = saidTz ? { tz: saidTz, at: new Date(p.timeZoneSaidAt ?? 0).getTime() } : null
  const web = p.timeZone ? { tz: p.timeZone, at: new Date(p.timeZoneSeenAt ?? 0).getTime() } : null
  if (said && (!web || said.at >= web.at)) return { tz: said.tz, source: 'chat', sure: true }
  if (web) return { tz: web.tz, source: 'web', sure: true }
  const ph = phoneZone(phone)
  if (ph) return { tz: ph.tz, source: 'phone', sure: ph.sure }
  return { tz: null, source: 'none', sure: false }
}

export async function userZone(email: string, phone?: string | null): Promise<Zone> {
  const p = (await getProfileRaw(email).catch(() => null)) ?? {}
  return resolveZone(p, phone)
}

async function writeProfile(email: string, next: AgentProfile): Promise<void> {
  const { error } = await supabaseAdmin
    .from('pen_profiles')
    .upsert({ user_email: email.toLowerCase(), profile: cleanProfile(next), updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
  if (error) throw new Error(error.message)
}

/**
 * The user said where they are. `until` (an instant) makes it temporary: afterwards the zone
 * said before it comes back.
 */
export async function setSaidZone(email: string, tz: string, until?: string | null): Promise<void> {
  if (!validZone(tz)) throw new Error(`unknown time zone ${tz}`)
  const cur = (await getProfileRaw(email)) ?? {}
  const active = cur.timeZoneSaid && (!cur.timeZoneUntil || new Date(cur.timeZoneUntil).getTime() > Date.now())
  // What to come back to: the permanent zone in force now (not a trip on top of a trip).
  const permanent = cur.timeZoneUntil ? cur.timeZoneBefore : active ? cur.timeZoneSaid : undefined
  await writeProfile(email, {
    ...cur,
    timeZoneSaid: tz,
    timeZoneSaidAt: new Date().toISOString(),
    timeZoneUntil: until || undefined,
    timeZoneBefore: until ? permanent ?? resolveZone({ ...cur, timeZoneSaid: undefined, timeZoneUntil: undefined }).tz ?? undefined : undefined,
  })
}

export const SEEN_EVERY_MS = 24 * 60 * 60 * 1000

/**
 * The browser's zone from a visit to the app. Written at most once a day unless it changed, and
 * never over a chat zone with an active end date. Returns whether it was stored.
 */
export async function noteBrowserZone(email: string, tz: string): Promise<boolean> {
  if (!validZone(tz)) return false
  const cur = (await getProfileRaw(email)) ?? {}
  if (cur.timeZoneSaid && cur.timeZoneUntil && new Date(cur.timeZoneUntil).getTime() > Date.now()) return false
  const seen = new Date(cur.timeZoneSeenAt ?? 0).getTime()
  if (cur.timeZone === tz && Date.now() - seen < SEEN_EVERY_MS) return false
  await writeProfile(email, { ...cur, timeZone: tz, timeZoneSeenAt: new Date().toISOString() })
  return true
}

/* ------------------------------------------------------------ zone math */

/** Minutes the zone is ahead of UTC at that instant (-420 for Los Angeles in summer). */
export function zoneOffsetMin(tz: string, at: Date | number): number {
  const d = new Date(at)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d)
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000)
}

/**
 * "2026-10-20T13:00" said in `tz` -> the instant. A wall time DST skips moves later by the gap
 * (02:30 on a spring-forward night is 03:30; Santiago's midnight on its DST day is 01:00, where
 * that local day really starts). A time that happens twice (fall back) is the first one.
 */
export function localToUtc(local: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?$/.exec(local.trim())
  if (!m) return null
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  const a = wall - zoneOffsetMin(tz, wall) * 60000
  const b = wall - zoneOffsetMin(tz, a) * 60000
  const shows = (t: number) => t + zoneOffsetMin(tz, t) * 60000 === wall
  if (shows(b)) return new Date(Math.min(b, shows(a) ? a : b))
  if (shows(a)) return new Date(a)
  // In the gap: neither offset gives that wall time. The later reading is the wall time plus the gap.
  return new Date(Math.max(a, b))
}

/** The wall-clock fields of an instant in `tz`. */
export function wallIn(tz: string, at: Date | number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const t = new Date(at).getTime() + zoneOffsetMin(tz, at) * 60000
  const d = new Date(t)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() }
}

/** "Pacific Time", "Chile Time": how a zone is said back to the user. */
export function zoneLabel(tz: string, locale = 'en-US'): string {
  try {
    const p = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(new Date())
    return p.find((x) => x.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

/** "Tue Oct 20, 1:00 PM PDT": an instant as the user reads it. */
export function whenLabel(at: Date | number, tz: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(at))
}

/** One line for the agent's system prompt: where the user is and what time it is there. */
export function zonePromptLine(z: Zone | null | undefined): string {
  const now = new Date()
  const utc = `${now.toISOString().slice(0, 16)}Z (UTC).`
  if (!z?.tz) {
    return `${utc} The user's timezone is unknown. When a clock time matters, ask once which city they are in and call set_timezone.`
  }
  const local = new Intl.DateTimeFormat('en-US', { timeZone: z.tz, weekday: 'long', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(now)
  const how =
    z.source === 'chat'
      ? `they told you${z.until ? `, until ${z.until.slice(0, 10)}` : ''}`
      : z.source === 'web'
        ? 'from their browser'
        : 'from their phone number'
  return (
    `${utc} The user's timezone is ${z.tz} (${how}), where it is ${local}.` +
    (z.sure ? '' : ' Not confirmed: when a clock time matters, ask once which city they are in and call set_timezone.')
  )
}
