// Outlook / Microsoft 365 (21 Oct 2026): the same connection as a Google address (lib/pen/gmail.ts),
// for Microsoft accounts. One Microsoft sign-in per address covers its calendar AND sending as the
// user; work/school (Microsoft 365) and personal (outlook.com, hotmail, live) accounts alike.
//
//   · Entra app "Juno Pen" (multitenant + personal accounts), env MS_CLIENT_ID / MS_CLIENT_SECRET.
//     Authority /common. Delegated permissions: offline_access openid email profile User.Read
//     + Calendars.ReadWrite (calendar) + Mail.Send (send as you). No Mail.Read: Juno can't read
//     Outlook mail. Adding reading later = one more scope in outlook-graph.ts + the consent again.
//   · One redirect URI: /api/pen/outlook/callback (www and localhost:3100 registered in Entra).
//   · Refresh tokens are sealed like Google's (AES-256-GCM, NEXTAUTH_SECRET; google-calendar.ts
//     seal/open). Microsoft ROTATES refresh tokens: every refresh hands back a new one, and it is
//     stored at once (the old one keeps working for a while, so two refreshes racing is harmless).
//   · Up to MAX_ACCOUNTS Microsoft addresses per Juno account (on top of up to 5 Google ones). The
//     calendar cap is shared: 5 calendars in all, Google and Microsoft together (calendars.ts).
//   · One default From across Gmail AND Outlook (setDefault clears the other table's default too),
//     the From remembered per recipient (pen_mail_from, shared), and one daily cap for everything
//     sent (pen_sent_emails, channel 'outlook').
//   · Work tenants that let only IT approve apps: the sign-in comes back with AADSTS65001 / 90094.
//     The user is told plainly and given an admin-consent link to forward (adminConsentUrl).
//   · Disconnect deletes the token. Microsoft has no per-app revoke for delegated tokens that an app
//     can call, so the user removes Juno Pen themselves at https://account.live.com/consent/Manage
//     (personal) or https://myapps.microsoft.com (work); Settings says so.
//   · No table yet (SQL at the bottom of lib/pen/schema.sql): outlookAvailable() is false and the
//     feature is hidden everywhere (Settings keeps the one-tap links row, the chat never offers it).
//     Also off until PEN_OUTLOOK=1 (Privacy wording and publisher verification first).

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { isMissingSchema } from './allowance'
import { open, seal } from './google-calendar'
import { DAILY_SEND_CAP, sentToday } from './follow-up'
import { GRAPH, MS_CAL, MS_LOGIN, MS_SEND, adminConsentUrl, classifyMsError, grantedAbilities, idClaims, msAuthorizeUrl, msCaps, msScopes, sendMailPayload } from './outlook-graph'

export const MAX_ACCOUNTS = 5
const TOKEN = `${MS_LOGIN}/common/oauth2/v2.0/token`
const STATE_TTL_MS = 10 * 60 * 1000
export const OUTLOOK_COOKIE = 'juno_outlook_state'
export const RECONNECT = 'revoked'

