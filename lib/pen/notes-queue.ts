// Write-ups that wait their turn, and write-ups that get a second try.
//
// 22 Oct, Chris: 14 pen files uploaded at once became ~10 notes pipelines running together
// (transcript saves, the model, names, suggestions, calendar matching, join checks), and the
// database answered two of them with statement timeouts. Both got the failure email, though
// nothing was wrong with the recordings. Two rules since:
//
//  1. At most NOTES_CAP write-ups run at once per user. Over the cap, a recording stays
//     'transcribed' and waits; whichever write-up finishes next starts it (kickQueue), and the
//     15-minute recovery tick (/api/pen/recover, sweepQueued) picks up anything left behind.
//  2. A write-up that fails on a passing error (db-retry isTransientError) is put back to
//     'transcribed' and tried again up to MAX_NOTE_RETRIES times over ~30 minutes. The
//     failure email goes only after the last try. Any other failure is reported at once, as
//     before.
//
// Retry bookkeeping lives in pen_sessions.notes_attempts / notes_retry_at (schema.sql,
// 2026-10-22). Until that ALTER runs, the count is kept in error_text as "[retry n/3] …".

import { supabaseAdmin } from '@/lib/supabase'
import { isTransientError, withDbRetry } from './db-retry'

/** pipeline.ts STATUS_WORKING, repeated here so the two modules don't import each other. */
const STATUS_WORKING = 'noting'

/** Write-ups running at once for one user. */
export const NOTES_CAP = Math.max(1, Math.min(5, Number(process.env.PEN_NOTES_CAP) || 2))
/** Tries after the first failure, before the failure email. */
export const MAX_NOTE_RETRIES = 3
/** Wait before retry n (1-based): 5, 10, 15 min, so the last try is ~30 min after the first failure. */
export const RETRY_GAPS_MS = [5 * 60_000, 10 * 60_000, 15 * 60_000]
/** A 'noting' row older than this was cut off (function timeout); it no longer holds a slot. */
export const STALE_WORKING_MS = 15 * 60_000
/** Attempts older than this don't count: a recording back in the queue weeks later starts fresh. */
const ATTEMPT_MEMORY_MS = 3 * 3600_000
/** How long a 'transcribed' row has to sit before the tick takes it (the webhook's own run is
 *  usually already on it). The drain after a finished write-up waits less. Tests set both to 0. */
export const queueTiming = { tickMinAgeMs: 60_000, drainMinAgeMs: 15_000 }
/** Only the last day: older stuck rows are for a person to look at (the health alert). */
const QUEUE_WINDOW_MS = 24 * 3600_000

const RETRY_TAG = /^\[retry (\d+)\/\d+\]\s*/

const isMissingCol = (m: string) => /column .* does not exist|schema cache|could not find/i.test(m)

/** Thrown by the pipeline when a write-up failed transiently and another try is scheduled. */
export class RetryLater extends Error {
  constructor(readonly attempt: number, readonly at: string, cause: unknown) {
    super(`notes will be tried again (${attempt}/${MAX_NOTE_RETRIES}): ${(cause as Error)?.message ?? String(cause)}`)
  }
}

export type RetryFields = { id: string; error_text?: string | null; notes_attempts?: number | null; notes_retry_at?: string | null; updated_at?: string | null }

/** How many retries this recording has had, from the column or the error_text tag. */
export function attemptsSoFar(s: RetryFields, now = Date.now()): number {
  if (typeof s.notes_attempts === 'number' && s.notes_attempts > 0) {
    const at = s.notes_retry_at ? Date.parse(s.notes_retry_at) : NaN
    if (Number.isFinite(at) && now - at > ATTEMPT_MEMORY_MS) return 0
    return s.notes_attempts
  }
  const m = RETRY_TAG.exec(s.error_text ?? '')
  return m ? Number(m[1]) : 0
}

/** The reason without the retry tag, for the failure email and the recording page. */
export function plainReason(text: string): string {
  return text.replace(RETRY_TAG, '').replace(/^notes will be tried again \(\d+\/\d+\):\s*/, '')
}

