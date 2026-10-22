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
import { listRunRows, type PenSession } from './store'
import { withDbRetry } from './db-retry'
import { findRuns, combinedDialogue } from './merge-detect'
import { separateSeams } from './join-suggest'
import { readPenSettings } from './pen-device-server'

export * from './merge-detect'

/** Every segment of a joined meeting, in order. */
export async function groupSessions(userEmail: string, mergeGroup: string): Promise<PenSession[]> {
  const { data, error } = await withDbRetry(() => supabaseAdmin
    .from('pen_sessions')
    .select('*')
    .eq('user_email', userEmail)
    .eq('merge_group', mergeGroup)
    .order('merge_index', { ascending: true }))
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
  // Start times and lengths only (22 Oct): this ran once per finished recording and used to
  // pull 200 whole rows, transcripts and all, which is what timed the database out on a
  // 14-file batch. The transcripts of the few files in the run are read below.
  const all = await listRunRows(userEmail, 200)
  // Only a file that lasted the pen's split length is continued by the next one (merge-detect
  // endsAtSplit), and never across a seam the user said is separate.
  const [splitMin, separate] = await Promise.all([
    readPenSettings(userEmail).then((r) => r.settings.splitMin).catch(() => null),
    separateSeams(userEmail).catch(() => new Set<string>()),
  ])
  const run = findRuns(all, { splitMin, separate }).find((r) => r.sessions.some((s) => s.id === sessionId))
  if (!run) return null

  const ids = run.sessions.map((s) => s.id)
  const { data: tx, error: txErr } = await withDbRetry(() => supabaseAdmin.from('pen_sessions').select('id,transcript').eq('user_email', userEmail).in('id', ids))
  if (txErr) throw new Error(txErr.message)
  const byId = new Map(((tx ?? []) as Pick<PenSession, 'id' | 'transcript'>[]).map((r) => [r.id, r.transcript]))
  const ready = ids.every((id) => { const t = byId.get(id); return (t?.utterances?.length ?? 0) > 0 || !!t?.text })
  if (!ready) return null

  const group = await joinSegments(userEmail, run.sessions.map((s) => s.id))
  return { group, segments: await groupSessions(userEmail, group) }
}
