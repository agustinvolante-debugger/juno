// Granola: "Import from Granola" reads meetings out of the customer's Granola, two ways in.
//
//   A. A Granola API key (grn_…). Business / Enterprise plans make one in the Granola desktop app
//      under Settings → Connectors → API keys. REST, https://public-api.granola.ai, header
//      `Authorization: Bearer grn_…` (docs.granola.ai/introduction):
//        GET /v1/notes?created_after=&page_size=(1-30)&cursor=   → { notes, hasMore, cursor }
//        GET /v1/notes/{not_…}?include=transcript               → summary, calendar_event,
//            attendees, transcript[{ speaker:{source,attribution?,name?,diarization_label?},
//            text, start_time, end_time }]; 413 TRANSCRIPT_TOO_LARGE → page it from
//        GET /v1/notes/{id}/transcript?page_size=(1-100)&cursor= → { transcript, hasMore, cursor }
//      Only notes with a finished AI summary and transcript are returned. 5 requests/s.
//
//   B. Granola's official MCP connector (docs.granola.ai/help-center/sharing/integrations/mcp):
//      https://mcp.granola.ai/mcp over Streamable HTTP, browser OAuth with Dynamic Client
//      Registration. Discovery (checked 15 Oct 2026): protected resource metadata names the
//      authorization server https://mcp-auth.granola.ai, scope `mcp`; its
//      /.well-known/oauth-authorization-server has /oauth2/register, /oauth2/authorize,
//      /oauth2/token, PKCE S256, refresh_token, auth method `none`. Tools: list_meetings,
//      get_meetings, get_meeting_transcript (paid plans only). Free plan: last 30 days only.
//      Juno is the MCP client: JSON-RPC over HTTP, answers as JSON or an SSE stream.
//
// The key is preferred when both exist (one row per account, so connecting one replaces the
// other). Keys and tokens are stored sealed (AES-256-GCM, key from NEXTAUTH_SECRET), as Notion's
// and Google's are. The Granola account can be another email than the Juno login.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'

export const API = 'https://public-api.granola.ai'
export const MCP_URL = 'https://mcp.granola.ai/mcp'
export const STATE_COOKIE = 'juno_granola_state'
const MCP_PROTOCOL = '2025-06-18'
const STATE_TTL_MS = 10 * 60 * 1000

export type GranolaKind = 'api' | 'mcp'

/** The OAuth client Juno registered with Granola's authorization server (DCR), one per redirect URI. */
export type GranolaClient = {
  client_id: string
  client_secret?: string | null
  redirect_uri: string
  authorization_endpoint: string
  token_endpoint: string
  scope: string
  resource: string
  auth_method?: string
}

export type GranolaRow = {
  email: string
  kind: GranolaKind | 'client'
  /** Sealed: the API key, or JSON { access, refresh, expires_at } for the connector. */
  secret: string | null
  client: GranolaClient | null
  account_email: string | null
  connected_at: string
  last_import_at: string | null
  last_error: string | null
}

export type GranolaConnection = Omit<GranolaRow, 'secret' | 'client' | 'kind'> & { kind: GranolaKind }

/* ---------------------------------------------------------------- storage */

export type GranolaStore = {
  get(email: string): Promise<GranolaRow | null>
  upsert(row: GranolaRow): Promise<void>
  update(email: string, patch: Partial<GranolaRow>): Promise<void>
  remove(email: string): Promise<void>
  available(): Promise<boolean>
}

let availableCache: { at: number; ok: boolean } | null = null

const dbStore: GranolaStore = {
  async get(email) {
    const { data, error } = await supabaseAdmin.from('pen_granola').select('*').eq('email', email).maybeSingle()
    if (error) return null
    return (data as GranolaRow) ?? null
  },
  async upsert(row) {
    const { error } = await supabaseAdmin.from('pen_granola').upsert(row, { onConflict: 'email' })
    if (error) throw new Error(error.message)
  },
  async update(email, patch) {
    const { error } = await supabaseAdmin.from('pen_granola').update(patch).eq('email', email)
    if (error) throw new Error(error.message)
  },
  async remove(email) {
    const { error } = await supabaseAdmin.from('pen_granola').delete().eq('email', email)
    if (error) throw new Error(error.message)
  },
  // Live as soon as the table exists (lib/pen/schema.sql); checked once a minute.
  async available() {
    // Local preview of the screens before the table exists (never in production).
    if (process.env.NODE_ENV !== 'production' && process.env.PEN_GRANOLA_PREVIEW === '1') return true
    if (availableCache && Date.now() - availableCache.at < 60_000) return availableCache.ok
    const { error } = await supabaseAdmin.from('pen_granola').select('email', { count: 'exact', head: true }).limit(1)
    availableCache = { at: Date.now(), ok: !error }
    return !error
  },
}

