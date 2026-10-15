// Google Calendar (plan F2): Juno adds the events the user says yes to, and reads their next 7 days
// to brief them before meetings (Notes/wa-templates-and-google-verification-oct15.md, section D).
//
//   · ONE scope, asked for only when they tap Settings → Calendar → Connect (never at sign-in):
//     calendar.events.owned (events on calendars they own). GCAL_SCOPE switches to the fallback
//     calendar.events if Google's console doesn't offer the granular one.
//   · access_type=offline + prompt=consent, so Google always hands back a refresh token; that is
//     the only thing kept, sealed (AES-256-GCM, key from NEXTAUTH_SECRET) in pen_gcal. Access
//     tokens live in memory for their hour and are refreshed on demand.
//   · Nothing is written to the calendar without an explicit yes in the chat (the WhatsApp tools
//     ask first). Reads are a 7-day window, fetched when needed and never stored.
//   · Disconnect = revoke at Google + delete the row + drop what Juno remembered about events
//     (gcal ids on accepted offers, brief dedupe rows).
//
// The state parameter is signed and carries the signed-in email, so a callback only connects the
// account that started it; a nonce cookie also ties it to the browser.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import type { CalEvent } from './calendar'

export const GCAL_SCOPE = process.env.GCAL_SCOPE || 'https://www.googleapis.com/auth/calendar.events.owned'
export const GCAL_FALLBACK_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
/** How far ahead Juno reads, in days (the number promised to Google and in Settings). */
export const READ_DAYS = 7

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const REVOKE = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'
const STATE_TTL_MS = 10 * 60 * 1000

export const STATE_COOKIE = 'juno_gcal_state'

export function gcalConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}


/** From the request's own origin, like Notion: localhost:3100 and www both work. */
export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/pen/google-calendar/callback`
}

/* ------------------------------------------------------------ secrets */

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('No key to protect Google Calendar tokens (NEXTAUTH_SECRET).')
  return s
}

const key = () => crypto.createHash('sha256').update(`juno-gcal:${secret()}`).digest()

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

export function open(sealed: string): string {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'))
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

const sign = (body: string) => crypto.createHmac('sha256', secret()).update(`gcal-state.${body}`).digest('base64url')

/** A state for one connect attempt: the email it belongs to, a nonce (also in a cookie), an expiry. */
export function makeState(email: string, nonce: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase(), n: nonce, x: now + STATE_TTL_MS })).toString('base64url')
  return `${body}.${sign(body)}`
}

/** True only for an unexpired state we signed, for this email, with this browser's nonce. */
export function verifyState(state: string | null | undefined, email: string, nonce: string | null | undefined, now = Date.now()): boolean {
  if (!state || !nonce) return false
  const [body, sig] = state.split('.')
  if (!body || !sig) return false
  const want = sign(body)
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e?: string; n?: string; x?: number }
    return p.e === email.toLowerCase() && p.n === nonce && typeof p.x === 'number' && p.x > now
  } catch {
    return false
  }
}

export function authorizeUrl(email: string, state: string, origin: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: GCAL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    login_hint: email,
    state,
  })
  return `${AUTH}?${q}`
}

/* -------------------------------------------------------------- the row */

export type GcalConnection = { email: string; calendar_email: string | null; scope: string | null; connected_at: string; last_error: string | null }
type Row = GcalConnection & { refresh_token: string }

async function row(email: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin.from('pen_gcal').select('*').eq('email', email.toLowerCase()).maybeSingle()
  if (error) return null
  return (data as Row) ?? null
}

export async function getGcalConnection(email: string): Promise<GcalConnection | null> {
  const r = await row(email)
  if (!r) return null
  const { refresh_token: _t, ...rest } = r
  void _t
  return rest
}

/** Connected and usable (a refresh Google refused means reconnect; until then, the links). */
export async function gcalConnected(email: string): Promise<boolean> {
  const r = await row(email).catch(() => null)
  return Boolean(r && !r.last_error)
}

/* ------------------------------------------------------------ tokens */

type TokenRes = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string; error?: string; error_description?: string }

const cache = new Map<string, { token: string; until: number }>()

async function tokenCall(params: Record<string, string>): Promise<TokenRes & { status: number }> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }).toString(),
  })
  const j = (await res.json().catch(() => ({}))) as TokenRes
  return { ...j, status: res.status }
}

/** The email inside Google's id_token (it came straight from Google's token endpoint over TLS). */
function idTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string }
    return p.email?.toLowerCase() ?? null
  } catch {
    return null
  }
}

/** The OAuth callback: swap the code for tokens, keep the refresh token sealed. */
export async function connectGcal(email: string, code: string, origin: string): Promise<GcalConnection> {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin) })
  if (t.status >= 400 || !t.access_token) throw new Error(t.error_description ?? t.error ?? 'Google didn’t accept the connection.')
  if (!t.refresh_token) throw new Error('Google didn’t give Juno lasting access. Try connecting again.')
  const granted = (t.scope ?? '').split(/\s+/)
  if (!granted.includes(GCAL_SCOPE) && !granted.includes(GCAL_FALLBACK_SCOPE)) {
    // They unticked the calendar box on Google's screen: don't keep a token that can't do the job.
    await revokeToken(t.refresh_token)
    throw new Error('Calendar access wasn’t allowed on Google’s screen, so nothing was connected. Try again and leave the calendar box ticked.')
  }
  const lower = email.toLowerCase()
  cache.set(lower, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 })
  const calendarEmail = idTokenEmail(t.id_token) ?? (await primarySummary(t.access_token))
  const { error } = await supabaseAdmin.from('pen_gcal').upsert(
    {
      email: lower,
      refresh_token: seal(t.refresh_token),
      scope: t.scope ?? GCAL_SCOPE,
      calendar_email: calendarEmail,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'email' },
  )
  if (error) throw new Error(error.message)
  return (await getGcalConnection(lower))!
}

/** The primary calendar's name, which Google sets to the account's email. */
async function primarySummary(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/calendars/primary/events?maxResults=1&fields=summary`, { headers: { Authorization: `Bearer ${token}` } })
    const j = (await res.json()) as { summary?: string }
    return res.ok && j.summary?.includes('@') ? j.summary.toLowerCase() : null
  } catch {
    return null
  }
}

