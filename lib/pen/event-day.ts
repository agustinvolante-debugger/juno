// One event, one recording.
//
// A voice-activated pen starts a new file at every pause. Carlos's conference day (30 Sep) came
// in as 34 files, 4.3 hours of audio over about 12 hours, 16 of them under a minute, and the
// 90-second join rule left them as 17 separate recordings. So there was no "the conference": no
// single list of who he met, "Ask this meeting" saw one fragment, and the email listed cards.
//
// Here the whole day becomes one joined recording, in time order whatever the gaps, and the
// conference pieces (names, conversations, stitching across files, the email) work on all of it.
// Two ways in: everything uploaded together with "This was an event" ticked (joinEventImport,
// from the pipeline), or "Combine this day into one event" on a recording page (combineDay).
// Nothing is destroyed: every file keeps its audio and transcript, and "Separate" undoes it.

import { supabaseAdmin } from '@/lib/supabase'
import { getSession, updateSession, listRunRows, type PenSession } from './store'
import { joinSegments, groupSessions, startFromName, type AutoJoin } from './merge'

/** Recordings belong to the same day when each starts within this long of the one before. */
export const DAY_GAP_MS = 3 * 3600_000
/** And the whole chain spans no more than this. */
export const DAY_SPAN_MS = 24 * 3600_000
/** Recordings uploaded within this long of each other are one import (lib/pen/batch.ts). */
const IMPORT_WINDOW_MS = 30 * 60_000
const ACTIVE = new Set(['uploaded', 'held', 'transcribing', 'transcribed', 'noting'])
/** A batch-mate stuck this long no longer holds the join back. */
const STALE_MS = 30 * 60_000

/** When a recording began: the pen's filename time, then the file's own time, then the upload. */
export function startMs(s: Pick<PenSession, 'source_name' | 'recorded_at' | 'created_at'>): number {
  return (startFromName(s.source_name) ?? new Date(s.recorded_at ?? s.created_at)).getTime()
}

const usable = (s: PenSession) => s.source_channel !== 'sample' && !String(s.storage_path ?? '').startsWith('sample')
const transcribed = (s: PenSession) => (s.transcript?.utterances?.length ?? 0) > 0 || !!s.transcript?.text?.trim()

/**
 * The recordings of the same day as `focusId`: chained outwards while each starts within 3 hours
 * of its neighbour, never wider than 24 hours. A joined meeting counts as all its files. Pure.
 */
export function dayCluster(sessions: PenSession[], focusId: string): PenSession[] {
  const list = sessions.filter(usable).sort((a, b) => startMs(a) - startMs(b))
  const at = list.findIndex((s) => s.id === focusId)
  if (at < 0) return []
  let lo = at, hi = at
  const end = (s: PenSession) => startMs(s) + (s.duration_sec ?? 0) * 1000
  while (lo > 0 && startMs(list[lo]) - end(list[lo - 1]) <= DAY_GAP_MS && end(list[hi]) - startMs(list[lo - 1]) <= DAY_SPAN_MS) lo--
  while (hi < list.length - 1 && startMs(list[hi + 1]) - end(list[hi]) <= DAY_GAP_MS && end(list[hi + 1]) - startMs(list[lo]) <= DAY_SPAN_MS) hi++
  return list.slice(lo, hi + 1)
}

/** What "Combine this day" would join, for the page to show before it does anything. */
export async function dayCandidates(email: string, sessionId: string) {
  // Times, lengths and status only: 400 whole rows with their transcripts was the heaviest read
  // in the app, for a question that never looks at a transcript.
  const rows = await listRunRows(email, 400)
  const day = dayCluster(rows, sessionId)
  const groups = new Set(day.map((s) => s.merge_group ?? s.id))
  return {
    ids: day.map((s) => s.id),
    files: day.length,
    recordings: groups.size,
    totalSec: day.reduce((t, s) => t + (s.duration_sec ?? 0), 0),
    from: day.length ? new Date(startMs(day[0])).toISOString() : null,
    to: day.length ? new Date(startMs(day[day.length - 1]) + (day[day.length - 1].duration_sec ?? 0) * 1000).toISOString() : null,
    // Ready when nothing is still processing. A file with no speech (a pen left on in a pocket)
    // is done, not waiting: it joins too, so its empty card goes away into the event.
    ready: day.every((s) => !ACTIVE.has(s.status)),
  }
}

/**
 * Joins recordings into one event recording, in time order, whatever groups they were in
 * before. Marks every file an event. Returns the files in order; the first carries the notes.
 */
