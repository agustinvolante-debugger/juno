// Sending a drafted email from the user's own Gmail (19 Oct 2026). Send only: the one Gmail scope is
// gmail.send, so Juno can put a message in their Sent folder and can never read, list or search
// their mail. Plus `openid email`, only to know which address was connected.
//
//   · One user can connect several Google accounts (personal + work), any of them, not
//     necessarily the one they sign in to Juno with. One is the default; a draft can name another
//     ("send it from my work email"), and the address last used for a recipient is used again
//     for them (pen_mail_from).
//   · Same OAuth client and the same redirect URI as Calendar/Docs (/api/pen/google-calendar/callback):
//     the callback sees a Gmail state ('m.' from Settings, or a chat state for app 'gmail') and
//     hands it here. No include_granted_scopes, so this token carries only gmail.send.
//   · The refresh token is sealed like Calendar's (AES-256-GCM, lib/pen/google-calendar.ts seal/open).
//   · Disconnect revokes at Google, except when the same Google account is also connected for
//     Calendar/Docs or by another Juno account: Google's revoke takes the whole grant for the
//     client, so revoking there would silently break the other connection. Then only the row goes.
//   · No tables yet (SQL in lib/pen/schema.sql, 19 Oct): gmailAvailable() is false and the
//     feature is hidden everywhere (Settings, the chat, the draft's From line).
//
// A send that fails (revoked, refused) is NOT retried through Juno's own sender: the user picked
// this address, so they are told plainly and given the compose links instead (whatsapp/agent.ts).
//
// READING (19 Oct, team-only test, lib/pen/gmail-read.ts): gmail.readonly (restricted; never
// modify/delete) for accounts in PEN_GMAIL_READ_USERS with PEN_GMAIL_READ=1, before the CASA
// audit, under Google's 100-test-user cap. An allowed user upgrades one address at a time
// (incremental consent asking send + readonly for that address); pen_gmail.scopes records what
// each token carries. Without that column (SQL not run) reading stays off for everyone.
//
// CALENDAR (20 Oct): one Google connection per address covers email AND calendar. The same
// consent screen also asks for that account's calendar (GCAL_SCOPE, the one pen_gcal uses:
// calendar.events.owned = see and add events on calendars they own); the user can untick it.
// pen_gmail.scopes records it (no new column). A row can also be calendar-only ("connect my work
// calendar" for an address they don't send from): it never shows as a From address. Up to
// MAX_CALENDARS calendars per Juno account, the old pen_gcal one included; which one new events
// go on, and reading them all merged, is lib/pen/calendars.ts. "Add calendar" on an address
// already connected re-asks that address's scopes plus calendar (askScopes), so nothing it
// could do before is lost (a new consent's token carries exactly what it asked for).

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { isMissingSchema } from './allowance'
import { GCAL_FALLBACK_SCOPE, GCAL_SCOPE, gcalConfigured, open, redirectUri, seal } from './google-calendar'
import { buildRfc2822, toRaw, type SendAccount } from './mail-compose'
import { DAILY_SEND_CAP, sentToday } from './follow-up'
import { readAllowedFor } from './mail-thread'

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE]
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const REVOKE = 'https://oauth2.googleapis.com/revoke'
const SEND = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const STATE_TTL_MS = 10 * 60 * 1000
export const MAX_ACCOUNTS = 5
/** Calendars per Juno account, from every source (pen_gcal + addresses with calendar on). */
export const MAX_CALENDARS = 5
const CAL_SCOPES = [GCAL_SCOPE, GCAL_FALLBACK_SCOPE]

/* ------------------------------------------------------------ available */

let avail: { ok: boolean; at: number } | null = null

/**
 * Switched on (PEN_GMAIL=1), Google configured AND the pen_gmail table exists (checked at most
 * once a minute). The switch exists because the tables went in before the Privacy wording and the
 * gmail.send scope in Google Console (19 Oct): off until both are live.
 */