// Tests only (.pentest/granola-test.mts) swap in an in-memory store: the table may not exist yet.
// Kept on globalThis so a script that loads this module twice (ESM + CJS) still sees one store.
const TEST_STORE = Symbol.for('juno.pen.granola.store')
const holder = globalThis as unknown as Record<symbol, GranolaStore | undefined>
const store: GranolaStore = new Proxy({} as GranolaStore, { get: (_t, k: keyof GranolaStore) => (holder[TEST_STORE] ?? dbStore)[k] })
export function __setGranolaStore(s: GranolaStore | null): void {
  holder[TEST_STORE] = s ?? undefined
}

export const granolaAvailable = () => store.available()

/* ------------------------------------------------------------ secrets */

function secretKey(): Buffer {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('No key to protect Granola keys (NEXTAUTH_SECRET).')
  return crypto.createHash('sha256').update(`juno-granola:${s}`).digest()
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

export function open(sealed: string): string {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'))
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

const fail = (message: string, status = 502) => Object.assign(new Error(message), { status })

/* ------------------------------------------------------------ connection */

const lower = (e: string) => e.toLowerCase()

export async function getConnection(email: string): Promise<GranolaConnection | null> {
  const r = await store.get(lower(email)).catch(() => null)
  if (!r || (r.kind !== 'api' && r.kind !== 'mcp') || !r.secret) return null
  const { secret: _s, client: _c, ...rest } = r
  void _s; void _c
  return { ...rest, kind: r.kind }
}

/** Deletes the stored key or token. Granola keeps its side; a key can be revoked in Granola. */
export async function disconnect(email: string): Promise<void> {
  await store.remove(lower(email))
}

export async function noteImport(email: string, error: string | null): Promise<void> {
  await store.update(lower(email), { last_import_at: new Date().toISOString(), last_error: error }).catch(() => {})
}

/* ------------------------------------------------------- A. the API key */

const KEY_SHAPE = /^grn_[A-Za-z0-9_\-]{8,200}$/

async function api<T>(key: string, path: string): Promise<T> {
  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } })
    if (res.status !== 429) break
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
  }
  const j = (await res!.json().catch(() => ({}))) as T & { message?: string; error?: string | { code?: string; message?: string } }
  if (!res!.ok) {
    const err = typeof j.error === 'object' ? j.error : null
    const code = err?.code ?? (typeof j.error === 'string' ? j.error : undefined)
    const msg = res!.status === 401 ? 'Granola didn’t accept that API key. Check it, or make a new one in Granola → Settings → Connectors → API keys.' : err?.message ?? j.message ?? `Granola ${path.split('?')[0]} failed (${res!.status})`
    throw Object.assign(new Error(msg), { status: res!.status === 401 ? 401 : res!.status === 404 ? 404 : 502, code, granolaStatus: res!.status })
  }
  return j
}

/** Paste a key in Settings: checked with one call before it is kept. */
export async function connectKey(email: string, raw: string): Promise<GranolaConnection> {
  const key = raw.trim()
  if (!KEY_SHAPE.test(key)) throw fail('That doesn’t look like a Granola API key. It starts with grn_.', 400)
  const r = await api<{ notes: { owner?: { email?: string } }[] }>(key, '/v1/notes?page_size=1')
  const now = new Date().toISOString()
  await store.upsert({
    email: lower(email),
    kind: 'api',
    secret: seal(key),
    client: null,
    account_email: r.notes?.[0]?.owner?.email ?? null,
    connected_at: now,
    last_import_at: null,
    last_error: null,
  })
  return (await getConnection(email))!
}

/* -------------------------------------------- B. the connector: OAuth (DCR) */

