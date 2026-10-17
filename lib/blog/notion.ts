// The blog's Notion source: one internal integration reading one database ("Juno Blog").
//
// Separate from lib/pen/notion.ts on purpose. That file is per-user OAuth (a customer's own
// workspace); this one is a single token the founders own, shared with a single database, and it
// only ever reads.
//
// Database schema (property names are matched case-insensitively; only Title is required):
//   Title           title          the post's headline
//   Slug            text           optional; otherwise made from the title
//   Status          status|select  only "Published" appears on the site
//   Type            select         "Post" (default) or "Update" (goes to What's new)
//   Date            date           publish date; a future date means scheduled
//   Summary         text           one or two sentences for the list, RSS and search results
//   Author          select|text|person   e.g. "Chris Dyas", "Agustin Volante"
//   Cover           files          optional cover image (the page's own Notion cover also works)
//   Tags            multi-select
//   SEO title       text           optional override for the browser tab / Google
//   SEO description text           optional override for the search snippet
//
// Notion file URLs are signed and expire after about an hour, so image and cover URLs are
// rewritten to /api/blog/media/<id>, which fetches a fresh one on request (see that route).
//
// API version 2022-06-28 keeps /databases/{id}/query (newer versions moved querying to data
// sources); it is still supported and is what lib/pen/notion.ts uses.

import type { Block, Post, PostType, PostWithBlocks, RichText } from './types'

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'
/** Seconds a Notion response is reused before the next visitor triggers a refresh. */
export const BLOG_REVALIDATE = 120
export const BLOG_TAG = 'blog'

export function notionBlogConfigured(): boolean {
  return Boolean(process.env.NOTION_BLOG_TOKEN && process.env.NOTION_BLOG_DATABASE_ID)
}

type Init = { method?: string; body?: unknown; fresh?: boolean }