/** When a scheduled retry is due (ms), or null when the row isn't waiting on one. */
export function retryDueAt(s: RetryFields): number | null {
  if (typeof s.notes_attempts === 'number' && s.notes_attempts > 0 && s.notes_retry_at) {
    const at = Date.parse(s.notes_retry_at)
    return Number.isFinite(at) ? at : null
  }
  const m = RETRY_TAG.exec(s.error_text ?? '')
  if (!m) return null
  const n = Number(m[1])
  return Date.parse(s.updated_at ?? '') + RETRY_GAPS_MS[Math.min(n, RETRY_GAPS_MS.length) - 1]
}

/**
 * After a failed write-up: schedule another try if the error was passing and tries are left.
 * 'scheduled' = the row is 'transcribed' again with the count; 'final' = report it as before.
 */
export async function scheduleRetry(s: RetryFields, error: unknown, now = Date.now()): Promise<{ state: 'scheduled'; attempt: number; at: string } | { state: 'final' }> {
  if (!isTransientError(error)) return { state: 'final' }
  const attempt = attemptsSoFar(s, now) + 1
  if (attempt > MAX_NOTE_RETRIES) return { state: 'final' }
  const at = new Date(now + RETRY_GAPS_MS[attempt - 1]).toISOString()
  const reason = plainReason((error as Error)?.message ?? String(error))
  const stamp = new Date(now).toISOString()
  // Never over finished notes: only a row still on its way goes back to the queue.
  const write = (patch: Record<string, unknown>) =>
    withDbRetry(() => supabaseAdmin.from('pen_sessions').update({ ...patch, status: 'transcribed', updated_at: stamp }).eq('id', s.id).in('status', [STATUS_WORKING, 'transcribed', 'error']))
  let { error: e } = await write({ notes_attempts: attempt, notes_retry_at: at, error_text: null })
  if (e && isMissingCol(e.message)) ({ error: e } = await write({ error_text: `[retry ${attempt}/${MAX_NOTE_RETRIES}] ${reason}`.slice(0, 1000) }))
  if (e) {
    console.warn(`pen: retry not scheduled for ${s.id}: ${e.message}`)
    return { state: 'final' }
  }
  return { state: 'scheduled', attempt, at }
}

/** Write-ups this user has running now (fresh 'noting' rows). */
export async function workingCount(email: string, now = Date.now()): Promise<number> {
  const { count, error } = await withDbRetry(() =>
    supabaseAdmin.from('pen_sessions').select('id', { count: 'exact', head: true })
      .eq('user_email', email).eq('status', STATUS_WORKING).gt('updated_at', new Date(now - STALE_WORKING_MS).toISOString()))
  // Can't tell: let it run rather than strand it (the claim still stops duplicates).
  if (error) return 0
  return count ?? 0
}

export async function hasSlot(email: string): Promise<boolean> {
  return (await workingCount(email)) < NOTES_CAP
}

/**
 * Right after winning the claim: is this one of the NOTES_CAP oldest running write-ups? Two
 * write-ups that checked hasSlot at the same moment both claim; the later one gives way here.
 */
export async function keepsSlot(email: string, id: string, now = Date.now()): Promise<boolean> {
  const { data, error } = await withDbRetry(() =>
    supabaseAdmin.from('pen_sessions').select('id,updated_at')
      .eq('user_email', email).eq('status', STATUS_WORKING).gt('updated_at', new Date(now - STALE_WORKING_MS).toISOString())
      .order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(NOTES_CAP))
  if (error) return true
  const rows = (data ?? []) as { id: string }[]
  return rows.length < NOTES_CAP || rows.some((r) => r.id === id)
}

/** Gives a claim back: the row waits in the queue as 'transcribed'. */
export async function releaseClaim(id: string): Promise<void> {
  await withDbRetry(() => supabaseAdmin.from('pen_sessions').update({ status: 'transcribed', updated_at: new Date().toISOString() }).eq('id', id).eq('status', STATUS_WORKING))
}

export type QueuedRow = RetryFields & { user_email: string; created_at: string; updated_at: string; merge_index?: number | null }