export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/pen/granola/callback`
}

async function getJ<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } }).catch(() => null)
  if (!res?.ok) return null
  return (await res.json().catch(() => null)) as T | null
}

type AsMeta = { issuer?: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string; scopes_supported?: string[]; token_endpoint_auth_methods_supported?: string[]; code_challenge_methods_supported?: string[] }

/** RFC 9728 then RFC 8414, as the MCP authorization spec has a client do it. */
export async function discover(): Promise<{ as: AsMeta; scope: string; resource: string }> {
  const u = new URL(MCP_URL)
  const prm =
    (await getJ<{ resource?: string; authorization_servers?: string[]; scopes_supported?: string[] }>(`${u.origin}/.well-known/oauth-protected-resource${u.pathname}`)) ??
    (await getJ<{ resource?: string; authorization_servers?: string[]; scopes_supported?: string[] }>(`${u.origin}/.well-known/oauth-protected-resource`))
  const issuer = prm?.authorization_servers?.[0]
  if (!issuer) throw fail('Granola’s sign-in isn’t answering. Try again in a minute.')
  const i = new URL(issuer)
  const path = i.pathname === '/' ? '' : i.pathname
  const as =
    (await getJ<AsMeta>(`${i.origin}/.well-known/oauth-authorization-server${path}`)) ??
    (await getJ<AsMeta>(`${i.origin}/.well-known/openid-configuration${path}`))
  if (!as?.authorization_endpoint || !as.token_endpoint) throw fail('Granola’s sign-in isn’t answering. Try again in a minute.')
  const scopes = [...(prm?.scopes_supported ?? [])]
  // A refresh token, so the connection outlives the first access token.
  if (as.scopes_supported?.includes('offline_access') && !scopes.includes('offline_access')) scopes.push('offline_access')
  return { as, scope: scopes.join(' '), resource: prm?.resource ?? MCP_URL }
}

const clientKey = (redirect: string) => `_client:${redirect}`

/** Juno's OAuth client for this redirect URI: registered with Granola once (DCR) and kept. */
export async function ensureClient(origin: string): Promise<GranolaClient> {
  const redirect = redirectUri(origin)
  const kept = await store.get(clientKey(redirect)).catch(() => null)
  if (kept?.client?.client_id) return kept.client
  const d = await discover()
  if (!d.as.registration_endpoint) throw fail('Granola doesn’t offer sign-in for apps right now.')
  const methods = d.as.token_endpoint_auth_methods_supported ?? ['none']
  const auth = methods.includes('none') ? 'none' : 'client_secret_post'
  const res = await fetch(d.as.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Juno Pen',
      client_uri: 'https://www.tryjunoapp.com/pen',
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: auth,
      ...(d.scope ? { scope: d.scope } : {}),
    }),
  })
  const j = (await res.json().catch(() => ({}))) as { client_id?: string; client_secret?: string; error_description?: string; error?: string }
  if (!res.ok || !j.client_id) throw fail(`Granola didn’t register Juno: ${j.error_description ?? j.error ?? res.status}`)
  const client: GranolaClient = {
    client_id: j.client_id,
    client_secret: j.client_secret ?? null,
    redirect_uri: redirect,
    authorization_endpoint: d.as.authorization_endpoint,
    token_endpoint: d.as.token_endpoint,
    scope: d.scope,
    resource: d.resource,
    auth_method: j.client_secret ? auth : 'none',
  }
  await store.upsert({ email: clientKey(redirect), kind: 'client', secret: null, client, account_email: null, connected_at: new Date().toISOString(), last_import_at: null, last_error: null })
  return client
}

/** The connect attempt kept in a cookie: a nonce (the state or inside the chat state) and the PKCE verifier. */
export function makeAttempt(): { nonce: string; verifier: string; cookie: string } {
  const nonce = crypto.randomBytes(16).toString('hex')
  const verifier = crypto.randomBytes(32).toString('base64url')
  return { nonce, verifier, cookie: seal(JSON.stringify({ n: nonce, v: verifier, x: Date.now() + STATE_TTL_MS })) }
}

export function readAttempt(cookie: string | null | undefined): { nonce: string; verifier: string } | null {
  if (!cookie) return null
  try {
    const p = JSON.parse(open(cookie)) as { n?: string; v?: string; x?: number }
    if (typeof p.n !== 'string' || typeof p.v !== 'string' || typeof p.x !== 'number' || p.x < Date.now()) return null
    return { nonce: p.n, verifier: p.v }
  } catch {
    return null
  }
}

/** Granola's sign-in page for this attempt. */
export async function authorizeUrl(origin: string, state: string, verifier: string): Promise<string> {
  const c = await ensureClient(origin)
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: c.client_id,
    redirect_uri: c.redirect_uri,
    state,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: c.resource,
    ...(c.scope ? { scope: c.scope } : {}),
  })
  return `${c.authorization_endpoint}?${q}`
}

type Tokens = { access: string; refresh: string | null; expires_at: number | null }

async function tokenCall(c: GranolaClient, body: Record<string, string>): Promise<Tokens & { refreshKept?: boolean }> {
  const form = new URLSearchParams({ ...body, client_id: c.client_id, resource: c.resource })
  if (c.client_secret && c.auth_method !== 'client_secret_basic') form.set('client_secret', c.client_secret)
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  if (c.client_secret && c.auth_method === 'client_secret_basic') headers.Authorization = `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64')}`
  const res = await fetch(c.token_endpoint, { method: 'POST', headers, body: form })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !j.access_token) throw Object.assign(new Error(j.error_description ?? j.error ?? `Granola sign-in failed (${res.status})`), { status: 401, oauth: j.error })
  return { access: j.access_token, refresh: j.refresh_token ?? null, expires_at: j.expires_in ? Date.now() + j.expires_in * 1000 : null }
}