export async function gmailAvailable(): Promise<boolean> {
  if (process.env.PEN_GMAIL !== '1') return false
  if (!gcalConfigured()) return false
  if (avail && Date.now() - avail.at < 60_000) return avail.ok
  // Not a HEAD request: PostgREST answers HEAD on a missing table with 204 and no error.
  const { error } = await supabaseAdmin.from('pen_gmail').select('id').limit(1)
  if (error && !isMissingSchema(error.message)) console.warn(`pen gmail: availability check: ${error.message}`)
  avail = { ok: !error, at: Date.now() }
  return avail.ok
}

/** pen_gmail.scopes exists (checked at most once a minute; the SQL may run after a deploy). */
let scopesCol: { ok: boolean; at: number } | null = null
const isScopesMissing = (msg: string) => /scopes/i.test(msg) && isMissingSchema(msg)

/** Reading is switched on (PEN_GMAIL_READ=1), Gmail is available and pen_gmail.scopes exists. */
export async function gmailReadAvailable(): Promise<boolean> {
  if (process.env.PEN_GMAIL_READ !== '1') return false
  if (!(await gmailAvailable())) return false
  if (scopesCol && Date.now() - scopesCol.at < 60_000) return scopesCol.ok
  const { error } = await supabaseAdmin.from('pen_gmail').select('scopes').limit(1)
  if (error && !isScopesMissing(error.message)) console.warn(`pen gmail: scopes check: ${error.message}`)
  scopesCol = { ok: !error, at: Date.now() }
  return scopesCol.ok
}

/** This Juno account may connect reading (the test allowlist) and reading is available. */
export async function gmailReadAllowed(userEmail: string): Promise<boolean> {
  return readAllowedFor(userEmail) && (await gmailReadAvailable())
}

/* ---------------------------------------------------------------- state */

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set.')
  return s
}
const sign = (body: string) => crypto.createHmac('sha256', secret()).update(`gmail-state.${body}`).digest('base64url')
export const GMAIL_STATE_PREFIX = 'm.'

/** The website's state (Settings → Email → Connect): signed-in email + this browser's nonce (+ r: reading asked, c: calendar asked). */
export function gmailState(email: string, nonce: string, now = Date.now(), read = false, cal = false): string {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase(), n: nonce, x: now + STATE_TTL_MS, ...(read ? { r: 1 } : {}), ...(cal ? { c: 1 } : {}) })).toString('base64url')
  return `${GMAIL_STATE_PREFIX}${body}.${sign(body)}`
}

/** Whether a (verified) website state asked for the calendar too. */
export function gmailStateWantsCal(state: string | null | undefined): boolean {
  try {
    const body = (state ?? '').slice(GMAIL_STATE_PREFIX.length).split('.')[0]
    return (JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { c?: number }).c === 1
  } catch {
    return false
  }
}

/** Whether a (verified) website state asked for reading too. */
export function gmailStateWantsRead(state: string | null | undefined): boolean {
  try {
    const body = (state ?? '').slice(GMAIL_STATE_PREFIX.length).split('.')[0]
    return (JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { r?: number }).r === 1
  } catch {
    return false
  }
}

export function verifyGmailState(state: string | null | undefined, email: string, nonce: string | null | undefined, now = Date.now()): boolean {
  if (!state?.startsWith(GMAIL_STATE_PREFIX) || !nonce) return false
  const [body, sig] = state.slice(GMAIL_STATE_PREFIX.length).split('.')
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

/**
 * Google's consent screen for Gmail. select_account: any Google account, not the Juno login.
 * `read` (allowed users only): send + readonly in one grant; `hint` preselects the address being
 * upgraded. `calendar` (default on, 20 Oct): the account's calendar on the same screen (the user
 * can untick it); `send: false` = calendar only ("connect my work calendar"). Every scope is asked
 * by name, so the new token carries exactly these.
 */
export function gmailAuthorizeUrl(state: string, origin: string, opts: { read?: boolean; hint?: string | null; calendar?: boolean; send?: boolean } = {}): string {
  const send = opts.send !== false
  const scopes = ['openid', 'email', ...(send ? [GMAIL_SEND_SCOPE] : []), ...(opts.read && send ? [GMAIL_READ_SCOPE] : []), ...(opts.calendar !== false || !send ? [GCAL_SCOPE] : [])]
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
    ...(opts.hint ? { login_hint: opts.hint } : {}),
  })
  return `${AUTH}?${q}`
}

/* ------------------------------------------------------------------ rows */