export const outlookConfigured = () => Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET)
export const outlookRedirectUri = (origin: string) => `${origin.replace(/\/$/, '')}/api/pen/outlook/callback`
/** The link an IT admin opens to approve Juno Pen for their organisation. */
export const outlookAdminUrl = (o: { tenant?: string | null; address?: string | null } = {}) =>
  adminConsentUrl(process.env.MS_CLIENT_ID ?? '', { ...o, redirectUri: outlookRedirectUri(process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com') })

/* ------------------------------------------------------------ available */

let avail: { ok: boolean; at: number } | null = null

/** Switched on (PEN_OUTLOOK=1), the Entra app configured AND pen_outlook exists (checked at most once a minute). */
export async function outlookAvailable(): Promise<boolean> {
  if (process.env.PEN_OUTLOOK !== '1' || !outlookConfigured()) return false
  if (avail && Date.now() - avail.at < 60_000) return avail.ok
  // Not HEAD: PostgREST answers HEAD on a missing table with 204 and no error.
  const { error } = await supabaseAdmin.from('pen_outlook').select('id').limit(1)
  if (error && !isMissingSchema(error.message)) console.warn(`pen outlook: availability check: ${error.message}`)
  avail = { ok: !error, at: Date.now() }
  return avail.ok
}

/* ---------------------------------------------------------------- state */

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set.')
  return s
}
const sign = (body: string) => crypto.createHmac('sha256', secret()).update(`outlook-state.${body}`).digest('base64url')
export const OUTLOOK_STATE_PREFIX = 'o.'
export type Want = { cal: boolean; send: boolean }

/** The website's state (Settings → Connections → Connect an Outlook account): signed-in email, this browser's nonce, what was asked. */
export function outlookState(email: string, nonce: string, want: Want = { cal: true, send: true }, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase(), n: nonce, x: now + STATE_TTL_MS, c: want.cal ? 1 : 0, s: want.send ? 1 : 0 })).toString('base64url')
  return `${OUTLOOK_STATE_PREFIX}${body}.${sign(body)}`
}

export function verifyOutlookState(state: string | null | undefined, email: string, nonce: string | null | undefined, now = Date.now()): Want | null {
  if (!state?.startsWith(OUTLOOK_STATE_PREFIX) || !nonce) return null
  const [body, sig] = state.slice(OUTLOOK_STATE_PREFIX.length).split('.')
  if (!body || !sig) return null
  const want = sign(body)
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e?: string; n?: string; x?: number; c?: number; s?: number }
    if (p.e !== email.toLowerCase() || p.n !== nonce || typeof p.x !== 'number' || p.x <= now) return null
    return { cal: p.c !== 0, send: p.s !== 0 }
  } catch {
    return null
  }
}

export function outlookAuthorizeUrl(state: string, origin: string, o: Want & { hint?: string | null }): string {
  return msAuthorizeUrl({ clientId: process.env.MS_CLIENT_ID ?? '', redirectUri: outlookRedirectUri(origin), state, cal: o.cal, send: o.send, hint: o.hint })
}

/* ------------------------------------------------------------------ rows */

export type OutlookAccount = {
  provider: 'outlook'
  address: string
  is_default: boolean
  last_error: string | null
  connected_at: string
  last_used_at: string | null
  tenant_id: string | null
  display_name: string | null
  can_send: boolean
  can_cal: boolean
}
type Row = Omit<OutlookAccount, 'provider' | 'can_send' | 'can_cal'> & { id: string; user_email: string; refresh_token: string; scopes: string[] | null }

const COLS = 'address,is_default,last_error,connected_at,last_used_at,tenant_id,display_name,scopes'

/** Every connected Microsoft address of this user, oldest first ([] without the table). */
export async function listOutlookAccounts(userEmail: string): Promise<OutlookAccount[]> {
  const { data, error } = await supabaseAdmin.from('pen_outlook').select(COLS).eq('user_email', userEmail.toLowerCase()).order('connected_at', { ascending: true })
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  return ((data ?? []) as unknown as (Omit<Row, 'id' | 'user_email' | 'refresh_token'>)[]).map(({ scopes, ...a }) => ({ provider: 'outlook' as const, ...a, ...msCaps(scopes) }))
}

/** The Microsoft addresses drafts can go out from. */
export async function listOutlookSenders(userEmail: string): Promise<OutlookAccount[]> {
  return (await listOutlookAccounts(userEmail)).filter((a) => a.can_send)
}

async function row(userEmail: string, address: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin.from('pen_outlook').select('*').eq('user_email', userEmail.toLowerCase()).eq('address', address.toLowerCase()).maybeSingle()
  if (error) return null
  return (data as Row) ?? null
}

/** Is this address a connected Outlook sender of this user? */
export async function isOutlookSender(userEmail: string, address: string | null | undefined): Promise<boolean> {
  if (!address) return false
  const r = await row(userEmail, address)
  return Boolean(r && msCaps(r.scopes).can_send)
}

