// Joining recordings the pen split in half.
//
// The hardware stops at 60 minutes and opens a new file, so a long meeting arrives as two or
// three recordings with a seam in the middle. The filenames encode the start time, so whether
// two files are one meeting is arithmetic, not a guess.
//
// Why the transcripts are joined rather than the audio: byte-concatenating two Opus files was
// measured on a real pair — the duration came out exactly right (72.9 min) and 99.6% of the
// words survived, but utterances collapsed from 230 to 17 and a speaker disappeared. Chained
// Ogg decodes; the diarizer does not survive it. Joining after transcription keeps each half's
// diarization intact, at the cost that speaker A in part one is not necessarily speaker A in
// part two — which the extraction prompt is told explicitly.

import { supabaseAdmin } from '@/lib/supabase'
import type { PenSession } from './store'
import { findRuns, combinedDialogue } from './merge-detect'

export * from './merge-detect'

/** Every segment of a joined meeting, in order. */
export async function groupSessions(userEmail: string, mergeGroup: string): Promise<PenSession[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('*')
    .eq('user_email', userEmail)
    .eq('merge_group', mergeGroup)
    .order('merge_index', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as PenSession[]
}

/** Marks a run of recordings as one meeting. Order is by index, lowest carries the notes. */
export async function joinSegments(userEmail: string, ids: string[]): Promise<string> {
  if (ids.length < 2) throw new Error('need at least two recordings to join')
  const group = crypto.randomUUID()
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabaseAdmin
      .from('pen_sessions')
      .update({ merge_group: group, merge_index: i, updated_at: new Date().toISOString() })
      .eq('user_email', userEmail)
      .eq('id', ids[i])
    if (error) throw new Error(error.message)
  }
  return group
}

/** Undoes a join. The segments keep their own transcripts, so nothing has to be rebuilt. */
export async function splitGroup(userEmail: string, mergeGroup: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('pen_sessions')
    .update({ merge_group: null, merge_index: null, updated_at: new Date().toISOString() })
    .eq('user_email', userEmail)
    .eq('merge_group', mergeGroup)
  if (error) throw new Error(error.message)
}

export type AutoJoin = { group: string; segments: PenSession[] } | null

/**
 * Links a freshly transcribed recording to the one it continues, if it continues one.
 *
 * Runs from the webhook, so the common case needs no button: the pen hits its file limit, the
 * second file is uploaded alongside the first, and by the time both transcripts land they are
 * already one meeting. Order of arrival does not matter — the run is built from the start
 * times in the filenames, not from when each part happened to finish.
 *
 * Returns null unless every part of the run has a transcript. A half-joined meeting would get
 * notes written over a hole, and waiting costs nothing: the last part to finish joins them.
 */
export async function autoJoin(userEmail: string, sessionId: string): Promise<AutoJoin> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('*')
    .eq('user_email', userEmail)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)

  const all = (data ?? []) as PenSession[]
  const run = findRuns(all).find((r) => r.sessions.some((s) => s.id === sessionId))
  if (!run) return null

  const ready = run.sessions.every((s) => (s.transcript?.utterances?.length ?? 0) > 0 || !!s.transcript?.text)
  if (!ready) return null

  const group = await joinSegments(userEmail, run.sessions.map((s) => s.id))
  return { group, segments: await groupSessions(userEmail, group) }
}
