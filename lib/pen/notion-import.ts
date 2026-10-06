// "Import from Notion": the transcript of a Notion AI Meeting Note, imported as a Juno recording
// (lib/pen/import-text.ts), then Juno's own notes written from it.
//
// What Notion gives (checked on a real meeting, 5 Oct): a `meeting_notes` block (API version
// 2026-03-11; older ones are `transcription`) with a title, a status, the recording's start and
// end time, and three child blocks: Notion's summary, its notes, and the transcript. The
// transcript is plain paragraphs with no speaker labels, and Notion never hands out the audio,
// so a Notion import has no "who said what". Juno only sees pages the user shared with it.

import { supabaseAdmin } from '@/lib/supabase'
import { notionToken } from './notion'

const API = 'https://api.notion.com/v1'
// Meeting notes blocks only exist from this version on.
const VERSION = '2026-03-11'

type Block = { id: string; type: string; has_children?: boolean; last_edited_time?: string; [k: string]: unknown }
type RT = { plain_text?: string }[]

const plain = (rt: RT | undefined) => (rt ?? []).map((t) => t.plain_text ?? '').join('').trim()

async function get<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const j = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw Object.assign(new Error(j.message ?? `Notion ${path} failed (${res.status})`), { status: res.status })
  return j
}

async function children(token: string, id: string, max = 500): Promise<Block[]> {
  const out: Block[] = []
  let cursor: string | undefined
  do {
    const r = await get<{ results: Block[]; has_more: boolean; next_cursor?: string }>(token, `blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`)
    out.push(...r.results)
    cursor = r.has_more ? r.next_cursor : undefined
  } while (cursor && out.length < max)
  return out
}

const isMeeting = (b: Block) => b.type === 'meeting_notes' || b.type === 'transcription'
type MeetingBody = { title?: RT; status?: string; recording?: { start_time?: string; end_time?: string }; children?: { transcript_block_id?: string } }
const body = (b: Block) => (b[b.type] ?? {}) as MeetingBody

export type NotionMeeting = {
  id: string
  title: string
  page: string
  start: string | null
  minutes: number | null
  ready: boolean
  imported: boolean
}

/**
 * The AI Meeting Notes in the pages shared with Juno, newest first. Looks at the 40 most
 * recently edited pages, two levels down, which keeps the list to a few seconds.
 */
export async function listMeetings(email: string): Promise<NotionMeeting[]> {
  const token = await notionToken(email)
  if (!token) throw Object.assign(new Error('Notion isn’t connected.'), { status: 409 })
  const pages = await get<{ results: { id: string; object: string; in_trash?: boolean; archived?: boolean; properties?: Record<string, { title?: RT }> }[] }>(token, 'search', {
    filter: { property: 'object', value: 'page' },
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
    page_size: 40,
  })
  const found: (NotionMeeting & { block: Block })[] = []
  for (const p of pages.results) {
    if (p.in_trash || p.archived) continue
    const pageTitle = plain(Object.values(p.properties ?? {}).find((v) => v.title)?.title) || 'Untitled'
    const top = await children(token, p.id, 200).catch(() => [])
    const nested = await Promise.all(top.filter((b) => !isMeeting(b) && b.has_children && b.type !== 'child_page' && b.type !== 'child_database').slice(0, 10).map((b) => children(token, b.id, 100).catch(() => [])))
    for (const b of [...top, ...nested.flat()].filter(isMeeting)) {
      const m = body(b)
      const start = m.recording?.start_time ?? null
      const end = m.recording?.end_time ?? null
      found.push({
        id: b.id,
        block: b,
        title: plain(m.title) || pageTitle,
        page: pageTitle,
        start,
        minutes: start && end ? Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60000)) : null,
        ready: m.status === 'notes_ready' || m.status === 'summary_ready' || !m.status,
        imported: false,
      })
    }
  }
  // Already imported: the recording's storage_path remembers the Notion block it came from.
  if (found.length) {
    const { data } = await supabaseAdmin.from('pen_sessions').select('storage_path').eq('user_email', email).in('storage_path', found.map((f) => `text:notion:${f.id}`))
    const done = new Set((data ?? []).map((r) => r.storage_path as string))
    for (const f of found) f.imported = done.has(`text:notion:${f.id}`)
  }
  return found
    .map(({ block: _b, ...m }) => { void _b; return m })
    .sort((a, b) => (Date.parse(b.start ?? '') || 0) - (Date.parse(a.start ?? '') || 0))
}

/** One meeting's transcript as text, one paragraph per Notion paragraph. */
export async function readMeeting(email: string, blockId: string): Promise<{ title: string; text: string; start: string | null; seconds: number | null }> {
  const token = await notionToken(email)
  if (!token) throw Object.assign(new Error('Notion isn’t connected.'), { status: 409 })
  const b = await get<Block>(token, `blocks/${blockId}`)
  if (!isMeeting(b)) throw Object.assign(new Error('That isn’t a Notion meeting note.'), { status: 400 })
  const m = body(b)
  const tid = m.children?.transcript_block_id
  const lines = tid ? (await children(token, tid, 5000)).map((x) => plain((x[x.type] as { rich_text?: RT } | undefined)?.rich_text)).filter(Boolean) : []
  const start = m.recording?.start_time ?? null
  const end = m.recording?.end_time ?? null
  return {
    title: plain(m.title) || 'Notion meeting',
    text: lines.join('\n\n'),
    start,
    seconds: start && end ? Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000) : null,
  }
}