/**
 * The one default From, across Gmail and Outlook: this Outlook address. Set first, then clear the
 * others (a crash between leaves two defaults; chooseFrom takes the first, never none).
 */
export async function setDefaultOutlook(userEmail: string, address: string): Promise<boolean> {
  const lower = userEmail.toLowerCase()
  const addr = address.toLowerCase()
  const r = await row(lower, addr)
  if (!r || !msCaps(r.scopes).can_send) return false
  const a = await supabaseAdmin.from('pen_outlook').update({ is_default: true }).eq('user_email', lower).eq('address', addr)
  if (a.error) throw new Error(a.error.message)
  await supabaseAdmin.from('pen_outlook').update({ is_default: false }).eq('user_email', lower).neq('address', addr)
  await supabaseAdmin.from('pen_gmail').update({ is_default: false }).eq('user_email', lower).then(() => {}, () => {})
  return true
}

/** Clears Outlook's default (gmail.ts setDefault calls it so there is one default across both). */
export async function clearOutlookDefault(userEmail: string): Promise<void> {
  await supabaseAdmin.from('pen_outlook').update({ is_default: false }).eq('user_email', userEmail.toLowerCase()).then(() => {}, () => {})
}

/* ---------------------------------------------------------------- tokens */

type TokenRes = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string; error?: string; error_description?: string; error_codes?: number[] }

async function tokenCall(params: Record<string, string>): Promise<TokenRes & { status: number }> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID ?? '', client_secret: process.env.MS_CLIENT_SECRET ?? '', ...params }).toString(),
  })
  const j = (await res.json().catch(() => ({}))) as TokenRes
  return { ...j, status: res.status }
}

export class OutlookError extends Error {
  constructor(public code: 'admin_consent' | 'cancelled' | 'not_granted' | 'no_refresh' | 'no_email' | 'too_many' | 'cal_full' | 'reconnect' | 'failed', message: string, public tenant: string | null = null) {
    super(message)
  }
}

/** The mailbox address: Graph /me (mail, else the sign-in name), else the id_token. */
async function whoAmI(token: string): Promise<{ address: string | null; name: string | null }> {
  try {
    const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { address: null, name: null }
    const j = (await res.json()) as { mail?: string | null; userPrincipalName?: string | null; displayName?: string | null }
    const a = [j.mail, j.userPrincipalName].find((x) => typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && !x.includes('#EXT#'))
    return { address: a?.toLowerCase() ?? null, name: j.displayName?.trim() || null }
  } catch {
    return { address: null, name: null }
  }
}

/** Calendars connected now, Google and Microsoft together, not counting `except`. */
async function calendarCount(lower: string, except: string): Promise<number> {
  const { listCalendars } = await import('./calendars')
  return (await listCalendars(lower).catch(() => [])).filter((c) => c.key !== except).length
}

/** Does this user have a default From anywhere (Gmail or Outlook)? */
async function hasDefaultSender(lower: string, except: string): Promise<boolean> {
  const [g, o] = await Promise.all([
    supabaseAdmin.from('pen_gmail').select('address,scopes').eq('user_email', lower).eq('is_default', true).then((x) => (x.error ? [] : (x.data ?? []) as { address: string; scopes?: string[] | null }[]), () => []),
    supabaseAdmin.from('pen_outlook').select('address').eq('user_email', lower).eq('is_default', true).neq('address', except).then((x) => (x.error ? [] : (x.data ?? []) as { address: string }[]), () => []),
  ])
  return g.length + o.length > 0
}

export type OutlookConnected = { address: string; isDefault: boolean; canSend: boolean; canCal: boolean; calFull?: boolean; tenant: string | null; personal: boolean }

/**
 * The OAuth callback: swap the code, find the mailbox address, keep the refresh token sealed and
 * record what it can do. `want` = what was asked (a calendar-only connect never becomes a From).
 */