/** The callback: the code for tokens, kept sealed; the Granola account's email read once. */
export async function connectOAuth(email: string, code: string, verifier: string, origin: string): Promise<GranolaConnection> {
  const c = await ensureClient(origin)
  const t = await tokenCall(c, { grant_type: 'authorization_code', code, redirect_uri: c.redirect_uri, code_verifier: verifier })
  await store.upsert({
    email: lower(email),
    kind: 'mcp',
    secret: seal(JSON.stringify(t)),
    client: c,
    account_email: null,
    connected_at: new Date().toISOString(),
    last_import_at: null,
    last_error: null,
  })
  // Which Granola account this is (it can differ from the Juno login). Best effort.
  try {
    const info = await mcpCall(email, 'get_account_info', {})
    const m = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(info.text)
    if (m) await store.update(lower(email), { account_email: m[0] })
  } catch { /* the connection stands without it */ }
  return (await getConnection(email))!
}

// Two imports at once must not both spend the same refresh token (Granola rotates them).
const refreshing = new Map<string, Promise<{ access: string; client: GranolaClient }>>()

async function tokensFor(email: string, force = false): Promise<{ access: string; client: GranolaClient }> {
  const k = lower(email)
  const inflight = refreshing.get(k)
  if (inflight) return inflight
  const p = tokensOnce(email, force)
  refreshing.set(k, p)
  try {
    return await p
  } finally {
    refreshing.delete(k)
  }
}

async function tokensOnce(email: string, force: boolean): Promise<{ access: string; client: GranolaClient }> {
  const r = await store.get(lower(email))
  if (!r || r.kind !== 'mcp' || !r.secret || !r.client) throw fail('Granola isn’t connected.', 409)
  const t = JSON.parse(open(r.secret)) as Tokens
  const stale = t.expires_at != null && t.expires_at < Date.now() + 60_000
  if (!force && !stale) return { access: t.access, client: r.client }
  if (!t.refresh) {
    await store.update(lower(email), { last_error: 'Granola signed Juno out. Connect again in Settings → Granola.' }).catch(() => {})
    throw fail('Granola signed Juno out. Connect again in Settings → Granola.', 401)
  }
  try {
    const n = await tokenCall(r.client, { grant_type: 'refresh_token', refresh_token: t.refresh })
    const next: Tokens = { access: n.access, refresh: n.refresh ?? t.refresh, expires_at: n.expires_at }
    await store.update(lower(email), { secret: seal(JSON.stringify(next)), last_error: null })
    return { access: next.access, client: r.client }
  } catch (e) {
    await store.update(lower(email), { last_error: 'Granola signed Juno out. Connect again in Settings → Granola.' }).catch(() => {})
    throw Object.assign(e as Error, { status: 401 })
  }
}

/* ------------------------------------------- B. the connector: MCP over HTTP */

type RpcMsg = { jsonrpc: '2.0'; id?: number | string; result?: unknown; error?: { code: number; message: string } }

/** A JSON-RPC answer from a Streamable HTTP response: plain JSON, or the matching event of an SSE stream. */
async function readRpc(res: Response, id: number): Promise<RpcMsg | null> {
  const type = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (type.includes('text/event-stream')) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
      if (!data) continue
      try {
        const m = JSON.parse(data) as RpcMsg
        if (m.id === id) return m
      } catch { /* not JSON */ }
    }
    return null
  }
  if (!text.trim()) return null
  const j = JSON.parse(text) as RpcMsg | RpcMsg[]
  return Array.isArray(j) ? j.find((m) => m.id === id) ?? null : j
}

type ToolSchema = { properties?: Record<string, unknown>; required?: string[] }
type McpSession = { access: string; sid: string | null; tools: Map<string, { inputSchema?: ToolSchema }> }

