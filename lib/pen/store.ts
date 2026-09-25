import { supabaseAdmin } from '@/lib/supabase'
import type { MeetingType } from '@/lib/pen/categories'

export const BUCKET = 'pen-audio'

// `noting` is held while extraction runs, so a second caller can see the row is claimed.
// 'held' is an upload waiting for recording time: the month's hours and any bought ones are
// used up. It goes through on its own once there is time. See lib/pen/allowance.ts.
export type PenStatus = 'uploaded' | 'held' | 'transcribing' | 'transcribed' | 'noting' | 'noted' | 'error'

export type Utterance = { speaker: string; text: string; start: number; end: number }
export type Transcript = { text?: string; utterances?: Utterance[] }

export { slugType, COMMON_TYPES, isViewing, displayType } from '@/lib/pen/categories'
export type { MeetingType } from '@/lib/pen/categories'

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

/** One paragraph of the note, with provenance. Grey text means "a machine wrote this and
 *  you have not endorsed it yet" — editing a block promotes it to 'user'. */
export type NoteBlock = { id: string; text: string; source: 'user' | 'ai' }

export type Deliverable = {
  id: string
  kind: 'email' | 'memo' | 'tracker'
  title: string
  body: string
  ref: string
  ts: number
}

/** A citation ties an inline [n] marker in the answer back to a specific recording, so the
 *  UI can render it as a pill that jumps to that session. */
export type Citation = { marker: number; session_id: string; title: string; quote: string }

/** Archive-wide answer, with the recordings it drew on so every claim is traceable. */
export type ArchiveTurn = {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  /** Recordings the user tagged with @ in this question, so the chip survives a reload. */
  mentions?: Mention[]
  ts: number
}

/**
 * An @-tag. `label` is how it reads in the question ("@Recruiter…"), kept short so a long
 * title does not swamp the message; `title` is the full name the model is told.
 */
export type Mention = { id: string; title: string; label?: string; kind?: 'recording' | 'person' }

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
  note_blocks: NoteBlock[]
  transcript_edits: Record<string, string>
  deliverables: Deliverable[]
  briefing_sent_at: string | null
  user_notes: string | null
  client_name: string | null
  error_text: string | null
  recorded_at: string | null
  /** Set when the pen split one meeting across several files. Shared by every segment. */
  merge_group: string | null
  /** Position of this segment within its meeting, 0-based. The 0 carries the meeting's notes. */
  merge_index: number | null
  /** 'whatsapp' when the file came in over WhatsApp, so the briefing goes back there too. */
  source_channel?: string | null
  /** Who each speaker label is. See lib/pen/speakers.ts. */
  speaker_map?: Record<string, unknown> | null
  /** Language AssemblyAI detected, e.g. 'es'. */
  language?: string | null
  /** On-demand translation: { lang, utterances: string[] } parallel to transcript.utterances. */
  translation?: { lang: string; utterances: string[] } | null
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
  source_channel?: string | null
}) {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .insert({ ...row, status: 'uploaded' as PenStatus })
    .select('*')
    .single()
  // Plugging the pen in twice hits the dedupe index. That's success, not failure.
  if (error) {
    // 23505 = unique violation, i.e. the pen was plugged in twice. That is success, not failure.
    // Matched on recorded_at (the file's own mtime, stable) rather than `bytes`, which is the
    // size AFTER a re-encode that is not bit-identical between runs.
    if (error.code === '23505') {
      let q = supabaseAdmin
        .from('pen_sessions')
        .select('*')
        .eq('user_email', row.user_email)
        .eq('source_name', row.source_name)
      q = row.recorded_at ? q.eq('recorded_at', row.recorded_at) : q.is('recorded_at', null)
      const existing = await q.maybeSingle()
      if (existing.data) return { session: existing.data as PenSession, duplicate: true }
    }
    throw new Error(error.message)
  }
  return { session: data as PenSession, duplicate: false }
}

/**
 * Flips status from `from` to `to` only if it is still `from`, and reports whether this
 * caller won. Postgres does the compare-and-set in one statement, which is what makes it safe:
 * the browser's polling loop and the AssemblyAI webhook can both decide a transcript is ready
 * at the same moment, and without this they would both pay for extraction and both email.
 */
export async function claimStatus(id: string, from: string, to: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', from)
    .select('id')
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

export async function updateSession(id: string, patch: Record<string, unknown>) {
  const write = (body: Record<string, unknown>) =>
    supabaseAdmin
      .from('pen_sessions')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
  let { error } = await write(patch)
  // metered_at / metered_sec need an ALTER to exist. If the deploy lands before it, losing the
  // meter for a few recordings is far better than failing the transcription they belong to.
  if (error && ('metered_at' in patch || 'metered_sec' in patch) && /column .* does not exist|schema cache/i.test(error.message)) {
    const { metered_at: _a, metered_sec: _s, ...rest } = patch
    void _a
    void _s
    console.warn(`pen: pen_sessions is missing the metering columns. Run the 2026-09-23 ALTER in lib/pen/schema.sql. (${error.message})`)
    ;({ error } = await write(rest))
  }
  if (error) throw new Error(error.message)
}

/** Removes the row AND the audio object. Leaving a recording of a private conversation in
 *  the bucket after the user deleted it would be the wrong default. */
/**
 * Deletes the row FIRST, then the stored audio.
 *
 * The order matters and used to be the other way round. Both steps can fail independently,
 * so pick which wreckage you prefer: an orphaned object is wasted bytes nobody can see and a
 * sweep can reclaim, whereas a surviving row whose audio is already gone is a recording the
 * user can open, play and re-transcribe — all of which break. We saw exactly that when a
 * Supabase DELETE returned 504 after the object had gone.
 */
export async function deleteSession(userEmail: string, id: string): Promise<boolean> {
  const session = await getSession(userEmail, id)
  if (!session) return false

  // Deleting one part of a joined meeting unpicks the join first. Otherwise removing the
  // first part strands the rest: they stay flagged as continuations of a recording that no
  // longer exists, which means they never appear in the list again.
  if (session.merge_group) {
    const { error: ue } = await supabaseAdmin
      .from('pen_sessions')
      .update({ merge_group: null, merge_index: null, updated_at: new Date().toISOString() })
      .eq('user_email', userEmail)
      .eq('merge_group', session.merge_group)
    if (ue) throw new Error(ue.message)
  }

  const { error } = await supabaseAdmin
    .from('pen_sessions')
    .delete()
    .eq('user_email', userEmail)
    .eq('id', id)
  if (error) throw new Error(error.message)

  // 'aai:' paths live in AssemblyAI's storage (WhatsApp files) and 'text:' imports have no
  // audio at all; neither is in our bucket.
  if (session.storage_path && !session.storage_path.startsWith('aai:') && !session.storage_path.startsWith('text:')) {
    // Best effort, and deliberately after the row: failing here costs storage, not correctness.
    const { error: se } = await supabaseAdmin.storage.from(BUCKET).remove([session.storage_path])
    if (se) console.warn(`pen: orphaned object ${session.storage_path}: ${se.message}`)
  }
  return true
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