const RECONNECT = 'Google Calendar stopped accepting Juno’s access. Connect it again to keep adding events.'

/** A live access token, refreshed when it's within two minutes of expiring. Throws when not connected. */
export async function accessToken(email: string): Promise<string> {
  const lower = email.toLowerCase()
  const hit = cache.get(lower)
  if (hit && hit.until > Date.now()) return hit.token
  const r = await row(lower)
  if (!r) throw new Error('Google Calendar isn’t connected.')
  if (r.last_error) throw new Error(r.last_error)
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: open(r.refresh_token) })
  if (!t.access_token) {
    if (t.error === 'invalid_grant') {
      await supabaseAdmin.from('pen_gcal').update({ last_error: RECONNECT }).eq('email', lower)
      throw new Error(RECONNECT)
    }
    throw new Error(t.error_description ?? t.error ?? `Google token refresh failed (${t.status})`)
  }
  cache.set(lower, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 })
  return t.access_token
}

async function gcal<T>(email: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken(email)
  const res = await fetch(`${API}/${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (res.status === 401) cache.delete(email.toLowerCase())
  if (!res.ok) throw Object.assign(new Error(j.error?.message ?? `Google Calendar ${path.split('?')[0]} failed (${res.status})`), { status: res.status })
  return j
}

/* ------------------------------------------------------------- events */

export type Attendee = { email: string; name?: string | null }
export type CreatedEvent = { id: string; link: string | null; meet: string | null }

type GEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; displayName?: string; self?: boolean; resource?: boolean; organizer?: boolean; responseStatus?: string }[]
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
  extendedProperties?: { private?: Record<string, string> }
}

const meetOf = (e: GEvent) => e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ?? null
const meetRequest = () => ({ createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } })
const cleanAttendees = (list: Attendee[] = []) =>
  list
    .map((a) => ({ email: a.email.trim().toLowerCase(), ...(a.name?.trim() ? { displayName: a.name.trim().slice(0, 100) } : {}) }))
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))

/** The request body for events.insert (exported for tests). */
export function eventBody(ev: CalEvent, o: { attendees?: Attendee[]; meet?: boolean; ref?: string } = {}): Record<string, unknown> {
  const startMs = Date.parse(ev.start)
  if (Number.isNaN(startMs)) throw new Error('calendar event needs a valid start')
  const dur = Math.min(24 * 60, Math.max(5, Math.round(ev.durationMin ?? 30)))
  const tz = ev.tz || 'UTC'
  const alarm = ev.alarmMin ?? 30
  const attendees = cleanAttendees(o.attendees)
  return {
    summary: (ev.title ?? '').trim().slice(0, 200) || 'Meeting',
    ...(ev.description?.trim() ? { description: ev.description.trim().slice(0, 1000) } : {}),
    ...(ev.location?.trim() ? { location: ev.location.trim().slice(0, 200) } : {}),
    start: { dateTime: new Date(startMs).toISOString(), timeZone: tz },
    end: { dateTime: new Date(startMs + dur * 60000).toISOString(), timeZone: tz },
    ...(attendees.length ? { attendees } : {}),
    reminders: alarm > 0 ? { useDefault: false, overrides: [{ method: 'popup', minutes: Math.min(40320, Math.round(alarm)) }] } : { useDefault: true },
    ...(o.meet ? { conferenceData: meetRequest() } : {}),
    // Marks Juno's own events, so a brief isn't sent twice for an offer the user accepted.
    extendedProperties: { private: { juno: '1', ...(o.ref ? { juno_ref: o.ref } : {}) } },
  }
}

/** Adds one event the user said yes to. With attendees, Google emails them the invite. */
export async function createEvent(email: string, ev: CalEvent, o: { attendees?: Attendee[]; meet?: boolean; ref?: string } = {}): Promise<CreatedEvent> {
  const body = eventBody(ev, o)
  const invite = Boolean((body.attendees as unknown[] | undefined)?.length)
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: invite ? 'all' : 'none' })
  const e = await gcal<GEvent>(email, `calendars/primary/events?${q}`, { body })
  return { id: e.id, link: e.htmlLink ?? null, meet: meetOf(e) }
}

/** Puts a Google Meet link on an event Juno added (after the user's yes to the offer). */
export async function addMeet(email: string, eventId: string): Promise<CreatedEvent> {
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'all' })
  const e = await gcal<GEvent>(email, `calendars/primary/events/${encodeURIComponent(eventId)}?${q}`, { method: 'PATCH', body: { conferenceData: meetRequest() } })
  return { id: e.id, link: e.htmlLink ?? null, meet: meetOf(e) }
}

/** Adds a guest to an event; Google sends them the invite from the user. */
export async function addAttendee(email: string, eventId: string, who: Attendee): Promise<CreatedEvent> {
  const path = `calendars/primary/events/${encodeURIComponent(eventId)}`
  const cur = await gcal<GEvent>(email, `${path}?fields=attendees`)
  const have = (cur.attendees ?? []).filter((a) => a.email).map((a) => ({ email: a.email!, ...(a.displayName ? { displayName: a.displayName } : {}) }))
  const add = cleanAttendees([who])
  if (!add.length) throw new Error('that email address does not look right')
  const attendees = have.some((a) => a.email.toLowerCase() === add[0].email) ? have : [...have, ...add]
  const e = await gcal<GEvent>(email, `${path}?sendUpdates=all`, { method: 'PATCH', body: { attendees } })
  return { id: e.id, link: e.htmlLink ?? null, meet: meetOf(e) }
}

export type UpcomingEvent = {
  id: string
  title: string
  start: string
  end: string | null
  allDay: boolean
  /** Everyone invited except the user and rooms. */
  others: { email: string; name: string | null }[]
  declined: boolean
  location: string | null
  meet: string | null
  link: string | null
  /** Set on events Juno added: the pen_suggestions id it came from, if any. */
  junoRef: string | null
  juno: boolean
}

export function toUpcoming(e: GEvent): UpcomingEvent {
  const self = (e.attendees ?? []).find((a) => a.self)
  return {
    id: e.id,
    title: (e.summary ?? '').trim() || '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? null,
    allDay: !e.start?.dateTime,
    others: (e.attendees ?? []).filter((a) => !a.self && !a.resource && a.email).map((a) => ({ email: a.email!.toLowerCase(), name: a.displayName?.trim() || null })),
    declined: self?.responseStatus === 'declined',
    location: e.location ?? null,
    meet: meetOf(e),
    link: e.htmlLink ?? null,
    junoRef: e.extendedProperties?.private?.juno_ref ?? null,
    juno: e.extendedProperties?.private?.juno === '1',
  }
}

/** The user's events from now to `days` ahead (at most READ_DAYS), soonest first. Never stored. */
export async function upcomingEvents(email: string, days = READ_DAYS, now = new Date()): Promise<UpcomingEvent[]> {
  const span = Math.min(READ_DAYS, Math.max(0, days))
  const q = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + span * 86_400_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
    fields: 'items(id,status,summary,location,htmlLink,hangoutLink,start,end,attendees(email,displayName,self,resource,responseStatus),conferenceData(entryPoints(entryPointType,uri)),extendedProperties)',
  })
  const j = await gcal<{ items?: GEvent[] }>(email, `calendars/primary/events?${q}`)
  return (j.items ?? []).filter((e) => e.status !== 'cancelled').map(toUpcoming)
}

/* ---------------------------------------------------------- disconnect */

async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Revoke at Google, delete the token, and forget what Juno kept about calendar events: the gcal
 * ids on accepted offers and the brief dedupe rows for calendar events. Revocation failing (a
 * token Google already dropped) never stops the delete.
 */
export async function disconnectGcal(email: string): Promise<{ revoked: boolean }> {
  const lower = email.toLowerCase()
  const r = await row(lower)
  cache.delete(lower)
  let revoked = false
  if (r) {
    try {
      revoked = await revokeToken(open(r.refresh_token))
    } catch {
      revoked = false // sealed with an old secret: nothing we could use anyway
    }
  }
  const { error } = await supabaseAdmin.from('pen_gcal').delete().eq('email', lower)
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('pen_proactive_log').delete().eq('user_email', lower).like('ref', 'gcal:%')
  const { data } = await supabaseAdmin.from('pen_suggestions').select('id,detail').eq('user_email', lower).not('detail->gcal_event_id', 'is', null)
  for (const s of (data ?? []) as { id: string; detail: Record<string, unknown> }[]) {
    const { gcal_event_id: _i, gcal_link: _l, gcal_meet: _m, ...detail } = s.detail
    void _i; void _l; void _m
    await supabaseAdmin.from('pen_suggestions').update({ detail }).eq('id', s.id)
  }
  return { revoked }
}