export async function joinAsEvent(email: string, ids: string[]): Promise<PenSession[]> {
  const rows = (await Promise.all(ids.map((id) => getSession(email, id)))).filter((s): s is PenSession => !!s)
  if (rows.length < 2) throw new Error('nothing to combine')
  const ordered = rows.sort((a, b) => startMs(a) - startMs(b))
  const group = await joinSegments(email, ordered.map((s) => s.id))
  await supabaseAdmin.from('pen_sessions').update({ event_mode: true }).eq('user_email', email).eq('merge_group', group)
  // One briefing for the whole day: the parts may have been briefed on their own.
  await updateSession(ordered[0].id, { briefing_sent_at: null })
  return groupSessions(email, group)
}

/**
 * From the pipeline, for a recording uploaded with "This was an event" ticked: once every file
 * of that import is transcribed and written up, join them all into one event. Null while
 * batch-mates are still on their way (the last one to finish does the join), or when there is
 * nothing to join. Same shape as autoJoin, so the pipeline treats both alike.
 */
export async function joinEventImport(email: string, sessionId: string): Promise<AutoJoin> {
  const me = await getSession(email, sessionId)
  if (!me?.event_mode) return null
  const t = Date.parse(me.created_at)
  const { data, error } = await supabaseAdmin.from('pen_sessions').select('*').eq('user_email', email).eq('event_mode', true)
    .gte('created_at', new Date(t - IMPORT_WINDOW_MS).toISOString()).lte('created_at', new Date(t + IMPORT_WINDOW_MS).toISOString())
  if (error) throw new Error(error.message)
  // Uploaded around the same time AND recorded on the same stretch of the day: two events
  // uploaded within half an hour of each other stay two events.
  const uploaded = ((data ?? []) as (PenSession & { updated_at?: string })[]).filter((s) => usable(s) && s.source_channel !== 'whatsapp')
  const mates = dayCluster(uploaded, me.id)
  const now = Date.now()
  if (mates.some((s) => s.id !== me.id && ACTIVE.has(s.status) && now - Date.parse(s.updated_at ?? s.created_at) < STALE_MS)) return null
  // Every finished file, silent ones too: left out, they stayed behind as empty cards.
  const ready = mates.filter((s) => !ACTIVE.has(s.status))
  if (ready.length < 2 || !ready.some(transcribed)) return null
  // Already one event with exactly these files: nothing to do.
  const g = ready[0].merge_group
  if (g && ready.every((s) => s.merge_group === g)) {
    const all = await groupSessions(email, g)
    if (all.length === ready.length) return null
  }
  const segments = await joinAsEvent(email, ready.map((s) => s.id))
  return { group: segments[0].merge_group!, segments }
}

/** At most `n` at a time: 34 files split at once ran into the model's rate limit. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      out[k] = await fn(items[k])
    }
  }))
  return out
}

/** Other files uploaded in the same event import as this one. */
export async function hasEventMates(email: string, s: PenSession): Promise<boolean> {
  const t = Date.parse(s.created_at)
  const { count } = await supabaseAdmin.from('pen_sessions').select('id', { count: 'exact', head: true }).eq('user_email', email).eq('event_mode', true).neq('id', s.id)
    .gte('created_at', new Date(t - IMPORT_WINDOW_MS).toISOString()).lte('created_at', new Date(t + IMPORT_WINDOW_MS).toISOString())
  return (count ?? 0) > 0
}

/**
 * After "Combine this day": every file written up on its own where it never was (they are the
 * floor the combined notes stand on), the combined notes, then names and conversations for
 * every file in order. No email: the user is on the page.
 */
export async function finishEvent(email: string, primaryId: string): Promise<void> {
  const { writeNotes } = await import('./pipeline')
  const { splitEvent } = await import('./conference')
  const first = await getSession(email, primaryId)
  if (!first?.merge_group) return
  // Conversations first: they are what the user is waiting for on the page.
  await splitEvent(email, first).catch((e) => console.warn(`pen: event split ${primaryId}: ${(e as Error).message}`))
  const parts = await groupSessions(email, first.merge_group)
  await pool(parts.filter((p) => transcribed(p) && !(p.notes && Object.keys(p.notes).length)), 4, (p) =>
    writeNotes({ email, session: p, claim: false }).catch(() => null))
  const fresh = await getSession(email, primaryId)
  if (fresh) await writeNotes({ email, session: fresh, claim: false }).catch((e) => console.warn(`pen: event notes ${primaryId}: ${(e as Error).message}`))
}
