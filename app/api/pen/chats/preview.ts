// Chat previews for the Chats page (21 Oct): the first question and the start of Juno's latest
// answer, cut from the stored messages. Free and instant by decision: plain string work on rows
// already read, never a model call.
import type { ArchiveTurn } from '@/lib/pen/store'

export type ChatPreview = {
  id: string
  title: string | null
  updated_at: string
  turns: number
  firstQuestion: string
  lastAnswer: string
}

/** How many threads the page lists. Newest first; older ones are a scroll the page doesn't need. */
export const PREVIEW_CAP = 200
const MAX = 300

/**
 * Markdown to one line of plain text. Citation markers ([1]) are dropped: in the chat they render
 * as small numbered buttons that mean nothing out of context.
 */
export function plainText(s: string, max = MAX): string {
  const t = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[(\d+)\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_](\S[^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,.;:]$/, '')}…`
}

export function previewOf(row: { id: string; title: string | null; updated_at: string; messages: unknown }): ChatPreview {
  const msgs = (Array.isArray(row.messages) ? row.messages : []) as ArchiveTurn[]
  const first = msgs.find((m) => m?.role === 'user' && typeof m.content === 'string')
  let last: ArchiveTurn | undefined
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === 'assistant' && typeof msgs[i].content === 'string') { last = msgs[i]; break }
  }
  return {
    id: row.id,
    title: row.title,
    updated_at: row.updated_at,
    turns: msgs.length,
    firstQuestion: first ? plainText(first.content) : '',
    lastAnswer: last ? plainText(last.content) : '',
  }
}
