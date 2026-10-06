// Notion: every finished note also lands as a page in the customer's own Notion (agreed 5 Oct;
// Pocket keeps this behind its Pro plan, we include it).
//
//   · Connect once in Settings → Notion. Notion's own window asks which page Juno may use;
//     Juno makes a "Juno Pen notes" table under it.
//   · From then on, each recording's notes are added as a row/page when they're ready (on by
//     default, can be switched off), and any note has a "Send to Notion" button.
//   · Each recording goes to Notion once (pen_notion_pages). Sending again just opens it.
//
// The access token is stored encrypted (AES-256-GCM, key from NEXTAUTH_SECRET). Rotating that
// secret means everyone reconnects, which is the right failure: a token we can't read is a
// token nobody else can either.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import type { PenSession } from './store'

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

export function notionConfigured(): boolean {
  return Boolean(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET)
}

export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/pen/notion/callback`
}

export function authorizeUrl(origin: string, state: string): string {
  const q = new URLSearchParams({ client_id: process.env.NOTION_CLIENT_ID!, response_type: 'code', owner: 'user', redirect_uri: redirectUri(origin), state })
  return `${API}/oauth/authorize?${q}`
}

/* ------------------------------------------------------------ token at rest */

function key(): Buffer {
  const s = process.env.NOTION_TOKEN_KEY || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('No key to protect Notion tokens (NEXTAUTH_SECRET).')
  return crypto.createHash('sha256').update(`juno-notion:${s}`).digest()
}

function seal(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

function open(sealed: string): string {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'))
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

/* -------------------------------------------------------------- connection */

export type NotionConnection = {
  email: string
  workspace_name: string | null
  workspace_icon: string | null
  database_id: string | null
  database_url: string | null
  auto: boolean
  last_error: string | null
}

type Row = NotionConnection & { access_token: string; page_id: string | null }

async function row(email: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin.from('pen_notion').select('*').eq('email', email.toLowerCase()).maybeSingle()
  if (error) return null
  return (data as Row) ?? null
}

export async function getConnection(email: string): Promise<NotionConnection | null> {
  const r = await row(email)
  if (!r) return null
  const { access_token: _t, page_id: _p, ...rest } = r
  void _t; void _p
  return rest
}

export async function disconnect(email: string): Promise<void> {
  await supabaseAdmin.from('pen_notion').delete().eq('email', email.toLowerCase())
}

export async function setAuto(email: string, auto: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from('pen_notion').update({ auto, updated_at: new Date().toISOString() }).eq('email', email.toLowerCase())
  if (error) throw new Error(error.message)
}

async function notion<T>(token: string, path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const j = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string }
  if (!res.ok) throw Object.assign(new Error(j.message ?? `Notion ${path} failed (${res.status})`), { status: res.status, code: j.code })
  return j
}

/** The account's Notion token, for reading (lib/pen/notion-import.ts). Null if not connected. */
export async function notionToken(email: string): Promise<string | null> {
  const r = await row(email)
  return r ? open(r.access_token) : null
}

/** The OAuth callback: swap the code for a token, keep it, and make the notes table. */
export async function connect(email: string, code: string, origin: string): Promise<NotionConnection> {
  const basic = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json', 'Notion-Version': VERSION },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(origin) }),
  })
  const t = (await res.json()) as { access_token?: string; bot_id?: string; workspace_id?: string; workspace_name?: string; workspace_icon?: string; error_description?: string; message?: string }
  if (!res.ok || !t.access_token) throw new Error(t.error_description ?? t.message ?? 'Notion didn’t accept the connection.')
  const { error } = await supabaseAdmin.from('pen_notion').upsert(
    {
      email: email.toLowerCase(),
      access_token: seal(t.access_token),
      bot_id: t.bot_id ?? null,
      workspace_id: t.workspace_id ?? null,
      workspace_name: t.workspace_name ?? null,
      workspace_icon: t.workspace_icon ?? null,
      database_id: null,
      database_url: null,
      page_id: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' },
  )
  if (error) throw new Error(error.message)
  await ensureDatabase(email)
  return (await getConnection(email))!
}

const NO_PAGE = 'Juno can’t see any page in your Notion yet. Connect again and tick at least one page for Juno to use.'

/** The "Juno Pen notes" table: kept if it still exists, made under a page they shared if not. */
async function ensureDatabase(email: string): Promise<{ token: string; databaseId: string }> {
  const r = await row(email)
  if (!r) throw new Error('Notion isn’t connected.')
  const token = open(r.access_token)
  if (r.database_id) {
    try {
      const db = await notion<{ id: string; archived?: boolean; in_trash?: boolean }>(token, `databases/${r.database_id}`)
      if (!db.archived && !db.in_trash) return { token, databaseId: r.database_id }
    } catch {
      /* deleted or unshared: make a new one */
    }
  }
  const found = await notion<{ results: { id: string; object: string; archived?: boolean; in_trash?: boolean }[] }>(token, 'search', {
    filter: { property: 'object', value: 'page' },
    page_size: 20,
  })
  const page = found.results.find((p) => p.object === 'page' && !p.archived && !p.in_trash)
  if (!page) {
    await supabaseAdmin.from('pen_notion').update({ last_error: NO_PAGE }).eq('email', email.toLowerCase())
    throw new Error(NO_PAGE)
  }
  const db = await notion<{ id: string; url: string }>(token, 'databases', {
    parent: { type: 'page_id', page_id: page.id },
    icon: { type: 'emoji', emoji: '🖊️' },
    title: [{ type: 'text', text: { content: 'Juno Pen notes' } }],
    properties: {
      Name: { title: {} },
      Date: { date: {} },
      People: { rich_text: {} },
      Type: { select: {} },
      'Open to-dos': { number: {} },
      'In Juno': { url: {} },
    },
  })
  await supabaseAdmin
    .from('pen_notion')
    .update({ database_id: db.id, database_url: db.url, page_id: page.id, last_error: null, updated_at: new Date().toISOString() })
    .eq('email', email.toLowerCase())
  return { token, databaseId: db.id }
}

/* ------------------------------------------------------------------ pages */

const text = (t: string) => [{ type: 'text', text: { content: t.slice(0, 2000) } }]
const block = (type: string, t: string, extra: Record<string, unknown> = {}) => ({ object: 'block', type, [type]: { rich_text: text(t), ...extra } })

/** Long text in Notion-sized pieces (2,000 characters per text object). */
function paragraphs(t: string) {
  const out = []
  for (const p of t.split(/\n{2,}/)) for (let i = 0; i < p.length; i += 1900) out.push(block('paragraph', p.slice(i, i + 1900)))
  return out
}

const LABELS = {
  en: { summary: 'Summary', todos: 'To-dos', decisions: 'Decisions', missed: 'Said once, easy to miss', questions: 'Still open', people: 'Who was there', open: 'Open the full note in Juno' },
  es: { summary: 'Resumen', todos: 'Pendientes', decisions: 'Decisiones', missed: 'Dicho una vez, fácil de perder', questions: 'Sin resolver', people: 'Quiénes estaban', open: 'Abrir la nota completa en Juno' },
  pt: { summary: 'Resumo', todos: 'Tarefas', decisions: 'Decisões', missed: 'Dito uma vez, fácil de perder', questions: 'Em aberto', people: 'Quem estava', open: 'Abrir a nota completa no Juno' },
} as const

function pageFor(s: PenSession, lang: 'en' | 'es' | 'pt', databaseId: string, link: string) {
  const n = s.notes ?? {}
  const L = LABELS[lang]
  const done = new Set(Array.isArray(s.action_done) ? s.action_done : [])
  const actions = n.actions ?? []
  const children: unknown[] = []
  if (n.summary) children.push(block('heading_2', L.summary), ...paragraphs(n.summary))
  if (actions.length) {
    children.push(block('heading_2', L.todos))
    actions.forEach((a, i) => children.push(block('to_do', [a.action, a.owner && `(${a.owner})`, a.due && `· ${a.due}`].filter(Boolean).join(' '), { checked: done.has(i) })))
  }
  if (n.decisions?.length) children.push(block('heading_2', L.decisions), ...n.decisions.map((d) => block('bulleted_list_item', d.who ? `${d.decision} (${d.who})` : d.decision)))
  if (n.missed?.length) children.push(block('heading_2', L.missed), ...n.missed.map((m) => block('bulleted_list_item', m.why ? `${m.item} — ${m.why}` : m.item)))
  if (n.open_questions?.length) children.push(block('heading_2', L.questions), ...n.open_questions.map((q) => block('bulleted_list_item', q)))
  if (n.people?.length) children.push(block('heading_2', L.people), ...n.people.map((p) => block('bulleted_list_item', [p.name, p.role].filter(Boolean).join(', '))))
  children.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `${L.open} →`, link: { url: link } } }] } })

  const people = (n.people ?? []).map((p) => p.name).filter(Boolean).join(', ') || s.client_name || ''
  const type = (n.meeting_type ?? '').replace(/,/g, ' ').trim().slice(0, 100)
  return {
    parent: { database_id: databaseId },
    properties: {
      Name: { title: text(s.title || n.headline || s.source_name || 'Recording') },
      Date: { date: { start: s.recorded_at ?? s.created_at } },
      People: { rich_text: text(people) },
      ...(type ? { Type: { select: { name: type } } } : {}),
      'Open to-dos': { number: actions.filter((_, i) => !done.has(i)).length },
      'In Juno': { url: link },
    },
    // Notion takes at most 100 blocks in one request.
    children: children.slice(0, 100),
  }
}

/** Sends one recording's notes to Notion, once. Returns the Notion page's address. */
export async function sendToNotion(email: string, s: PenSession): Promise<{ url: string; created: boolean }> {
  const prior = await supabaseAdmin.from('pen_notion_pages').select('url').eq('session_id', s.id).maybeSingle()
  if (prior.data?.url) return { url: prior.data.url, created: false }
  // Claimed first, so two triggers at once (the webhook and a click) make one page.
  const claim = await supabaseAdmin.from('pen_notion_pages').insert({ session_id: s.id, email: email.toLowerCase() })
  if (claim.error) {
    if (claim.error.code === '23505') throw new Error('Already being sent. Try again in a moment.')
    throw new Error(claim.error.message)
  }
  try {
    const { token, databaseId } = await ensureDatabase(email)
    const { userLang } = await import('./user-lang')
    const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
    const page = await notion<{ id: string; url: string }>(token, 'pages', pageFor(s, await userLang(email), databaseId, `${base}/?open=${s.id}`))
    await supabaseAdmin.from('pen_notion_pages').update({ page_id: page.id, url: page.url }).eq('session_id', s.id)
    await supabaseAdmin.from('pen_notion').update({ last_error: null }).eq('email', email.toLowerCase())
    return { url: page.url, created: true }
  } catch (e) {
    await supabaseAdmin.from('pen_notion_pages').delete().eq('session_id', s.id)
    const msg = (e as Error).message
    // Access taken away in Notion: say so in Settings rather than failing silently forever.
    if ((e as { status?: number }).status === 401) {
      await supabaseAdmin.from('pen_notion').update({ last_error: 'Notion no longer lets Juno in. Connect again in Settings → Notion.' }).eq('email', email.toLowerCase())
    } else if (msg !== NO_PAGE) {
      await supabaseAdmin.from('pen_notion').update({ last_error: msg.slice(0, 300) }).eq('email', email.toLowerCase())
    }
    throw e
  }
}

/** The recordings already in this account's Notion, and where: the note shows "Open in Notion". */
export async function sentPages(email: string): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('pen_notion_pages').select('session_id,url').eq('email', email.toLowerCase()).not('url', 'is', null)
  return Object.fromEntries((data ?? []).map((r) => [r.session_id as string, r.url as string]))
}

/** When notes are ready: to Notion as well, if they connected it and left it on. Never throws. */
export async function autoToNotion(email: string, s: PenSession | null | undefined): Promise<void> {
  if (!s || !notionConfigured()) return
  if (!s.notes || !(s.notes.summary || s.notes.actions?.length)) return
  const c = await getConnection(email).catch(() => null)
  if (!c?.auto) return
  await sendToNotion(email, s).catch((e) => console.warn(`pen notion: ${s.id} not sent: ${(e as Error).message}`))
}
