import { supabaseAdmin } from '@/lib/supabase'

export const BUCKET = 'pen-audio'

export type PenStatus = 'uploaded' | 'transcribing' | 'transcribed' | 'noted' | 'error'

export type Utterance = { speaker: string; text: string; start: number; end: number }
export type Transcript = { text?: string; utterances?: Utterance[] }

export type MeetingType = 'showing' | 'clinical' | 'generic'

export type Person = { name: string; role: string; speaker: string; note: string }
export type Decision = { decision: string; who: string }
export type Action = { action: string; owner: string; due: string; priority: 'high' | 'normal' | 'low' }
export type Missed = { item: string; why: string }

/** Universal fields apply to every meeting; `showing` only appears for property viewings. */
export type PenNotes = {
  meeting_type?: MeetingType
  headline?: string
  summary?: string
  people?: Person[]
  decisions?: Decision[]
  actions?: Action[]
  open_questions?: string[]
  missed?: Missed[]
  showing?: {
    reactions?: { feature: string; who: string; sentiment: 'loved' | 'liked' | 'neutral' | 'disliked'; quote?: string }[]
    objections?: { objection: string; who: string; quote?: string }[]
    signals?: { signal: string; strength: 'strong' | 'medium' | 'weak'; quote?: string }[]
    revealed_criteria?: string[]
  }
  client_name?: string
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string; ts: number }

export type PenSession = {
  id: string
  user_email: string
  title: string | null
  status: PenStatus
  storage_path: string
  source_name: string | null
  mime: string | null
  duration_sec: number | null
  bytes: number | null
  consent: boolean
  aai_id: string | null
  transcript: Transcript
  notes: PenNotes
  meeting_type: MeetingType | null
  chat: ChatTurn[]
  action_done: number[]
  user_notes: string | null
  client_name: string | null
  error_text: string | null
  recorded_at: string | null
  created_at: string
  updated_at: string
}

/** Signed URL the browser PUTs the compressed audio to. Never proxied through us. */
export async function createUploadUrl(userEmail: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `${userEmail}/${Date.now()}-${safe}`
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) throw new Error(`signed upload url: ${error.message}`)
  return { path, token: data.token, signedUrl: data.signedUrl }
}

/** A URL AssemblyAI can fetch the audio from. Short-lived on purpose. */
export async function createReadUrl(path: string, expiresInSec = 60 * 60 * 4) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, expiresInSec)
  if (error) throw new Error(`signed read url: ${error.message}`)
  return data.signedUrl
}

export async function listSessions(userEmail: string, limit = 100): Promise<PenSession[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('*')
    .eq('user_email', userEmail)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as PenSession[]
}

export async function getSession(userEmail: string, id: string): Promise<PenSession | null> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('*')
    .eq('user_email', userEmail)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PenSession) ?? null
}

export async function getSessionByAai(aaiId: string): Promise<PenSession | null> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('*')
    .eq('aai_id', aaiId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PenSession) ?? null
}

export async function createSession(row: {
  user_email: string
  storage_path: string
  source_name: string
  mime: string
  bytes: number
  duration_sec?: number | null
  recorded_at?: string | null
  consent: boolean
  title?: string | null
  client_name?: string | null
}) {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .insert({ ...row, status: 'uploaded' as PenStatus })
    .select('*')
    .single()
  // Plugging the pen in twice hits the dedupe index. That's success, not failure.
  if (error) {
    if (error.code === '23505') {
      const existing = await supabaseAdmin
        .from('pen_sessions')
        .select('*')
        .eq('user_email', row.user_email)
        .eq('source_name', row.source_name)
        .eq('bytes', row.bytes)
        .maybeSingle()
      if (existing.data) return { session: existing.data as PenSession, duplicate: true }
    }
    throw new Error(error.message)
  }
  return { session: data as PenSession, duplicate: false }
}

export async function updateSession(id: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('pen_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function upsertClientProfile(userEmail: string, name: string, profile: unknown, bumpShowing = true) {
  const { data: existing } = await supabaseAdmin
    .from('pen_clients')
    .select('showings')
    .eq('user_email', userEmail)
    .eq('name', name)
    .maybeSingle()
  const showings = (existing?.showings ?? 0) + (bumpShowing ? 1 : 0)
  const { error } = await supabaseAdmin
    .from('pen_clients')
    .upsert(
      { user_email: userEmail, name, profile, showings, updated_at: new Date().toISOString() },
      { onConflict: 'user_email,name' },
    )
  if (error) throw new Error(error.message)
}

export async function getClientProfile(userEmail: string, name: string) {
  const { data } = await supabaseAdmin
    .from('pen_clients')
    .select('*')
    .eq('user_email', userEmail)
    .eq('name', name)
    .maybeSingle()
  return data
}