export async function notionFetch<T>(path: string, init: Init = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${process.env.NOTION_BLOG_TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    // Content reads are cached and tagged (revalidated every BLOG_REVALIDATE seconds, or at once
    // through /api/blog/revalidate). The media route asks for a fresh signed URL every time.
    ...(init.fresh ? { cache: 'no-store' as const } : { next: { revalidate: BLOG_REVALIDATE, tags: [BLOG_TAG] } }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Notion ${res.status} on ${path}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

/* --------------------------------------------------------------------- properties */

type NProp = { type: string; [k: string]: unknown }
type NPage = {
  id: string
  created_time: string
  last_edited_time: string
  archived?: boolean
  in_trash?: boolean
  cover?: { type: 'file' | 'external'; file?: { url: string }; external?: { url: string } } | null
  properties: Record<string, NProp>
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function prop(page: NPage, ...names: string[]): NProp | undefined {
  const wanted = names.map(norm)
  for (const [k, v] of Object.entries(page.properties)) if (wanted.includes(norm(k))) return v
  return undefined
}

function plain(rt: unknown): string {
  return Array.isArray(rt) ? rt.map((r: { plain_text?: string }) => r.plain_text ?? '').join('') : ''
}

/** Text out of any property type a non-developer might reasonably pick. */
function text(p: NProp | undefined): string {
  if (!p) return ''
  const v = p[p.type] as unknown
  switch (p.type) {
    case 'title':
    case 'rich_text':
      return plain(v).trim()
    case 'select':
    case 'status':
      return ((v as { name?: string } | null)?.name ?? '').trim()
    case 'multi_select':
      return ((v as { name: string }[]) ?? []).map((o) => o.name).join(', ')
    case 'people':
      return ((v as { name?: string }[]) ?? []).map((o) => o.name ?? '').filter(Boolean).join(', ')
    case 'url':
    case 'email':
      return (v as string | null) ?? ''
    case 'formula': {
      const f = v as { type: string; string?: string; number?: number }
      return f?.type === 'string' ? f.string ?? '' : f?.number != null ? String(f.number) : ''
    }
    default:
      return ''
  }
}

function tags(p: NProp | undefined): string[] {
  if (!p) return []
  if (p.type === 'multi_select') return ((p.multi_select as { name: string }[]) ?? []).map((o) => o.name)
  const t = text(p)
  return t ? t.split(',').map((s) => s.trim()).filter(Boolean) : []
}

function dateOf(page: NPage): string {
  const p = prop(page, 'Date', 'Published', 'Publish date', 'Published at')
  if (p?.type === 'date') {
    const start = (p.date as { start?: string } | null)?.start
    if (start) return start
  }
  return page.created_time
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post'
}

/** A versioned media URL: the version changes whenever the page or block is edited. */
export function mediaUrl(id: string, version: string, kind?: 'cover'): string {
  const v = encodeURIComponent(version.replace(/[^0-9TZ]/g, ''))
  return `/api/blog/media/${id}?${kind ? `kind=${kind}&` : ''}v=${v}`
}

function coverOf(page: NPage): string | null {
  const p = prop(page, 'Cover', 'Cover image', 'Image')
  if (p?.type === 'files') {
    const f = (p.files as { type: string; external?: { url: string } }[])?.[0]
    if (f?.type === 'external' && f.external?.url) return f.external.url
    if (f) return mediaUrl(page.id, page.last_edited_time, 'cover')
  }
  if (page.cover?.type === 'external' && page.cover.external?.url) return page.cover.external.url
  if (page.cover?.type === 'file') return mediaUrl(page.id, page.last_edited_time, 'cover')
  return null
}

function toPost(page: NPage): Post | null {
  const title = text(prop(page, 'Title', 'Name'))
  if (!title) return null
  const typeRaw = norm(text(prop(page, 'Type', 'Kind')))
  const type: PostType = typeRaw.startsWith('update') || typeRaw === 'changelog' || typeRaw === 'whatsnew' ? 'update' : 'post'
  return {
    id: page.id,
    slug: slugify(text(prop(page, 'Slug', 'URL slug')) || title),
    title,
    type,
    date: dateOf(page),
    summary: text(prop(page, 'Summary', 'Excerpt', 'Description')),
    author: text(prop(page, 'Author', 'Authors', 'By')) || 'The Juno team',
    tags: tags(prop(page, 'Tags', 'Tag', 'Topics')),
    cover: coverOf(page),
    seoTitle: text(prop(page, 'SEO title', 'Meta title')) || null,
    seoDescription: text(prop(page, 'SEO description', 'Meta description')) || null,
    lastEdited: page.last_edited_time,
  }
}

function isPublished(page: NPage): boolean {
  if (page.archived || page.in_trash) return false
  return norm(text(prop(page, 'Status', 'State'))) === 'published'
}

/** Every published entry (posts and updates), newest first. Scheduled (future-dated) ones wait. */
export async function notionEntries(): Promise<Post[]> {
  const db = process.env.NOTION_BLOG_DATABASE_ID!
  const pages: NPage[] = []
  let cursor: string | undefined
  // A blog database is small; the loop is bounded anyway so a bad cursor can never spin.
  for (let i = 0; i < 20; i++) {
    const res = await notionFetch<{ results: NPage[]; has_more: boolean; next_cursor: string | null }>(
      `/databases/${db}/query`,
      { body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) } },
    )
    pages.push(...res.results)
    if (!res.has_more || !res.next_cursor) break
    cursor = res.next_cursor
  }
  const now = Date.now()
  const posts = pages
    .filter(isPublished)
    .map(toPost)
    .filter((p): p is Post => p !== null && new Date(p.date).getTime() <= now)
    .sort((a, b) => b.date.localeCompare(a.date))
  // Two pages with the same slug: the older one gets a short suffix so both stay reachable.
  const seen = new Set<string>()
  for (const p of [...posts].reverse()) {
    if (seen.has(p.slug)) p.slug = `${p.slug}-${p.id.replace(/-/g, '').slice(0, 6)}`
    seen.add(p.slug)
  }
  return posts
}

/* ------------------------------------------------------------------------- blocks */

type NBlock = { id: string; type: string; has_children: boolean; last_edited_time: string; [k: string]: unknown }

/** Blocks whose children we fetch and render. Anything else with children is shown flat. */
const NESTS = new Set(['bulleted_list_item', 'numbered_list_item', 'toggle', 'quote', 'callout', 'to_do', 'column_list', 'column', 'synced_block'])

async function children(id: string, depth: number): Promise<Block[]> {
  const raw: NBlock[] = []
  let cursor: string | undefined
  for (let i = 0; i < 20; i++) {
    const res = await notionFetch<{ results: NBlock[]; has_more: boolean; next_cursor: string | null }>(
      `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
    )
    raw.push(...res.results)
    if (!res.has_more || !res.next_cursor) break
    cursor = res.next_cursor
  }
  return Promise.all(raw.map((b) => toBlock(b, depth)))
}

async function toBlock(b: NBlock, depth: number): Promise<Block> {
  const payload = (b[b.type] ?? {}) as Record<string, unknown>
  const data: Block['data'] = {
    rich_text: payload.rich_text as RichText[] | undefined,
    caption: payload.caption as RichText[] | undefined,
    language: payload.language as string | undefined,
    checked: payload.checked as boolean | undefined,
    color: payload.color as string | undefined,
    icon: (payload.icon as { type: string; emoji?: string } | undefined)?.type === 'emoji'
      ? { type: 'emoji', emoji: (payload.icon as { emoji: string }).emoji }
      : null,
  }
  // Media: an uploaded file becomes our versioned media route; an external link stays as it is.
  if (['image', 'video', 'file', 'pdf', 'audio'].includes(b.type)) {
    const kind = payload.type as string
    data.url = kind === 'external'
      ? (payload.external as { url: string }).url
      : mediaUrl(b.id, b.last_edited_time)
  }
  if (b.type === 'embed' || b.type === 'bookmark' || b.type === 'link_preview') data.url = payload.url as string
  const block: Block = { id: b.id, type: b.type, data }
  if (b.has_children && NESTS.has(b.type) && depth < 4) block.children = await children(b.id, depth + 1)
  return block
}

export async function notionPostBlocks(post: Post): Promise<PostWithBlocks> {
  return { ...post, blocks: await children(post.id, 0) }
}

/* -------------------------------------------------------------------------- media */

/** A fresh signed URL for a block's file, or for a page's cover. Never cached. */
export async function freshMediaUrl(id: string, kind: 'block' | 'cover'): Promise<string | null> {
  if (kind === 'cover') {
    const page = await notionFetch<NPage>(`/pages/${id}`, { fresh: true })
    // Only pages that live in the blog database: the token could in principle see others.
    const parent = (page as unknown as { parent?: { database_id?: string } }).parent?.database_id ?? ''
    if (norm(parent) !== norm(process.env.NOTION_BLOG_DATABASE_ID ?? '')) return null
    const p = prop(page, 'Cover', 'Cover image', 'Image')
    if (p?.type === 'files') {
      const f = (p.files as { type: string; file?: { url: string }; external?: { url: string } }[])?.[0]
      const u = f?.file?.url ?? f?.external?.url
      if (u) return u
    }
    return page.cover?.file?.url ?? page.cover?.external?.url ?? null
  }
  const b = await notionFetch<NBlock>(`/blocks/${id}`, { fresh: true })
  const payload = (b[b.type] ?? {}) as { type?: string; file?: { url: string }; external?: { url: string } }
  return payload.file?.url ?? payload.external?.url ?? null
}