async function rpc(s: McpSession, id: number | null, method: string, params: unknown): Promise<{ res: Response; msg: RpcMsg | null }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${s.access}`,
    'MCP-Protocol-Version': MCP_PROTOCOL,
  }
  if (s.sid) headers['Mcp-Session-Id'] = s.sid
  const body = id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) })
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { status: 401, mcp401: true })
  if (id === null) { await res.text().catch(() => ''); return { res, msg: null } }
  if (!res.ok) throw fail(`Granola didn’t answer (${res.status}).`)
  const msg = await readRpc(res, id)
  if (msg?.error) throw fail(`Granola: ${msg.error.message}`)
  return { res, msg }
}

async function openSession(access: string): Promise<McpSession> {
  const s: McpSession = { access, sid: null, tools: new Map() }
  const init = await rpc(s, 1, 'initialize', { protocolVersion: MCP_PROTOCOL, capabilities: {}, clientInfo: { name: 'Juno Pen', version: '1.0' } })
  s.sid = init.res.headers.get('mcp-session-id')
  await rpc(s, null, 'notifications/initialized', {})
  const list = await rpc(s, 2, 'tools/list', {})
  for (const t of ((list.msg?.result as { tools?: { name: string; inputSchema?: ToolSchema }[] })?.tools ?? [])) s.tools.set(t.name, { inputSchema: t.inputSchema })
  return s
}

// One session per account for a few minutes: an import of 20 meetings is ~40 calls.
const sessions = new Map<string, { s: McpSession; at: number }>()

async function session(email: string, force = false): Promise<McpSession> {
  const k = lower(email)
  const kept = sessions.get(k)
  if (!force && kept && Date.now() - kept.at < 5 * 60_000) return kept.s
  let s: McpSession
  try {
    s = await openSession((await tokensFor(email, force)).access)
  } catch (e) {
    // The token was revoked or expired early: refresh once and open again.
    if (!(e as { mcp401?: boolean }).mcp401 || force) throw (e as { mcp401?: boolean }).mcp401 ? fail('Granola signed Juno out. Connect again in Settings → Granola.', 401) : e
    s = await openSession((await tokensFor(email, true)).access)
  }
  sessions.set(k, { s, at: Date.now() })
  return s
}

export type ToolResult = { text: string; structured: unknown; isError: boolean }
let callId = 10

/** One MCP tool call; a 401 refreshes the token once and starts a new session. */
export async function mcpCall(email: string, tool: string, args: Record<string, unknown>, s?: McpSession): Promise<ToolResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sess = s ?? (await session(email, attempt > 0))
      if (sess.tools.size && !sess.tools.has(tool)) return { text: '', structured: null, isError: true }
      const { msg } = await rpc(sess, ++callId, 'tools/call', { name: tool, arguments: args })
      const r = (msg?.result ?? {}) as { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean }
      return { text: (r.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n'), structured: r.structuredContent ?? null, isError: Boolean(r.isError) }
    } catch (e) {
      if ((e as { mcp401?: boolean }).mcp401 && attempt === 0 && !s) { sessions.delete(lower(email)); continue }
      if ((e as { mcp401?: boolean }).mcp401) throw fail('Granola signed Juno out. Connect again in Settings → Granola.', 401)
      throw e
    }
  }
  throw fail('Granola didn’t answer.')
}

/** The tool's argument names (what the server says it takes), so the calls follow its schema. */
async function argNames(email: string, tool: string): Promise<Set<string>> {
  const s = await session(email)
  return new Set(Object.keys(s.tools.get(tool)?.inputSchema?.properties ?? {}))
}

/* ----------------------------------------------- one interface, both ways */

export type GranolaMeeting = { id: string; title: string; start: string | null; minutes: number | null }
export type GranolaTurn = { speaker: string; me: boolean; text: string; start?: string; end?: string }
export type GranolaNote = {
  id: string
  title: string
  start: string | null
  seconds: number | null
  /** Turns with a speaker (the API), or null when Granola gives no transcript. */
  turns: GranolaTurn[] | null
  /** The transcript as text with "Name: words" lines (the connector), when there are no turns. */
  transcriptText: string | null
  summary: string | null
  privateNotes: string | null
  attendees: { name: string | null; email: string | null }[]
  ownerEmail: string | null
}

async function apiKey(email: string): Promise<string | null> {
  const r = await store.get(lower(email))
  return r?.kind === 'api' && r.secret ? open(r.secret) : null
}

async function kindOf(email: string): Promise<GranolaKind> {
  const r = await store.get(lower(email)).catch(() => null)
  if (!r?.secret || (r.kind !== 'api' && r.kind !== 'mcp')) throw fail('Granola isn’t connected. Connect it in Settings → Granola.', 409)
  return r.kind
}

type ApiNote = {
  id: string
  title: string | null
  created_at: string
  owner?: { name: string | null; email: string }
  calendar_event?: { scheduled_start_time?: string | null; scheduled_end_time?: string | null } | null
  attendees?: { name: string | null; email: string }[]
  summary_text?: string | null
  summary_markdown?: string | null
  private_notes_markdown?: string | null
  private_notes_text?: string | null
  transcript?: ApiTurn[] | null
}
type ApiTurn = { speaker?: { source?: string; attribution?: 'me' | 'them'; name?: string; diarization_label?: string }; text?: string; start_time?: string; end_time?: string }

const minutesOf = (a?: string | null, b?: string | null) => (a && b && Date.parse(b) > Date.parse(a) ? Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : null)

/** Meetings since `since` (default: 30 days), newest first, at most `limit`. */
export async function listMeetings(email: string, o: { since?: Date; limit?: number } = {}): Promise<GranolaMeeting[]> {
  const since = o.since ?? new Date(Date.now() - 30 * 86_400_000)
  const limit = Math.min(o.limit ?? 60, 200)
  if ((await kindOf(email)) === 'api') {
    const key = (await apiKey(email))!
    const out: ApiNote[] = []
    let cursor: string | null = null
    do {
      const q: URLSearchParams = new URLSearchParams({ created_after: since.toISOString(), page_size: '30', ...(cursor ? { cursor } : {}) })
      const page: { notes: ApiNote[]; hasMore: boolean; cursor: string | null } = await api(key, `/v1/notes?${q}`)
      out.push(...(page.notes ?? []))
      cursor = page.hasMore ? page.cursor : null
    } while (cursor && out.length < limit)
    const list = out.slice(0, limit)
    // The list has no meeting times; the first 20 are looked up (no transcript) for date and length.
    const detail = new Map<string, ApiNote>()
    const { pool } = await import('./event-day')
    await pool(list.slice(0, 20), 3, async (n) => {
      const d = await api<ApiNote>(key, `/v1/notes/${encodeURIComponent(n.id)}`).catch(() => null)
      if (d) detail.set(n.id, d)
    })
    return list
      .map((n) => {
        const ev = detail.get(n.id)?.calendar_event
        return { id: n.id, title: n.title?.trim() || 'Granola meeting', start: ev?.scheduled_start_time ?? n.created_at ?? null, minutes: minutesOf(ev?.scheduled_start_time, ev?.scheduled_end_time) }
      })
      .sort((a, b) => (Date.parse(b.start ?? '') || 0) - (Date.parse(a.start ?? '') || 0))
  }
  const names = await argNames(email, 'list_meetings')
  const args: Record<string, unknown> = {}
  if (names.has('custom_start')) {
    Object.assign(args, { time_range: 'custom', custom_start: since.toISOString(), custom_end: new Date().toISOString() })
  } else if (names.has('time_range')) {
    args.time_range = Date.now() - since.getTime() <= 7 * 86_400_000 ? 'this_week' : 'last_30_days'
  }
  if (names.has('limit')) args.limit = limit
  const r = await mcpCall(email, 'list_meetings', args)
  if (r.isError) throw fail(r.text.slice(0, 200) || 'Granola couldn’t list your meetings.')
  return parseMeetingList(r)
    .filter((m) => !m.start || Date.parse(m.start) >= since.getTime() - 86_400_000)
    .sort((a, b) => (Date.parse(b.start ?? '') || 0) - (Date.parse(a.start ?? '') || 0))
    .slice(0, limit)
}

/** One meeting with whatever Granola has: transcript (if the plan allows), summary, private notes. */
export async function getMeeting(email: string, id: string): Promise<GranolaNote> {
  if ((await kindOf(email)) === 'api') {
    const key = (await apiKey(email))!
    let n: ApiNote
    try {
      n = await api<ApiNote>(key, `/v1/notes/${encodeURIComponent(id)}?include=transcript`)
    } catch (e) {
      if ((e as { granolaStatus?: number }).granolaStatus !== 413) throw e
      // Too long to come inline: the same note without it, then the transcript in pages.
      n = await api<ApiNote>(key, `/v1/notes/${encodeURIComponent(id)}`)
      const turns: ApiTurn[] = []
      let cursor: string | null = null
      do {
        const q: URLSearchParams = new URLSearchParams({ page_size: '100', ...(cursor ? { cursor } : {}) })
        const page: { transcript: ApiTurn[]; hasMore: boolean; cursor: string | null } = await api(key, `/v1/notes/${encodeURIComponent(id)}/transcript?${q}`)
        turns.push(...(page.transcript ?? []))
        cursor = page.hasMore ? page.cursor : null
      } while (cursor && turns.length < 20_000)
      n.transcript = turns
    }
    return fromApi(n)
  }
  const names = await argNames(email, 'get_meetings')
  const meta = await mcpCall(email, 'get_meetings', names.has('meeting_id') && !names.has('meeting_ids') ? { meeting_id: id } : { meeting_ids: [id] })
  if (meta.isError) throw fail(meta.text.slice(0, 200) || 'Granola couldn’t find that meeting.', 404)
  const found = parseMeetingList(meta).find((m) => m.id === id)
  const tnames = await argNames(email, 'get_meeting_transcript')
  const tr = await mcpCall(email, 'get_meeting_transcript', tnames.has('meeting_ids') && !tnames.has('meeting_id') ? { meeting_ids: [id] } : { meeting_id: id }).catch(() => null)
  const transcriptText = tr && !tr.isError ? cleanTranscript(tr) : null
  const sections = parseMeetingDetail(meta.text)
  return {
    id,
    title: found?.title ?? sections.title ?? 'Granola meeting',
    start: found?.start ?? null,
    seconds: found?.minutes ? found.minutes * 60 : null,
    turns: null,
    transcriptText: transcriptText && transcriptText.trim().length > 20 ? transcriptText : null,
    summary: sections.summary,
    privateNotes: sections.privateNotes,
    attendees: sections.attendees,
    ownerEmail: null,
  }
}

function fromApi(n: ApiNote): GranolaNote {
  const ev = n.calendar_event
  const t = (n.transcript ?? []).filter((x) => x.text?.trim())
  const first = t[0]?.start_time
  const last = t[t.length - 1]?.end_time
  const owner = n.owner?.email?.toLowerCase() ?? null
  const others = (n.attendees ?? []).filter((a) => a.email?.toLowerCase() !== owner)
  // "them" is everyone else; with exactly one other person on the invite, that is who it was.
  const onlyOther = others.length === 1 ? others[0].name?.trim() || null : null
  const turns: GranolaTurn[] = t.map((x) => {
    const sp = x.speaker ?? {}
    const me = sp.attribution === 'me' || (!sp.attribution && !sp.diarization_label && sp.source === 'microphone')
    const speaker = sp.name?.trim() || (me ? 'Me' : sp.diarization_label?.trim() || (sp.attribution === 'them' || sp.source === 'speaker' ? onlyOther ?? 'Them' : 'Speaker'))
    return { speaker, me: me && !sp.name, text: x.text!.trim(), start: x.start_time, end: x.end_time }
  })
  return {
    id: n.id,
    title: n.title?.trim() || 'Granola meeting',
    start: ev?.scheduled_start_time ?? first ?? n.created_at ?? null,
    seconds: first && last && Date.parse(last) > Date.parse(first) ? (Date.parse(last) - Date.parse(first)) / 1000 : ev?.scheduled_start_time && ev.scheduled_end_time ? Math.max(0, (Date.parse(ev.scheduled_end_time) - Date.parse(ev.scheduled_start_time)) / 1000) : null,
    turns: turns.length ? turns : null,
    transcriptText: null,
    summary: n.summary_markdown?.trim() || n.summary_text?.trim() || null,
    privateNotes: n.private_notes_markdown?.trim() || n.private_notes_text?.trim() || null,
    attendees: (n.attendees ?? []).map((a) => ({ name: a.name ?? null, email: a.email ?? null })),
    ownerEmail: owner,
  }
}

/** Turns as transcript text, one "Name: words" line per turn, a speaker's run joined. */
export function turnsToText(turns: GranolaTurn[], selfName?: string | null): string {
  const lines: { who: string; text: string }[] = []
  for (const t of turns) {
    const who = t.me ? selfName?.trim() || 'Me' : t.speaker
    const prev = lines[lines.length - 1]
    if (prev && prev.who === who) prev.text += ` ${t.text}`
    else lines.push({ who, text: t.text })
  }
  return lines.map((l) => `${l.who}: ${l.text}`).join('\n')
}

/* ---------------------------------------- reading the connector's answers */

const UUIDISH = /^[A-Za-z0-9_-]{6,80}$/
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const attr = (attrs: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs) ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(attrs)
  return m ? decode(m[1]).trim() : null
}
const asIso = (d: string | null | undefined) => {
  if (!d) return null
  const t = Date.parse(d)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

type LooseMeeting = { id?: string; meeting_id?: string; title?: string; name?: string; date?: string; start?: string; start_time?: string; created_at?: string; duration?: number; duration_minutes?: number; end?: string; end_time?: string }

function fromLoose(m: LooseMeeting): GranolaMeeting | null {
  const id = m.id ?? m.meeting_id
  if (!id) return null
  const start = asIso(m.start ?? m.start_time ?? m.date ?? m.created_at)
  const end = asIso(m.end ?? m.end_time)
  const minutes = typeof m.duration_minutes === 'number' ? Math.round(m.duration_minutes) : typeof m.duration === 'number' ? Math.round(m.duration > 600 ? m.duration / 60 : m.duration) : minutesOf(start, end)
  return { id: String(id), title: (m.title ?? m.name ?? '').trim() || 'Granola meeting', start, minutes }
}

/**
 * The meetings in a list_meetings / get_meetings answer. Structured content or JSON when the
 * server sends it; otherwise the `<meeting id="…" title="…" date="…">` markup Granola's tools
 * write for assistants. Unknown shapes give an empty list, never a throw.
 */
export function parseMeetingList(r: { text: string; structured?: unknown }): GranolaMeeting[] {
  const tryJson = (v: unknown): GranolaMeeting[] | null => {
    const arr = Array.isArray(v) ? v : v && typeof v === 'object' ? ((v as { meetings?: unknown; notes?: unknown; results?: unknown }).meetings ?? (v as { notes?: unknown }).notes ?? (v as { results?: unknown }).results) : null
    if (!Array.isArray(arr)) return null
    return arr.map((x) => fromLoose(x as LooseMeeting)).filter((x): x is GranolaMeeting => !!x)
  }
  const s = r.structured ? tryJson(r.structured) : null
  if (s?.length) return s
  try {
    const j = tryJson(JSON.parse(r.text))
    if (j) return j
  } catch { /* markup, not JSON */ }
  const out: GranolaMeeting[] = []
  for (const m of r.text.matchAll(/<meeting\b([^>]*)>/gi)) {
    const id = attr(m[1], 'id') ?? attr(m[1], 'meeting_id')
    if (!id || !UUIDISH.test(id)) continue
    const start = asIso(attr(m[1], 'date') ?? attr(m[1], 'start') ?? attr(m[1], 'start_time'))
    const dur = attr(m[1], 'duration')
    out.push({ id, title: attr(m[1], 'title') || 'Granola meeting', start, minutes: dur && /^\d+/.test(dur) ? parseInt(dur, 10) : minutesOf(start, asIso(attr(m[1], 'end') ?? attr(m[1], 'end_time'))) })
  }
  return out
}

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim()

function section(text: string, ...names: string[]): string | null {
  for (const n of names) {
    const m = new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`, 'i').exec(text)
    if (m && stripTags(m[1])) return stripTags(m[1])
  }
  return null
}

