// Chat threads. The archive conversation used to be a single running list per user, which
// meant asking a new question destroyed the last one. Threads are cheap and the alternative
// loses work, so search now creates one and the sidebar keeps them.
import { supabaseAdmin } from '@/lib/supabase'
import type { ArchiveTurn } from './store'

export type PenChat = {
  id: string
  user_email: string
  title: string | null
  messages: ArchiveTurn[]
  created_at: string
  updated_at: string
}

/** Sidebar rows. Messages are omitted — a list of forty threads shouldn't ship every turn. */
export type ChatSummary = { id: string; title: string | null; updated_at: string; turns: number }

/**
 * A thread's name is its first question, trimmed at a word boundary. Naming it with another
 * model call would be a second round trip before the user sees anything, for a label they can
 * rename in one click.
 */
export function titleFromQuestion(q: string): string {
  const clean = q.trim().replace(/\s+/g, ' ')
  if (clean.length <= 48) return clean
  const cut = clean.slice(0, 48)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > 24 ? cut.slice(0, sp) : cut).replace(/[,.;:]$/, '')}…`
}

export async function listChats(userEmail: string, limit = 60): Promise<ChatSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_chats')
    .select('id,title,updated_at,messages')
    .eq('user_email', userEmail)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string | null,
    updated_at: r.updated_at as string,
    turns: Array.isArray(r.messages) ? (r.messages as unknown[]).length : 0,
  }))
}

export async function getChat(userEmail: string, id: string): Promise<PenChat | null> {
  const { data, error } = await supabaseAdmin
    .from('pen_chats')
    .select('*')
    .eq('user_email', userEmail)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PenChat) ?? null
}

export async function createChat(userEmail: string, title: string): Promise<PenChat> {
  const { data, error } = await supabaseAdmin
    .from('pen_chats')
    .insert({ user_email: userEmail, title, messages: [] })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as PenChat
}

/** Keeps the last 40 turns. Long threads stay usable; the prompt stays bounded. */
export async function setMessages(userEmail: string, id: string, messages: ArchiveTurn[]) {
  const { data, error } = await supabaseAdmin
    .from('pen_chats')
    .update({ messages: messages.slice(-40), updated_at: new Date().toISOString() })
    .eq('user_email', userEmail)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as PenChat
}

export async function renameChat(userEmail: string, id: string, title: string) {
  const { error } = await supabaseAdmin
    .from('pen_chats')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('user_email', userEmail)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteChat(userEmail: string, id: string) {
  const { error } = await supabaseAdmin.from('pen_chats').delete().eq('user_email', userEmail).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * One-time carry-over from the old single-thread table, run when a user has no threads yet.
 * Losing someone's existing conversation to a schema change is not an acceptable upgrade,
 * and this is cheaper than a migration script nobody remembers to run.
 */
export async function adoptLegacyChat(userEmail: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('pen_chats')
    .select('id')
    .eq('user_email', userEmail)
    .limit(1)
  if (existing?.length) return

  const { data: legacy } = await supabaseAdmin
    .from('pen_archive_chat')
    .select('messages')
    .eq('user_email', userEmail)
    .maybeSingle()
  const msgs = (legacy?.messages ?? []) as ArchiveTurn[]
  if (!Array.isArray(msgs) || msgs.length === 0) return

  const first = msgs.find((m) => m.role === 'user')?.content ?? 'Earlier conversation'
  await supabaseAdmin
    .from('pen_chats')
    .insert({ user_email: userEmail, title: titleFromQuestion(first), messages: msgs.slice(-40) })
}