/**
 * `can_read`: this address's token carries gmail.readonly (pen_gmail.scopes; false without the column).
 * `can_send`: gmail.send (every row from before scopes existed sends). `can_cal`: its calendar is on.
 */
export type GmailAccount = SendAccount & { connected_at: string; last_used_at: string | null; can_read: boolean; can_send: boolean; can_cal: boolean }
type Row = Omit<GmailAccount, 'can_read' | 'can_send' | 'can_cal'> & { id: string; user_email: string; refresh_token: string; scopes?: string[] | null }

const ACCOUNT_COLS = 'address,is_default,last_error,connected_at,last_used_at'

/** What a token's recorded scopes allow. null (no scopes recorded) = a send-only row from 19 Oct. */
export function capsOf(scopes: string[] | null | undefined): { can_read: boolean; can_send: boolean; can_cal: boolean } {
  if (!Array.isArray(scopes)) return { can_read: false, can_send: true, can_cal: false }
  return { can_read: scopes.includes(GMAIL_READ_SCOPE), can_send: scopes.includes(GMAIL_SEND_SCOPE), can_cal: scopes.some((x) => CAL_SCOPES.includes(x)) }
}

/** Every connected Google address of this user: senders and calendar-only ones. */
export async function listGoogleAccounts(userEmail: string): Promise<GmailAccount[]> {
  const q = (cols: string) => supabaseAdmin.from('pen_gmail').select(cols).eq('user_email', userEmail.toLowerCase()).order('connected_at', { ascending: true })
  let res = await q(`${ACCOUNT_COLS},scopes`)
  if (res.error && isScopesMissing(res.error.message)) res = await q(ACCOUNT_COLS)
  if (res.error) {
    if (isMissingSchema(res.error.message)) return []
    throw new Error(res.error.message)
  }
  return ((res.data ?? []) as unknown as (Omit<GmailAccount, 'can_read' | 'can_send' | 'can_cal'> & { scopes?: string[] | null })[]).map(({ scopes, ...a }) => ({ ...a, ...capsOf(scopes) }))
}

/** The addresses drafts can go out from (a calendar-only address is never a From). */
export async function listAccounts(userEmail: string): Promise<GmailAccount[]> {
  return (await listGoogleAccounts(userEmail)).filter((a) => a.can_send)
}

/** The scopes the token for this address carries now (for "Add calendar": ask these again, plus calendar). */
export async function scopesOf(userEmail: string, address: string): Promise<{ read: boolean; send: boolean; cal: boolean } | null> {
  const a = (await listGoogleAccounts(userEmail).catch(() => [])).find((x) => x.address === address.toLowerCase())
  return a ? { read: a.can_read, send: a.can_send, cal: a.can_cal } : null
}

async function row(userEmail: string, address: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin.from('pen_gmail').select('*').eq('user_email', userEmail.toLowerCase()).eq('address', address.toLowerCase()).maybeSingle()
  if (error) return null
  return (data as Row) ?? null
}

/** Exactly one default: this one. */
export async function setDefault(userEmail: string, address: string): Promise<boolean> {
  const lower = userEmail.toLowerCase()
  const addr = address.toLowerCase()
  if (!(await row(lower, addr))) return false
  // Set first, then clear the others: a crash between leaves two defaults (chooseFrom takes the
  // first), never none.
  if (!capsOf((await row(lower, addr))?.scopes).can_send) return false
  const a = await supabaseAdmin.from('pen_gmail').update({ is_default: true }).eq('user_email', lower).eq('address', addr)
  if (a.error) throw new Error(a.error.message)
  const b = await supabaseAdmin.from('pen_gmail').update({ is_default: false }).eq('user_email', lower).neq('address', addr)
  if (b.error) throw new Error(b.error.message)
  return true
}

/* ---------------------------------------------------------------- tokens */

type TokenRes = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string; error?: string; error_description?: string }

async function tokenCall(params: Record<string, string>): Promise<TokenRes & { status: number }> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }).toString(),
  })
  const j = (await res.json().catch(() => ({}))) as TokenRes
  return { ...j, status: res.status }
}

