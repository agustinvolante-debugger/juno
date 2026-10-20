// Google Calendar (plan F2): Juno adds the events the user says yes to, and reads their next 7 days
// to brief them before meetings (Notes/wa-templates-and-google-verification-oct15.md, section D).
//
//   · ONE scope, asked for only when they tap Settings → Google → Calendar → Connect (never at sign-in):
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
//
// ONE Google connection, two abilities (15 Oct): Calendar (above) and Docs & Sheets
// (lib/pen/google-drive.ts, scope drive.file: create files, and touch only files Juno created).
// Each is asked for on its own, incrementally (include_granted_scopes), and both live in the one
// pen_gcal row: one sealed refresh token, and `scope` = the abilities in use, space-separated
// (what Google granted AND the user turned on in Juno). Turning one off while the other stays on
// only drops it from `scope` (Google has no per-scope revoke: revoking the token takes the whole
// grant); turning off the last one revokes at Google and deletes the row, as before.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { daySpan, isDay, plainNotes, timedLen, type EventPatch, type NewEvent } from './calendar-edit'

export const GCAL_SCOPE = process.env.GCAL_SCOPE || 'https://www.googleapis.com/auth/calendar.events.owned'
export const GCAL_FALLBACK_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
/** Docs & Sheets: create files, and read or edit only the files Juno created (non-sensitive). */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
/** Which ability a connect asks for. 'both' = Settings' one-tap for the two together. */
export type GoogleWant = 'gcal' | 'drive' | 'both'
export const asWant = (v: unknown): GoogleWant => (v === 'drive' || v === 'both' ? v : 'gcal')
const CAL_SCOPES = [GCAL_SCOPE, GCAL_FALLBACK_SCOPE]
const scopesFor = (want: GoogleWant): string[] => (want === 'gcal' ? [GCAL_SCOPE] : want === 'drive' ? [DRIVE_SCOPE] : [GCAL_SCOPE, DRIVE_SCOPE])
const split = (scope: string | null | undefined) => (scope ?? '').split(/\s+/).filter(Boolean)
/** Calendar is on for this row. A legacy row with no scope recorded was a calendar connect. */
export const hasCalendar = (scope: string | null | undefined) => scope == null || split(scope).some((x) => CAL_SCOPES.includes(x))
export const hasDrive = (scope: string | null | undefined) => split(scope).includes(DRIVE_SCOPE)
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
export function makeState(email: string, nonce: string, now = Date.now(), want: GoogleWant = 'gcal'): string {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase(), n: nonce, x: now + STATE_TTL_MS, ...(want !== 'gcal' ? { w: want } : {}) })).toString('base64url')
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

/** The ability a website state asked for (read only after verifyState passed). */
export function stateWant(state: string | null | undefined): GoogleWant {
  try {
    return asWant((JSON.parse(Buffer.from((state ?? '').split('.')[0] ?? '', 'base64url').toString('utf8')) as { w?: string }).w)
  } catch {
    return 'gcal'
  }
}

export function authorizeUrl(email: string, state: string, origin: string, want: GoogleWant = 'gcal'): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: scopesFor(want).join(' '),
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

/** Calendar connected and usable (a refresh Google refused means reconnect; until then, the links). */
export async function gcalConnected(email: string): Promise<boolean> {
  const r = await row(email).catch(() => null)
  return Boolean(r && !r.last_error && hasCalendar(r.scope))
}

/** Docs & Sheets connected and usable (drive.file granted and turned on). */
export async function driveConnected(email: string): Promise<boolean> {
  if (!gcalConfigured()) return false
  const r = await row(email).catch(() => null)
  return Boolean(r && !r.last_error && hasDrive(r.scope))
}