/** Is this 'transcribed' row ready to be written up now? */
export function isReady(r: QueuedRow, now: number, minAgeMs: number): boolean {
  const due = retryDueAt(r)
  if (due != null) return due <= now
  // Some other error left on a 'transcribed' row ("no transcript yet"): not ours to loop on.
  if (r.error_text) return false
  return now - Date.parse(r.updated_at) >= minAgeMs
}

/**
 * Recordings waiting for a write-up, oldest first: 'transcribed', no notes yet, the first part
 * of a meeting, from the last day, and due (a retry's time has come, a queued one has sat a
 * moment). Light columns only.
 */
export async function pickQueued(opts: { email?: string; limit: number; minAgeMs: number; now?: number }): Promise<QueuedRow[]> {
  const now = opts.now ?? Date.now()
  const base = 'id,user_email,created_at,updated_at,error_text,merge_index'
  const build = (cols: string) => {
    let q = supabaseAdmin.from('pen_sessions').select(cols)
      .eq('status', 'transcribed')
      .gt('created_at', new Date(now - QUEUE_WINDOW_MS).toISOString())
      .or('merge_index.is.null,merge_index.eq.0')
      .is('notes->>summary', null)
    if (opts.email) q = q.eq('user_email', opts.email)
    return q.order('created_at', { ascending: true }).limit(100)
  }
  let res = await withDbRetry(() => build(`${base},notes_attempts,notes_retry_at`))
  if (res.error && isMissingCol(res.error.message)) res = await withDbRetry(() => build(base))
  if (res.error) throw new Error(res.error.message)
  return ((res.data ?? []) as unknown as QueuedRow[]).filter((r) => isReady(r, now, opts.minAgeMs)).slice(0, opts.limit)
}

/** Starts as many of this user's waiting write-ups as there are free slots. Returns how many. */
export async function drainUser(email: string, opts: { minAgeMs?: number } = {}): Promise<number> {
  const free = NOTES_CAP - (await workingCount(email))
  if (free <= 0) return 0
  const rows = await pickQueued({ email, limit: free, minAgeMs: opts.minAgeMs ?? queueTiming.drainMinAgeMs })
  if (!rows.length) return 0
  const { runUnattended } = await import('./unattended')
  await Promise.all(rows.map((r) => runUnattended(r.id, email).catch((e) => console.warn(`pen queue: ${r.id}: ${(e as Error).message}`))))
  return rows.length
}

/**
 * The tick (every 15 minutes, /api/pen/recover): every user with something waiting, each up to
 * their free slots, at most `maxUsers` users per run.
 */
export async function sweepQueued(opts: { maxUsers?: number } = {}): Promise<{ users: number; started: number }> {
  const rows = await pickQueued({ limit: 100, minAgeMs: queueTiming.tickMinAgeMs })
  const users = [...new Set(rows.map((r) => r.user_email))].slice(0, opts.maxUsers ?? 10)
  const started = await Promise.all(users.map((u) => drainUser(u, { minAgeMs: queueTiming.tickMinAgeMs }).catch(() => 0)))
  return { users: users.length, started: started.reduce((a, b) => a + b, 0) }
}

/** Where a running function can reach the app itself: the local server in dev, the site in prod. */
function selfBase(): string {
  return (process.env.PEN_INTERNAL_URL || process.env.NEXTAUTH_URL || process.env.PEN_PUBLIC_URL || '').replace(/\/$/, '')
}

/**
 * A write-up just finished (or gave way): start the next ones for this user. In its own function
 * (the recovery route, ?user=), so this one's time budget isn't spent on the queue; without a
 * URL and secret to reach it, here and now instead. Never throws.
 */
export async function kickQueue(email: string): Promise<void> {
  const base = selfBase()
  const secret = process.env.PEN_HEALTH_SECRET
  if (base && secret && process.env.PEN_QUEUE_INLINE !== '1') {
    await fetch(`${base}/api/pen/recover?user=${encodeURIComponent(email)}`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(1500),
    }).catch(() => {})
    return
  }
  await drainUser(email).catch((e) => console.warn(`pen queue: drain ${email}: ${(e as Error).message}`))
}