/** The verified email inside Google's id_token (straight from Google's token endpoint over TLS). */
function idTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string; email_verified?: boolean }
    return p.email && p.email_verified !== false ? p.email.toLowerCase() : null
  } catch {
    return null
  }
}

async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() })
    return res.ok
  } catch {
    return false
  }
}

/** Is this Google account's grant also in use elsewhere (Calendar/Docs, or another Juno account)? */
async function grantShared(address: string, exceptUser: string): Promise<boolean> {
  const [g, m] = await Promise.all([
    supabaseAdmin.from('pen_gcal').select('email', { count: 'exact', head: true }).eq('calendar_email', address),
    supabaseAdmin.from('pen_gmail').select('id', { count: 'exact', head: true }).eq('address', address).neq('user_email', exceptUser),
  ])
  // Unknown counts as shared: better a token left at Google than a connection broken.
  if (g.error || m.error) return true
  return (g.count ?? 0) + (m.count ?? 0) > 0
}

export class GmailError extends Error {
  constructor(public code: 'not_granted' | 'no_refresh' | 'no_email' | 'too_many' | 'failed', message: string) {
    super(message)
  }
}

/** How many calendars this user has connected, not counting `except` (pen_gcal's + addresses with calendar on). */
async function calendarCount(lower: string, except: string): Promise<number> {
  const [g, rows] = await Promise.all([
    supabaseAdmin.from('pen_gcal').select('scope,calendar_email,last_error').eq('email', lower).maybeSingle().then((x) => (x.error ? null : (x.data as { scope: string | null; calendar_email: string | null } | null)), () => null),
    listGoogleAccounts(lower).catch((): GmailAccount[] => []),
  ])
  const keys = new Set(rows.filter((a) => a.can_cal && a.address !== except).map((a) => a.address))
  const legacyCal = g && (g.scope == null || g.scope.split(/\s+/).some((x) => CAL_SCOPES.includes(x)))
  if (legacyCal && g.calendar_email !== except) keys.add(g.calendar_email ?? 'gcal')
  return keys.size
}

export type GmailConnected = { address: string; isDefault: boolean; canRead: boolean; canSend: boolean; canCal: boolean; calFull?: boolean }

/**
 * The OAuth callback: swap the code, check sending or the calendar was granted, keep the token
 * sealed, and record which scopes it carries (canRead: gmail.readonly granted and recorded; canCal:
 * the calendar, unless MAX_CALENDARS are already connected: calFull).
 */
export async function connectGmail(userEmail: string, code: string, origin: string): Promise<GmailConnected> {
  const lower = userEmail.toLowerCase()
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin) })
  if (t.status >= 400 || !t.access_token) throw new GmailError('failed', t.error_description ?? t.error ?? 'Google didn’t accept the connection.')
  const granted = (t.scope ?? '').split(/\s+/)
  const sendOk = granted.includes(GMAIL_SEND_SCOPE)
  const calGranted = granted.some((x) => CAL_SCOPES.includes(x))
  if (!sendOk && !calGranted) {
    if (t.refresh_token) await revokeToken(t.refresh_token)
    throw new GmailError('not_granted', 'Sending wasn’t allowed on Google’s screen, so nothing was connected. Try again and leave the box ticked.')
  }
  const address = idTokenEmail(t.id_token)
  if (!address) throw new GmailError('no_email', 'Google didn’t say which address this is. Try again.')
  const existing = await listGoogleAccounts(lower)
  const prior = existing.find((a) => a.address === address)
  if (!prior && existing.length >= MAX_ACCOUNTS) throw new GmailError('too_many', `You can connect up to ${MAX_ACCOUNTS} addresses. Disconnect one first.`)
  const refresh = t.refresh_token ?? (prior ? open((await row(lower, address))!.refresh_token) : null)
  if (!refresh) throw new GmailError('no_refresh', 'Google didn’t give Juno lasting access. Try connecting again.')
  // The default From is a sending address; a calendar-only one never is.
  const isDefault = sendOk && (prior ? prior.is_default : !existing.some((a) => a.is_default && a.can_send))
  const calFull = calGranted && (await calendarCount(lower, address)) >= MAX_CALENDARS
  // Reading only for the allowlist: a token that came back with readonly for anyone else is kept
  // without it (the scope isn't recorded, so nothing reads with it).
  const scopes = granted.filter((x) => x === GMAIL_SEND_SCOPE || (x === GMAIL_READ_SCOPE && readAllowedFor(lower)) || (CAL_SCOPES.includes(x) && !calFull))
  const base = { user_email: lower, address, refresh_token: seal(refresh), is_default: isDefault, last_error: null, connected_at: prior?.connected_at ?? new Date().toISOString() }
  let { error } = await supabaseAdmin.from('pen_gmail').upsert({ ...base, scopes }, { onConflict: 'user_email,address' })
  let recorded = !error
  if (error && isScopesMissing(error.message)) {
    // Before the scopes column: only sending can be recorded (a row without scopes = send-only).
    if (!sendOk) throw new GmailError('not_granted', 'Sending wasn’t allowed on Google’s screen, so nothing was connected. Try again and leave the box ticked.')
    ;({ error } = await supabaseAdmin.from('pen_gmail').upsert(base, { onConflict: 'user_email,address' }))
    recorded = false
  }
  if (error) throw new GmailError('failed', error.message)
  cache.set(`${lower}|${address}`, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 })
  const canCal = recorded && scopes.some((x) => CAL_SCOPES.includes(x))
  return { address, isDefault, canRead: recorded && scopes.includes(GMAIL_READ_SCOPE), canSend: sendOk, canCal, ...(calFull ? { calFull: true } : {}) }
}