export async function connectOutlook(userEmail: string, code: string, origin: string, want: Want = { cal: true, send: true }): Promise<OutlookConnected> {
  const lower = userEmail.toLowerCase()
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: outlookRedirectUri(origin), scope: msScopes(want).join(' ') })
  const claims = idClaims(t.id_token)
  if (t.status >= 400 || !t.access_token) {
    const kind = classifyMsError(t.error, t.error_description)
    throw new OutlookError(kind === 'admin_consent' ? 'admin_consent' : kind === 'cancelled' ? 'cancelled' : 'failed', t.error_description?.split(/\r?\n/)[0] ?? t.error ?? 'Microsoft didn’t accept the connection.', claims.tid)
  }
  const granted = grantedAbilities(t.scope).filter((s) => (s === MS_SEND ? want.send : want.cal))
  if (!granted.length) throw new OutlookError('not_granted', 'Microsoft didn’t give Juno the permissions it asked for, so nothing was connected.', claims.tid)
  const me = await whoAmI(t.access_token)
  const address = me.address ?? claims.email
  if (!address) throw new OutlookError('no_email', 'Microsoft didn’t say which address this is. Try again.', claims.tid)
  const existing = await listOutlookAccounts(lower)
  const prior = existing.find((a) => a.address === address)
  if (!prior && existing.length >= MAX_ACCOUNTS) throw new OutlookError('too_many', `You can connect up to ${MAX_ACCOUNTS} Microsoft addresses. Disconnect one first.`)
  const priorRow = prior ? await row(lower, address) : null
  const refresh = t.refresh_token ?? (priorRow ? open(priorRow.refresh_token) : null)
  if (!refresh) throw new OutlookError('no_refresh', 'Microsoft didn’t give Juno lasting access. Try connecting again.')
  // What the address could do before stays, if this consent covered it again.
  const had = msCaps(priorRow?.scopes)
  const calWanted = granted.includes(MS_CAL) || (had.can_cal && grantedAbilities(t.scope).includes(MS_CAL))
  const calFull = calWanted && !had.can_cal && (await calendarCount(lower, address)) >= 5
  const sendOk = granted.includes(MS_SEND) || (had.can_send && grantedAbilities(t.scope).includes(MS_SEND))
  const scopes = [...(sendOk ? [MS_SEND] : []), ...(calWanted && !calFull ? [MS_CAL] : [])]
  if (!scopes.length) throw new OutlookError('cal_full', 'You already have 5 calendars connected. Disconnect one first.')
  const isDefault = sendOk && (prior ? prior.is_default : !(await hasDefaultSender(lower, address)))
  const { error } = await supabaseAdmin.from('pen_outlook').upsert(
    {
      user_email: lower,
      address,
      tenant_id: claims.tid,
      display_name: me.name ?? claims.name,
      refresh_token: seal(refresh),
      scopes,
      is_default: isDefault,
      last_error: null,
      connected_at: prior?.connected_at ?? new Date().toISOString(),
    },
    { onConflict: 'user_email,address' },
  )
  if (error) throw new OutlookError('failed', error.message)
  cache.set(`${lower}|${address}`, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 })
  const { PERSONAL_TID } = await import('./outlook-graph')
  return { address, isDefault, canSend: sendOk, canCal: scopes.includes(MS_CAL), ...(calFull ? { calFull: true } : {}), tenant: claims.tid, personal: claims.tid === PERSONAL_TID }
}

const cache = new Map<string, { token: string; until: number }>()
const inflight = new Map<string, Promise<string>>()

/**
 * A live Graph token for one connected address. Refreshing stores the NEW refresh token Microsoft
 * returns (rotation). A dead refresh token marks the row 'revoked' (Settings shows Connect again).
 */
export async function accessToken(userEmail: string, address: string): Promise<string> {
  const k = `${userEmail.toLowerCase()}|${address.toLowerCase()}`
  const hit = cache.get(k)
  if (hit && hit.until > Date.now()) return hit.token
  const running = inflight.get(k)
  if (running) return running
  const p = refresh(userEmail, address, k).finally(() => inflight.delete(k))
  inflight.set(k, p)
  return p
}