/** Summary, the user's own notes and who was there, from a get_meetings answer. */
export function parseMeetingDetail(text: string): { title: string | null; summary: string | null; privateNotes: string | null; attendees: { name: string | null; email: string | null }[] } {
  try {
    const j = JSON.parse(text) as unknown
    const m = (Array.isArray(j) ? j[0] : (j as { meetings?: unknown[] })?.meetings?.[0] ?? j) as Record<string, unknown> | undefined
    if (m && typeof m === 'object') {
      const str = (k: string) => (typeof m[k] === 'string' && (m[k] as string).trim() ? (m[k] as string).trim() : null)
      return {
        title: str('title'),
        summary: str('summary_markdown') ?? str('summary') ?? str('enhanced_notes') ?? str('notes'),
        privateNotes: str('private_notes') ?? str('my_notes'),
        attendees: Array.isArray(m.attendees) ? (m.attendees as { name?: string; email?: string }[]).map((a) => ({ name: a.name ?? null, email: a.email ?? null })) : [],
      }
    }
  } catch { /* markup */ }
  const tag = /<meeting\b([^>]*)>/i.exec(text)
  const attendees: { name: string | null; email: string | null }[] = []
  const people = section(text, 'known_participants', 'participants', 'attendees')
  if (people) for (const p of people.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)) {
    const em = /<?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)>?/.exec(p)
    attendees.push({ name: p.replace(/<[^>]*>|\([^)]*\)/g, '').replace(em?.[0] ?? '', '').trim() || null, email: em?.[1] ?? null })
  }
  const summary = section(text, 'summary', 'enhanced_notes', 'summarized_notes', 'notes', 'ai_notes')
  const privateNotes = section(text, 'private_notes', 'my_notes', 'user_notes')
  // Nothing tagged: what is left after the header is the summary.
  const fallback = !summary && !privateNotes ? stripTags(text.replace(/<meeting\b[^>]*>/i, '')) || null : null
  return { title: tag ? attr(tag[1], 'title') : null, summary: summary ?? fallback, privateNotes, attendees }
}

