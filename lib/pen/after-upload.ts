// The message after an upload (21 Oct): ONE WhatsApp / iMessage message per recording with its
// title, a 2–3 sentence summary, "Your to-dos" (the user's own open ones from it, at most 5, with
// due dates when set) and then the offers (lib/pen/suggestions.ts renderOffers). Used free-form
// only: inside the WhatsApp 24-hour window, on iMessage, and as the answer to the notes_ready
// template's Summary button. Outside the window the notes_ready template goes as before.
//
// No model call: the summary is the one the notes pipeline already wrote, cut to 3 sentences.
// Recordings sent from WhatsApp already got the full briefing in the chat (bot.ts
// sendWhatsAppBriefing), and imports (Granola, Notion, pasted transcripts) aren't uploads: those
// get the offers alone, as before (`full: false`).
//
// Pure composition first (tests: .pentest/proactive-unit.mts), the reads at the bottom.

import type { Lang } from './currency'
import { isMine, type ActionMeta } from './todo-labels'

export const MAX_TODOS = 5
const MAX_SUMMARY_SENTENCES = 3
const MAX_SUMMARY_CHARS = 480

export type UploadTodo = { action: string; due: string | null }
export type UploadNote = { title: string; summary: string; todos: UploadTodo[]; moreTodos: number }

type SessionLike = {
  title?: string | null
  source_name?: string | null
  notes?: { summary?: string; actions?: { action: string }[] } | null
  action_meta?: ActionMeta[] | null
  action_done?: number[] | null
}

const COPY: Record<Lang, { todos: string; due: (d: string) => string; more: (n: number) => string; untitled: string }> = {
  en: { todos: 'Your to-dos', due: (d) => `by ${d}`, more: (n) => `+${n} more in Juno`, untitled: 'Your recording' },
  es: { todos: 'Tus pendientes', due: (d) => `para el ${d}`, more: (n) => `+${n} más en Juno`, untitled: 'Tu grabación' },
  pt: { todos: 'Suas tarefas', due: (d) => `até ${d}`, more: (n) => `+${n} no Juno`, untitled: 'Sua gravação' },
}

const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-CL', pt: 'pt-BR' }

/** WhatsApp formatting characters out, so a title can't break the bold around it. */
const plain = (s: string) => s.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim()
const noDot = (s: string) => s.trim().replace(/[.。]+$/, '')

/** At most 3 sentences and ~480 characters of the notes' summary, whole sentences where it can. */
export function shortSummary(summary: string | null | undefined): string {
  const s = (summary ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  const sentences = s.match(/[^.!?。]+[.!?。]+["”’)]*\s*|[^.!?。]+$/g) ?? [s]
  let out = ''
  for (const x of sentences.slice(0, MAX_SUMMARY_SENTENCES)) {
    if (out && (out + x).trim().length > MAX_SUMMARY_CHARS) break
    out += x
  }
  out = out.trim()
  if (out.length > MAX_SUMMARY_CHARS) out = `${out.slice(0, MAX_SUMMARY_CHARS - 1).replace(/\s+\S*$/, '')}…`
  return out
}

/** "2026-10-23" → "Oct 23" / "23 oct" / "23 de out.". Null for anything else. */
export function dueLabel(date: string | null | undefined, lang: Lang): string | null {
  if (!date || !/^\d{4}-\d\d-\d\d$/.test(date)) return null
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(LOCALE[lang], { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

/** The recording as the message needs it: title, short summary, the user's open to-dos. Pure. */
export function uploadNote(s: SessionLike, lang: Lang): UploadNote {
  const acts = s.notes?.actions ?? []
  const meta = Array.isArray(s.action_meta) && s.action_meta.length === acts.length ? s.action_meta : null
  const done = new Set(Array.isArray(s.action_done) ? s.action_done : [])
  const mine = acts
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => !done.has(i) && isMine(meta?.[i]) && plain(a.action ?? ''))
    .map(({ a, i }) => ({ action: noDot(plain(a.action)), due: meta?.[i]?.due_date ?? null }))
  // Dated ones first (soonest first), then the rest in the notes' order.
  const sorted = [...mine.filter((t) => t.due).sort((x, y) => x.due!.localeCompare(y.due!)), ...mine.filter((t) => !t.due)]
  return {
    title: plain(s.title || s.source_name || '') || COPY[lang].untitled,
    summary: shortSummary(s.notes?.summary),
    todos: sorted.slice(0, MAX_TODOS),
    moreTodos: Math.max(0, sorted.length - MAX_TODOS),
  }
}

/** Is there anything to say besides offers? */
export function hasContent(n: UploadNote): boolean {
  return !!n.summary || n.todos.length > 0
}

/**
 * The message: *title*, summary, *Your to-dos* (bullets, due dates), then the offers text as
 * renderOffers wrote it WITHOUT its own "From …" header. Pure. Blocks separated by a blank line.
 */
export function composeAfterUpload(n: UploadNote, offers: string | null, lang: Lang): string {
  const C = COPY[lang]
  const blocks: string[] = []
  blocks.push([`*${n.title}*`, n.summary].filter(Boolean).join('\n'))
  if (n.todos.length) {
    const lines = n.todos.map((t) => {
      const d = dueLabel(t.due, lang)
      return `• ${t.action}${d ? ` (${C.due(d)})` : ''}`
    })
    if (n.moreTodos) lines.push(C.more(n.moreTodos))
    blocks.push([`*${C.todos}*`, ...lines].join('\n'))
  }
  if (offers?.trim()) blocks.push(offers.trim())
  return blocks.join('\n\n')
}

/* ------------------------------------------------------------------ reads */

/**
 * One recording's message, read and composed. `full` false = the offers alone (WhatsApp-sent
 * recordings, imports). `offers` = the numbering (bundle) for renderOffers. Null = nothing to say.
 * Writes nothing: the caller marks the offers offered once the message has really gone out.
 */
export async function afterUploadMessage(
  email: string,
  sessionId: string,
  lang: Lang,
  o: { bundle?: { from: number; footer: boolean } } = {},
): Promise<{ text: string; full: boolean; ids: string[]; offered: { id: string; no: number }[] } | null> {
  const { getSession } = await import('./store')
  const { renderOffers } = await import('./suggestions')
  const s = await getSession(email, sessionId)
  if (!s) return null
  const full = isUpload(s)
  const r = await renderOffers(email, sessionId, lang, o.bundle, { head: !full }).catch(() => null)
  const note = uploadNote(s, lang)
  if (!full || !hasContent(note)) return r ? { text: r.text, full: false, ids: r.ids, offered: r.offered } : null
  return { text: composeAfterUpload(note, r?.text ?? null, lang), full: true, ids: r?.ids ?? [], offered: r?.offered ?? [] }
}

/** An upload from the web or the phone (no channel), not a WhatsApp recording, an import or the sample. */
export function isUpload(s: { source_channel?: string | null; storage_path?: string | null }): boolean {
  return !s.source_channel && !String(s.storage_path ?? '').startsWith('sample') && !String(s.storage_path ?? '').startsWith('text:')
}