async function refresh(userEmail: string, address: string, k: string): Promise<string> {
  const r = await row(userEmail, address)
  if (!r) throw new OutlookError('failed', 'not connected')
  const caps = msCaps(r.scopes)
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: open(r.refresh_token), scope: msScopes({ cal: caps.can_cal, send: caps.can_send }).join(' ') })
  if (!t.access_token) {
    const kind = classifyMsError(t.error, t.error_description)
    if (kind === 'reconnect' || kind === 'admin_consent') {
      await supabaseAdmin.from('pen_outlook').update({ last_error: RECONNECT }).eq('id', r.id)
      throw Object.assign(new OutlookError(kind === 'admin_consent' ? 'admin_consent' : 'reconnect', 'Microsoft no longer accepts Juno’s access to this address.', r.tenant_id), { revoked: true })
    }
    throw new OutlookError('failed', t.error_description?.split(/\r?\n/)[0] ?? t.error ?? `token refresh failed (${t.status})`)
  }
  // Rotation: keep the new refresh token now. A failed write only costs a reconnect later if the
  // old one expires first, so it is logged and the call goes on.
  if (t.refresh_token) {
    const { error } = await supabaseAdmin.from('pen_outlook').update({ refresh_token: seal(t.refresh_token), last_error: null }).eq('id', r.id)
    if (error) console.warn(`pen outlook: rotated refresh token not stored: ${error.message}`)
  }
  cache.set(k, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 120) * 1000 })
  return t.access_token
}

export type GraphError = Error & { status?: number; code?: string }

/** One Graph call as this address. Times come back in UTC (Prefer header). 202/204 → null. */
export async function graph<T>(userEmail: string, address: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken(userEmail, address)
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}/${path.replace(/^\//, '')}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })
  if (res.status === 202 || res.status === 204) return null as T
  const j = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } }
  if (!res.ok) {
    if (res.status === 401) {
      cache.delete(`${userEmail.toLowerCase()}|${address.toLowerCase()}`)
    }
    throw Object.assign(new Error(j.error?.message ?? `Microsoft Graph ${path.split('?')[0]} failed (${res.status})`), { status: res.status, code: j.error?.code }) as GraphError
  }
  return j
}

/* ------------------------------------------------------------- disconnect */

/** Where the user takes Juno Pen's access away at Microsoft (Juno can't do it for them). */
export const REMOVE_ACCESS = { personal: 'https://account.live.com/consent/Manage', work: 'https://myapps.microsoft.com' }

/** Disconnect one address: the token is deleted; the default From moves to the oldest sender left. */
export async function disconnectOutlook(userEmail: string, address: string): Promise<{ removed: boolean }> {
  const lower = userEmail.toLowerCase()
  const addr = address.toLowerCase()
  cache.delete(`${lower}|${addr}`)
  const r = await row(lower, addr)
  if (!r) return { removed: false }
  const { error } = await supabaseAdmin.from('pen_outlook').delete().eq('id', r.id)
  if (error) throw new Error(error.message)
  await supabaseAdmin.from('pen_mail_from').delete().eq('user_email', lower).eq('from_address', addr).then(() => {}, () => {})
  if (r.is_default) await moveDefault(lower)
  return { removed: true }
}

/** The default From went away: the oldest sender left, Gmail first (it was there before). */
async function moveDefault(lower: string): Promise<void> {
  const { gmailAvailable, listAccounts, setDefault } = await import('./gmail')
  const g = (await gmailAvailable().catch(() => false)) ? await listAccounts(lower).catch(() => []) : []
  if (g.some((a) => a.is_default)) return
  if (g.length) {
    await setDefault(lower, g[0].address).catch(() => {})
    return
  }
  const o = await listOutlookSenders(lower).catch(() => [])
  if (o.length && !o.some((a) => a.is_default)) await setDefaultOutlook(lower, o[0].address).catch(() => {})
}