/**
 * Settings → "Turn off calendar" for one address: Juno stops reading and adding events there. The
 * Google grant stays while the address still sends (Google has no per-scope revoke); a
 * calendar-only address is disconnected outright (revoked at Google, as disconnectGmail does).
 */
export async function calendarOff(userEmail: string, address: string): Promise<{ removed: boolean; disconnected: boolean }> {
  const lower = userEmail.toLowerCase()
  const r = await row(lower, address)
  if (!r) return { removed: false, disconnected: false }
  const left = (Array.isArray(r.scopes) ? r.scopes : [GMAIL_SEND_SCOPE]).filter((x) => !CAL_SCOPES.includes(x))
  if (!left.includes(GMAIL_SEND_SCOPE)) {
    await disconnectGmail(lower, r.address)
    return { removed: true, disconnected: true }
  }
  const { error } = await supabaseAdmin.from('pen_gmail').update({ scopes: left }).eq('id', r.id)
  if (error) throw new Error(error.message)
  return { removed: true, disconnected: false }
}

const cache = new Map<string, { token: string; until: number }>()
export const RECONNECT = 'revoked'

export async function accessToken(userEmail: string, address: string): Promise<string> {
  const k = `${userEmail.toLowerCase()}|${address.toLowerCase()}`
  const hit = cache.get(k)
  if (hit && hit.until > Date.now()) return hit.token
  const r = await row(userEmail, address)
  if (!r) throw new GmailError('failed', 'not connected')
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: open(r.refresh_token) })
  if (!t.access_token) {
    if (t.error === 'invalid_grant') {
      await supabaseAdmin.from('pen_gmail').update({ last_error: RECONNECT }).eq('id', r.id)
      throw Object.assign(new GmailError('failed', 'Google no longer accepts Juno’s access to this address.'), { revoked: true })
    }
    throw new GmailError('failed', t.error_description ?? t.error ?? `token refresh failed (${t.status})`)
  }
  cache.set(k, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 })
  return t.access_token
}

/** Disconnect one address. The default moves to the oldest one left. */
export async function disconnectGmail(userEmail: string, address: string): Promise<{ revoked: boolean; removed: boolean }> {
  const lower = userEmail.toLowerCase()
  const addr = address.toLowerCase()
  const r = await row(lower, addr)
  cache.delete(`${lower}|${addr}`)
  if (!r) return { revoked: false, removed: false }
  let revoked = false
  if (!(await grantShared(addr, lower))) {
    try {
      revoked = await revokeToken(open(r.refresh_token))
    } catch {
      revoked = false
    }
  }
  const { error } = await supabaseAdmin.from('pen_gmail').delete().eq('id', r.id)
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('pen_mail_from').delete().eq('user_email', lower).eq('from_address', addr).then(() => {}, () => {})
  if (r.is_default) {
    const left = await listAccounts(lower)
    if (left.length && !left.some((a) => a.is_default)) await setDefault(lower, left[0].address)
  }
  return { revoked, removed: true }
}