/** A get_meeting_transcript answer as plain "Name: words" lines (tags and JSON unwrapped). */
export function cleanTranscript(r: { text: string; structured?: unknown }): string {
  const fromArr = (arr: unknown): string | null => {
    if (!Array.isArray(arr)) return null
    const lines = arr.map((x) => {
      const o = x as { speaker?: string | { name?: string; attribution?: string; source?: string }; text?: string }
      const who = typeof o.speaker === 'string' ? o.speaker : o.speaker?.name ?? (o.speaker?.attribution === 'me' ? 'Me' : o.speaker?.attribution === 'them' ? 'Them' : o.speaker?.source === 'microphone' ? 'Me' : 'Them')
      return o.text?.trim() ? `${who}: ${o.text.trim()}` : ''
    }).filter(Boolean)
    return lines.length ? lines.join('\n') : null
  }
  const st = r.structured as { transcript?: unknown } | null
  const fromStructured = st ? fromArr(st.transcript ?? st) : null
  if (fromStructured) return fromStructured
  try {
    const j = JSON.parse(r.text) as { transcript?: unknown }
    const t = typeof j?.transcript === 'string' ? j.transcript : fromArr(j?.transcript ?? j)
    if (t) return t
  } catch { /* text */ }
  const inner = section(r.text, 'transcript') ?? stripTags(r.text)
  // "Me: …  Them: …" run together on one line: one turn per line.
  return inner.replace(/\s+(?=(?:Me|Them|Speaker [A-Z0-9]+):\s)/g, '\n').trim()
}
