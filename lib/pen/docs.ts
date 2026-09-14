// Pages — the artifacts a chat produced. A summary or a prep doc that only exists inside a
// chat transcript is lost the moment you scroll; a page is a thing you can open, edit, and
// bring to the meeting.
import { supabaseAdmin } from '@/lib/supabase'

export type DocKind = 'summary' | 'prep' | 'checklist' | 'note'

export type PenDoc = {
  id: string
  user_email: string
  chat_id: string | null
  kind: DocKind
  title: string
  body: string
  source_ids: string[]
  created_at: string
  updated_at: string
}

export type DocSummary = { id: string; kind: DocKind; title: string; updated_at: string }

export async function listDocs(userEmail: string, limit = 60): Promise<DocSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_docs')
    .select('id,kind,title,updated_at')
    .eq('user_email', userEmail)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as DocSummary[]
}

export async function getDoc(userEmail: string, id: string): Promise<PenDoc | null> {
  const { data, error } = await supabaseAdmin
    .from('pen_docs')
    .select('*')
    .eq('user_email', userEmail)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PenDoc) ?? null
}

export async function createDoc(
  userEmail: string,
  d: { chat_id?: string | null; kind: DocKind; title: string; body: string; source_ids?: string[] },
): Promise<PenDoc> {
  const { data, error } = await supabaseAdmin
    .from('pen_docs')
    .insert({
      user_email: userEmail,
      chat_id: d.chat_id ?? null,
      kind: d.kind,
      title: d.title,
      body: d.body,
      source_ids: d.source_ids ?? [],
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as PenDoc
}

export async function updateDoc(userEmail: string, id: string, patch: { title?: string; body?: string }) {
  const { data, error } = await supabaseAdmin
    .from('pen_docs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_email', userEmail)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as PenDoc
}

export async function deleteDoc(userEmail: string, id: string) {
  const { error } = await supabaseAdmin.from('pen_docs').delete().eq('user_email', userEmail).eq('id', id)
  if (error) throw new Error(error.message)
}