/* ------------------------------------------------- the From per recipient */

export async function lastFromFor(userEmail: string, toEmail: string | null): Promise<string | null> {
  if (!toEmail) return null
  const { data, error } = await supabaseAdmin.from('pen_mail_from').select('from_address').eq('user_email', userEmail.toLowerCase()).eq('to_email', toEmail.toLowerCase()).maybeSingle()
  if (error) return null
  return (data?.from_address as string | undefined) ?? null
}

async function rememberFrom(userEmail: string, toEmail: string, from: string): Promise<void> {
  await supabaseAdmin
    .from('pen_mail_from')
    .upsert({ user_email: userEmail.toLowerCase(), to_email: toEmail.toLowerCase(), from_address: from.toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: 'user_email,to_email' })
    .then(() => {}, () => {})
}

/* ------------------------------------------------------------------ send */

export type GmailSend = { ok: true; id: string | null } | { ok: false; reason: 'cap' | 'not_connected' | 'revoked' | 'failed'; error: string }

/** Sends one email as the user, from one of their connected addresses. Lands in their Sent. */
export async function sendViaGmail(o: {
  userEmail: string
  from: string
  fromName?: string | null
  to: string
  toName?: string | null
  subject: string
  body: string
  sessionId: string | null
  /** A reply in an existing thread (reply_in_thread): Gmail files it there; the headers thread it for everyone else. */
  thread?: { id: string; inReplyTo: string | null; references: string | null } | null
}): Promise<GmailSend> {
  const lower = o.userEmail.toLowerCase()
  if ((await sentToday(lower)) >= DAILY_SEND_CAP) return { ok: false, reason: 'cap', error: `daily limit of ${DAILY_SEND_CAP} emails reached` }
  const r = await row(lower, o.from)
  if (!r) return { ok: false, reason: 'not_connected', error: `${o.from} is not connected` }
  let token: string
  try {
    token = await accessToken(lower, o.from)
  } catch (e) {
    const revoked = Boolean((e as { revoked?: boolean }).revoked) || r.last_error === RECONNECT
    return { ok: false, reason: revoked ? 'revoked' : 'failed', error: (e as Error).message }
  }
  const raw = toRaw(buildRfc2822({ from: r.address, fromName: o.fromName, to: o.to, toName: o.toName, subject: o.subject, body: o.body, inReplyTo: o.thread?.inReplyTo, references: o.thread?.references }))
  let res: Response
  try {
    res = await fetch(SEND, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw, ...(o.thread?.id ? { threadId: o.thread.id } : {}) }) })
  } catch (e) {
    return { ok: false, reason: 'failed', error: (e as Error).message }
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; status?: string } }
  if (!res.ok) {
    cache.delete(`${lower}|${r.address}`)
    // 401: the token died between refresh and send; 403 with insufficient scope: the user
    // removed the permission at Google. Either way, connect again.
    const revoked = res.status === 401 || (res.status === 403 && /insufficient|scope|permission/i.test(j.error?.message ?? j.error?.status ?? ''))
    if (revoked) await supabaseAdmin.from('pen_gmail').update({ last_error: RECONNECT }).eq('id', r.id)
    console.warn(`pen gmail: send failed (${res.status}): ${j.error?.message ?? ''}`)
    return { ok: false, reason: revoked ? 'revoked' : 'failed', error: j.error?.message ?? `Gmail refused it (${res.status})` }
  }
  // Logged like Juno's own sends (who, when, ok; never subject or body); it counts toward the
  // daily cap. Failures are not logged here: a user's revoked token is not an outage (health.ts).
  await supabaseAdmin.from('pen_sent_emails').insert({ user_email: lower, to_email: o.to, session_id: o.sessionId, channel: 'gmail', ok: true, error: null }).then(() => {}, () => {})
  await supabaseAdmin.from('pen_gmail').update({ last_used_at: new Date().toISOString(), last_error: null }).eq('id', r.id).then(() => {}, () => {})
  await rememberFrom(lower, o.to, r.address)
  return { ok: true, id: j.id ?? null }
}