/** "Turn off calendar" for one address. An address that doesn't send either is disconnected outright. */
export async function outlookCalendarOff(userEmail: string, address: string): Promise<{ removed: boolean; disconnected: boolean }> {
  const lower = userEmail.toLowerCase()
  const r = await row(lower, address)
  if (!r) return { removed: false, disconnected: false }
  const left = (r.scopes ?? []).filter((s) => s !== MS_CAL)
  if (!left.includes(MS_SEND)) {
    await disconnectOutlook(lower, r.address)
    return { removed: true, disconnected: true }
  }
  const { error } = await supabaseAdmin.from('pen_outlook').update({ scopes: left }).eq('id', r.id)
  if (error) throw new Error(error.message)
  return { removed: true, disconnected: false }
}

/* ------------------------------------------------------------------ send */

export type OutlookSend = { ok: true } | { ok: false; reason: 'cap' | 'not_connected' | 'revoked' | 'failed'; error: string }

/**
 * Sends one email as the user from a connected Microsoft address (POST /me/sendMail, a copy in
 * their Sent Items). Counts toward the one daily cap shared with Gmail and Juno's own sender.
 */
export async function sendViaOutlook(o: { userEmail: string; from: string; to: string; toName?: string | null; subject: string; body: string; sessionId: string | null }): Promise<OutlookSend> {
  const lower = o.userEmail.toLowerCase()
  if ((await sentToday(lower)) >= DAILY_SEND_CAP) return { ok: false, reason: 'cap', error: `daily limit of ${DAILY_SEND_CAP} emails reached` }
  const r = await row(lower, o.from)
  if (!r || !msCaps(r.scopes).can_send) return { ok: false, reason: 'not_connected', error: `${o.from} is not connected for sending` }
  let payload: Record<string, unknown>
  try {
    payload = sendMailPayload({ to: o.to, toName: o.toName, subject: o.subject, body: o.body })
  } catch (e) {
    return { ok: false, reason: 'failed', error: (e as Error).message }
  }
  try {
    await graph(lower, r.address, 'me/sendMail', { method: 'POST', body: payload })
  } catch (e) {
    const err = e as GraphError & { revoked?: boolean }
    // 401: the token died; 403 access denied: the permission was removed. Either way, connect again.
    const revoked = Boolean(err.revoked) || err.status === 401 || (err.status === 403 && /accessdenied|insufficient|authorization/i.test(`${err.code ?? ''} ${err.message}`))
    if (revoked) await supabaseAdmin.from('pen_outlook').update({ last_error: RECONNECT }).eq('id', r.id)
    // A Microsoft account with no Exchange Online mailbox (some personal/school setups) can't send through Graph.
    const noBox = /MailboxNotEnabledForRESTAPI|MailboxNotFound|mailbox is either inactive/i.test(`${err.code ?? ''} ${err.message}`)
    console.warn(`pen outlook: send failed (${err.status ?? '?'} ${err.code ?? ''})`)
    return { ok: false, reason: revoked ? 'revoked' : 'failed', error: noBox ? 'this Microsoft account has no Outlook mailbox Juno can send from' : err.message }
  }
  // Logged like every send (who, when, ok; never subject or body); counts toward the daily cap.
  await supabaseAdmin.from('pen_sent_emails').insert({ user_email: lower, to_email: o.to, session_id: o.sessionId, channel: 'outlook', ok: true, error: null }).then(() => {}, () => {})
  await supabaseAdmin.from('pen_outlook').update({ last_used_at: new Date().toISOString(), last_error: null }).eq('id', r.id).then(() => {}, () => {})
  await supabaseAdmin
    .from('pen_mail_from')
    .upsert({ user_email: lower, to_email: o.to.toLowerCase(), from_address: r.address, updated_at: new Date().toISOString() }, { onConflict: 'user_email,to_email' })
    .then(() => {}, () => {})
  return { ok: true }
}