/** Which abilities a connection has on (for Settings and connection_status). */
export function abilities(c: Pick<GcalConnection, 'scope'> | null | undefined): { calendar: boolean; drive: boolean } {
  return c ? { calendar: hasCalendar(c.scope), drive: hasDrive(c.scope) } : { calendar: false, drive: false }
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

const NOT_GRANTED: Record<GoogleWant, string> = {
  gcal: 'Calendar access wasn’t allowed on Google’s screen, so nothing was connected. Try again and leave the calendar box ticked.',
  drive: 'Docs & Sheets access wasn’t allowed on Google’s screen, so nothing was connected. Try again and leave the Google Drive box ticked.',
  both: 'Neither Calendar nor Docs & Sheets was allowed on Google’s screen, so nothing was connected. Try again and leave the boxes ticked.',
}

/**
 * The OAuth callback: swap the code for tokens, keep the refresh token sealed, and turn on what
 * was asked for and granted. What was already on stays on (if Google still grants it).
 */
export async function connectGcal(email: string, code: string, origin: string, want: GoogleWant = 'gcal'): Promise<GcalConnection> {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin) })
  if (t.status >= 400 || !t.access_token) throw new Error(t.error_description ?? t.error ?? 'Google didn’t accept the connection.')
  const lower = email.toLowerCase()
  const prior = await row(lower)
  const granted = split(t.scope)
  const asked = want === 'drive' ? [DRIVE_SCOPE] : want === 'gcal' ? CAL_SCOPES : [...CAL_SCOPES, DRIVE_SCOPE]
  const newly = granted.filter((x) => asked.includes(x))
  if (!newly.length) {
    // They unticked the box on Google's screen: don't keep a token that can't do the job. With a
    // connection already on, the token is just dropped (revoking it would revoke that one too).
    if (!prior && t.refresh_token) await revokeToken(t.refresh_token)
    throw new Error(NOT_GRANTED[want])
  }
  const refresh = t.refresh_token ?? (prior ? open(prior.refresh_token) : null)
  if (!refresh) throw new Error('Google didn’t give Juno lasting access. Try connecting again.')
  // Kept on: what was on before and Google still grants (incremental grants come back together).
  const kept = prior ? split(prior.scope ?? GCAL_SCOPE).filter((x) => granted.includes(x)) : []
  const scope = [...new Set([...kept, ...newly])].filter((x) => [...CAL_SCOPES, DRIVE_SCOPE].includes(x)).join(' ')
  cache.set(lower, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 })
  const calendarEmail = idTokenEmail(t.id_token) ?? (hasCalendar(scope) ? await primarySummary(t.access_token) : null) ?? prior?.calendar_email ?? null
  const { error } = await supabaseAdmin.from('pen_gcal').upsert(
    {
      email: lower,
      refresh_token: seal(refresh),
      scope,
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

const RECONNECT = 'Google stopped accepting Juno’s access. Connect it again in Settings → Google.'

/** A live access token, refreshed when it's within two minutes of expiring. Throws when not connected. */
export async function accessToken(email: string): Promise<string> {
  const lower = email.toLowerCase()
  const hit = cache.get(lower)
  if (hit && hit.until > Date.now()) return hit.token
  const r = await row(lower)
  if (!r) throw new Error('Google isn’t connected.')
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

/**
 * Which connected calendar a call goes to (lib/pen/calendars.ts, 20 Oct): the pen_gcal connection
 * (the default when none is given, as before), or a connected Google account's own token from
 * pen_gmail (Settings → Email: one Google connection per address covers mail and calendar).
 */
export type CalSrc = { kind: 'gcal' } | { kind: 'gmail'; address: string } | { kind: 'outlook'; address: string }

async function tokenFor(email: string, src?: CalSrc): Promise<string> {
  // Outlook calendars never come here: lib/pen/calendars.ts sends them to outlook-calendar.ts.
  if (src?.kind === 'outlook') throw new Error('an Outlook calendar is not a Google calendar')
  if (src?.kind === 'gmail') {
    const { accessToken: gmailToken } = await import('./gmail')
    return gmailToken(email, src.address)
  }
  return accessToken(email)
}

async function gcal<T>(email: string, path: string, init: { method?: string; body?: unknown } = {}, src?: CalSrc): Promise<T> {
  const token = await tokenFor(email, src)
  const res = await fetch(`${API}/${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (res.status === 401 && src?.kind !== 'gmail') cache.delete(email.toLowerCase())
  if (!res.ok) throw Object.assign(new Error(j.error?.message ?? `Google Calendar ${path.split('?')[0]} failed (${res.status})`), { status: res.status })
  return j
}

/* ------------------------------------------------------------- events */

export type Attendee = { email: string; name?: string | null }
/** `video`: what kind of link `meet` is ('Teams', 'Skype'; absent = Google Meet). `videoUnavailable`: a link was asked for and the calendar can't make one (personal Outlook). */
export type CreatedEvent = { id: string; link: string | null; meet: string | null; video?: string | null; videoUnavailable?: boolean }

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
  iCalUID?: string
  recurringEventId?: string
  organizer?: { email?: string; displayName?: string; self?: boolean }
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
export function eventBody(ev: NewEvent, o: { attendees?: Attendee[]; meet?: boolean; ref?: string } = {}): Record<string, unknown> {
  const tz = ev.tz || 'UTC'
  const alarm = ev.alarmMin ?? 30
  const attendees = cleanAttendees(o.attendees)
  let when: Record<string, unknown>
  if (ev.allDay) {
    const d = daySpan(ev.start, ev.end)
    when = { start: { date: d.start }, end: { date: d.end } }
  } else {
    const startMs = Date.parse(ev.start)
    if (Number.isNaN(startMs)) throw new Error('calendar event needs a valid start')
    when = { start: { dateTime: new Date(startMs).toISOString(), timeZone: tz }, end: { dateTime: new Date(startMs + timedLen(startMs, ev)).toISOString(), timeZone: tz } }
  }
  return {
    summary: (ev.title ?? '').trim().slice(0, 200) || 'Meeting',
    ...(ev.description?.trim() ? { description: ev.description.trim().slice(0, 1000) } : {}),
    ...(ev.location?.trim() ? { location: ev.location.trim().slice(0, 200) } : {}),
    ...when,
    ...(attendees.length ? { attendees } : {}),
    // An all-day event keeps the calendar's own default alerts (a popup "30 min before" midnight is noise).
    reminders: alarm > 0 && !ev.allDay ? { useDefault: false, overrides: [{ method: 'popup', minutes: Math.min(40320, Math.round(alarm)) }] } : { useDefault: true },
    ...(o.meet ? { conferenceData: meetRequest() } : {}),
    // Marks Juno's own events, so a brief isn't sent twice for an offer the user accepted.
    extendedProperties: { private: { juno: '1', ...(o.ref ? { juno_ref: o.ref } : {}) } },
  }
}

/** Adds one event the user said yes to. With attendees, Google emails them the invite. */
export async function createEvent(email: string, ev: NewEvent, o: { attendees?: Attendee[]; meet?: boolean; ref?: string } = {}, src?: CalSrc): Promise<CreatedEvent> {
  const body = eventBody(ev, o)
  const invite = Boolean((body.attendees as unknown[] | undefined)?.length)
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: invite ? 'all' : 'none' })
  const e = await gcal<GEvent>(email, `calendars/primary/events?${q}`, { body }, src)
  return { id: e.id, link: e.htmlLink ?? null, meet: meetOf(e) }
}

/** Puts a Google Meet link on an event Juno added (after the user's yes to the offer). */
export async function addMeet(email: string, eventId: string, src?: CalSrc): Promise<CreatedEvent> {
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'all' })
  const e = await gcal<GEvent>(email, `calendars/primary/events/${encodeURIComponent(eventId)}?${q}`, { method: 'PATCH', body: { conferenceData: meetRequest() } }, src)
  return { id: e.id, link: e.htmlLink ?? null, meet: meetOf(e) }
}

/** Adds a guest to an event; Google sends them the invite from the user. */
export async function addAttendee(email: string, eventId: string, who: Attendee, src?: CalSrc): Promise<CreatedEvent> {
  const path = `calendars/primary/events/${encodeURIComponent(eventId)}`
  const cur = await gcal<GEvent>(email, `${path}?fields=attendees`, {}, src)
  const have = (cur.attendees ?? []).filter((a) => a.email).map((a) => ({ email: a.email!, ...(a.displayName ? { displayName: a.displayName } : {}) }))
  const add = cleanAttendees([who])
  if (!add.length) throw new Error('that email address does not look right')
  const attendees = have.some((a) => a.email.toLowerCase() === add[0].email) ? have : [...have, ...add]
  const e = await gcal<GEvent>(email, `${path}?sendUpdates=all`, { method: 'PATCH', body: { attendees } }, src)
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
  /** The iCalendar UID: the same meeting on two of the user's calendars shares it (calendars.ts de-dups on it). */
  uid?: string | null
  /** The user organised it (their copy is the one to change). */
  organizerSelf?: boolean
  organizer?: { email: string; name: string | null } | null
  /** Which of the user's calendars it was read from (lib/pen/calendars.ts: 'gcal' or an address, Google or Outlook); set when reading all of them. */
  cal?: string
  /** Every connected calendar it is on, when the same meeting is on more than one. */
  cals?: string[]
  /** Its notes, as plain text (≤ 1000 chars; Google's description, Outlook's bodyPreview). Absent when empty. */
  description?: string
  /** One occurrence of a repeating event (a change applies to that occurrence only). */
  recurring?: boolean
}

export function toUpcoming(e: GEvent): UpcomingEvent {
  const self = (e.attendees ?? []).find((a) => a.self)
  const notes = plainNotes(e.description)
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
    uid: e.iCalUID ?? null,
    organizerSelf: e.organizer?.self === true,
    organizer: e.organizer?.email ? { email: e.organizer.email.toLowerCase(), name: e.organizer.displayName?.trim() || null } : null,
    ...(notes ? { description: notes } : {}),
    ...(e.recurringEventId ? { recurring: true } : {}),
  }
}

const EVENT_FIELDS = 'id,status,summary,description,location,htmlLink,hangoutLink,start,end,iCalUID,recurringEventId,organizer(email,displayName,self),attendees(email,displayName,self,resource,responseStatus),conferenceData(entryPoints(entryPointType,uri)),extendedProperties'

/** The user's events from now to `days` ahead (at most READ_DAYS), soonest first. Never stored. */
export async function upcomingEvents(email: string, days = READ_DAYS, now = new Date(), src?: CalSrc): Promise<UpcomingEvent[]> {
  const span = Math.min(READ_DAYS, Math.max(0, days))
  const q = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + span * 86_400_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
    fields: `items(${EVENT_FIELDS})`,
  })
  const j = await gcal<{ items?: GEvent[] }>(email, `calendars/primary/events?${q}`, {}, src)
  return (j.items ?? []).filter((e) => e.status !== 'cancelled').map(toUpcoming)
}

/** Events matching what the user named ("the sample meeting test"), from yesterday to 60 days
 *  ahead, soonest first. Only on the user's request, to change or delete one; never stored. */
export async function findEvents(email: string, query: string, now = new Date(), src?: CalSrc): Promise<UpcomingEvent[]> {
  const q = new URLSearchParams({
    q: query.slice(0, 100),
    timeMin: new Date(now.getTime() - 86_400_000).toISOString(),
    timeMax: new Date(now.getTime() + 60 * 86_400_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '10',
    fields: `items(${EVENT_FIELDS})`,
  })
  const j = await gcal<{ items?: GEvent[] }>(email, `calendars/primary/events?${q}`, {}, src)
  return (j.items ?? []).filter((e) => e.status !== 'cancelled').map(toUpcoming)
}

/**
 * Every event in [from, to) on one calendar, soonest first ("what's on tomorrow?", "my meetings
 * this week", a meeting looked up by day and person). Optional `q` = Google's free-text match
 * (title, description, location, attendees). Only on the user's request; never stored.
 */
export async function eventsInRange(email: string, from: Date, to: Date, o: { q?: string; max?: number } = {}, src?: CalSrc): Promise<UpcomingEvent[]> {
  const q = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.min(250, Math.max(1, o.max ?? 100))),
    fields: `items(${EVENT_FIELDS})`,
  })
  if (o.q?.trim()) q.set('q', o.q.trim().slice(0, 100))
  const j = await gcal<{ items?: GEvent[] }>(email, `calendars/primary/events?${q}`, {}, src)
  return (j.items ?? []).filter((e) => e.status !== 'cancelled').map(toUpcoming)
}

/** One event by id (to see whether it has guests before changing it), or null if it is gone. */
export async function getEvent(email: string, eventId: string, src?: CalSrc): Promise<UpcomingEvent | null> {
  try {
    const e = await gcal<GEvent>(email, `calendars/primary/events/${encodeURIComponent(eventId)}?fields=${encodeURIComponent(EVENT_FIELDS)}`, {}, src)
    return e.status === 'cancelled' ? null : toUpcoming(e)
  } catch (err) {
    if ((err as { status?: number }).status === 404 || (err as { status?: number }).status === 410) return null
    throw err
  }
}

/** Deletes an event the user asked to delete; guests, if any, get Google's cancellation. */
export async function deleteEvent(email: string, eventId: string, src?: CalSrc): Promise<void> {
  await gcal(email, `calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE' }, src)
}

/** Moves an event to a new start (same length unless given); guests get Google's update. */
export async function moveEvent(email: string, eventId: string, startIso: string, tz: string, durationMin?: number, src?: CalSrc): Promise<CreatedEvent> {
  const path = `calendars/primary/events/${encodeURIComponent(eventId)}`
  const cur = await gcal<GEvent>(email, `${path}?fields=start,end`, {}, src)
  const oldLen = cur.start?.dateTime && cur.end?.dateTime ? Date.parse(cur.end.dateTime) - Date.parse(cur.start.dateTime) : 30 * 60000
  const len = durationMin ? durationMin * 60000 : oldLen
  const start = Date.parse(startIso)
  const e = await gcal<GEvent>(email, `${path}?sendUpdates=all`, {
    method: 'PATCH',
    body: { start: { dateTime: new Date(start).toISOString(), timeZone: tz }, end: { dateTime: new Date(start + len).toISOString(), timeZone: tz } },
  }, src)
  return { id: e.id, link: e.htmlLink ?? null, meet: meetOf(e) }
}

/** The body of events.patch for an EventPatch (exported for tests). Switching timed ↔ all-day nulls the other form. */
export function patchBody(p: EventPatch): Record<string, unknown> {
  const b: Record<string, unknown> = {}
  if (p.title !== undefined) b.summary = p.title.trim().slice(0, 200) || 'Meeting'
  if (p.location !== undefined) b.location = (p.location ?? '').trim().slice(0, 200)
  if (p.description !== undefined) b.description = (p.description ?? '').trim().slice(0, 1000)
  if (p.start !== undefined || p.end !== undefined) {
    if (!p.start || !p.end) throw new Error('a new time needs a start and an end')
    if (isDay(p.start)) {
      const d = daySpan(p.start, p.end)
      b.start = { date: d.start, dateTime: null }
      b.end = { date: d.end, dateTime: null }
    } else {
      const s = Date.parse(p.start)
      if (Number.isNaN(s)) throw new Error('needs a valid start')
      const len = timedLen(s, { end: p.end })
      const tz = p.tz || 'UTC'
      b.start = { dateTime: new Date(s).toISOString(), timeZone: tz, date: null }
      b.end = { dateTime: new Date(s + len).toISOString(), timeZone: tz, date: null }
    }
  }
  return b
}

/**
 * Changes an event's title, time, place or notes. Guests are emailed Google's update only when the
 * event has some (`notify`; unknown = read its guest list first), never for the user's own events.
 */
export async function updateEvent(email: string, eventId: string, p: EventPatch, src?: CalSrc, notify?: boolean): Promise<CreatedEvent> {
  const path = `calendars/primary/events/${encodeURIComponent(eventId)}`
  const body = patchBody(p)
  let send = notify
  if (send === undefined) {
    const cur = await gcal<GEvent>(email, `${path}?fields=attendees(self,resource,email)`, {}, src)
    send = (cur.attendees ?? []).some((a) => !a.self && !a.resource && a.email)
  }
  const e = await gcal<GEvent>(email, `${path}?sendUpdates=${send ? 'all' : 'none'}`, { method: 'PATCH', body }, src)
  return { id: e.id, link: e.htmlLink ?? null, meet: meetOf(e) }
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

/** What Juno kept about calendar events: the gcal ids on accepted offers and brief dedupe rows. */
async function forgetCalendar(lower: string): Promise<void> {
  await supabaseAdmin.from('pen_proactive_log').delete().eq('user_email', lower).like('ref', 'gcal:%')
  const { data } = await supabaseAdmin.from('pen_suggestions').select('id,detail').eq('user_email', lower).not('detail->gcal_event_id', 'is', null)
  for (const s of (data ?? []) as { id: string; detail: Record<string, unknown> }[]) {
    const { gcal_event_id: _i, gcal_link: _l, gcal_meet: _m, ...detail } = s.detail
    void _i; void _l; void _m
    await supabaseAdmin.from('pen_suggestions').update({ detail }).eq('id', s.id)
  }
}

/**
 * Turn off one ability ('gcal' | 'drive') or everything ('all'). The last one off (or 'all'):
 * revoke at Google and delete the token, as before; revocation failing (a token Google already
 * dropped) never stops the delete. One off while the other stays on: Juno stops using it and
 * forgets what it kept for it; the grant stays at Google until the last one goes (`partial`).
 * Files Juno made in Drive stay the user's.
 */
export async function disconnectGoogle(email: string, what: 'gcal' | 'drive' | 'all' = 'all'): Promise<{ revoked: boolean; partial: boolean }> {
  const lower = email.toLowerCase()
  const r = await row(lower)
  cache.delete(lower)
  const left = r && what !== 'all' ? split(r.scope ?? GCAL_SCOPE).filter((x) => (what === 'gcal' ? !CAL_SCOPES.includes(x) : x !== DRIVE_SCOPE)) : []
  if (r && left.length) {
    const { error } = await supabaseAdmin.from('pen_gcal').update({ scope: left.join(' ') }).eq('email', lower)
    if (error) throw new Error(error.message)
    if (what === 'gcal') await forgetCalendar(lower)
    return { revoked: false, partial: true }
  }
  let revoked = false
  // The same Google account also connected for sending (lib/pen/gmail.ts): Google's revoke would
  // take that grant too, so only the row goes. Unknown (no pen_gmail table) = not shared.
  const sharedWithGmail = r?.calendar_email
    ? await supabaseAdmin.from('pen_gmail').select('id', { count: 'exact', head: true }).eq('address', r.calendar_email).then((x) => !x.error && (x.count ?? 0) > 0, () => false)
    : false
  if (r && !sharedWithGmail) {
    try {
      revoked = await revokeToken(open(r.refresh_token))
    } catch {
      revoked = false // sealed with an old secret: nothing we could use anyway
    }
  }
  const { error } = await supabaseAdmin.from('pen_gcal').delete().eq('email', lower)
  if (error) throw new Error(error.message)
  if (what !== 'drive') await forgetCalendar(lower)
  return { revoked, partial: false }
}

/** Settings → Google → Calendar → Disconnect (and the chat's disconnect_app). */
export async function disconnectGcal(email: string): Promise<{ revoked: boolean; partial: boolean }> {
  return disconnectGoogle(email, 'gcal')
}
