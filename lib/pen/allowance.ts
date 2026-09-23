// How much recording someone has left, and whether the next one may be processed.
//
// Nothing here is a stored balance. It is recomputed from two things that already have to
// exist — the recordings we transcribed and the hours someone paid for — so there is no
// counter to drift, no decrement to race, and a refund or a correction is just editing a row.
//
// The rules, agreed 23 Sep:
//   · 12 hours a month on both plans, reset at midnight on the 1st, Pacific.
//   · Included hours are used first; bought hours only once those are gone.
//   · Bought hours never expire.
//   · A recording may start while there is ANY time left, and is always finished. Cutting a
//     meeting off half-transcribed would be worse than giving away the remainder, so whatever
//     it runs past the balance is forgiven rather than carried as debt.
//   · At zero, uploads are still accepted and kept. They wait, status 'held', until the month
//     resets or hours are bought, and then go through on their own.

import { supabaseAdmin } from '@/lib/supabase'
import { INCLUDED_HOURS, isUncapped, monthKey, nextMonthStart } from './plan'

export type Allowance = {
  /** On the uncapped list: the numbers are reported, nothing is ever held. */
  uncapped: boolean
  includedSec: number
  /** Processed this month, all of it, including anything paid for with bought hours. */
  usedThisMonthSec: number
  includedLeftSec: number
  /** Every hour ever bought. */
  boughtTotalSec: number
  boughtLeftSec: number
  /** includedLeft + boughtLeft. */
  remainingSec: number
  /** Whether a new recording would be sent for transcription right now. */
  canProcess: boolean
  /** Recordings uploaded and waiting for time. */
  heldCount: number
  resetsAt: string
}

export type MeterRow = {
  status: string
  duration_sec: number | null
  aai_id: string | null
  created_at: string
  metered_at?: string | null
  metered_sec?: number | null
}

/** True when Supabase is telling us a column or table does not exist yet. */
export function isMissingSchema(message: string): boolean {
  return /column .* does not exist|relation .* does not exist|schema cache|could not find the/i.test(message)
}

async function meterRows(email: string): Promise<MeterRow[]> {
  const base = 'status,duration_sec,aai_id,created_at'
  const res = await supabaseAdmin
    .from('pen_sessions')
    .select(`${base},metered_at,metered_sec`)
    .eq('user_email', email)
  // Deployed before the migration ran. Count the old way rather than refusing everyone.
  if (res.error && isMissingSchema(res.error.message)) {
    const old = await supabaseAdmin.from('pen_sessions').select(base).eq('user_email', email)
    if (old.error) throw new Error(old.error.message)
    return (old.data ?? []) as MeterRow[]
  }
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as MeterRow[]
}

async function purchases(email: string): Promise<{ hours: number; created_at: string }[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_hour_purchases')
    .select('hours,created_at')
    .ilike('user_email', email)
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as { hours: number; created_at: string }[]
}

/**
 * When a recording was charged, and for how long.
 *
 * `metered_at` is when it was sent for transcription, which is the moment it costs anything.
 * Upload time would be wrong for a held recording: uploaded on the 31st with nothing left and
 * processed on the 1st, it belongs to the new month. Rows from before metering existed fall
 * back to upload time and the duration we already stored.
 */
function charge(r: MeterRow): { at: number; sec: number } | null {
  if (r.status === 'held' || r.status === 'uploaded') return null
  if (r.metered_at) return { at: Date.parse(r.metered_at), sec: Math.max(0, r.metered_sec ?? r.duration_sec ?? 0) }
  if (r.aai_id) return { at: Date.parse(r.created_at), sec: Math.max(0, r.duration_sec ?? 0) }
  return null
}

export async function getAllowance(email: string, now = new Date()): Promise<Allowance> {
  const [rows, bought] = await Promise.all([meterRows(email), purchases(email)])
  return foldAllowance(email, rows, bought, now)
}

/** The arithmetic, with no database, so the rules can be checked on their own. */
export function foldAllowance(
  email: string,
  rows: MeterRow[],
  bought: { hours: number; created_at: string }[],
  now = new Date(),
): Allowance {
  const includedSec = INCLUDED_HOURS * 3600

  type Ev = { at: number; kind: 'use' | 'buy'; sec: number }
  const events: Ev[] = []
  for (const r of rows) {
    const c = charge(r)
    if (c && Number.isFinite(c.at)) events.push({ at: c.at, kind: 'use', sec: c.sec })
  }
  for (const p of bought) events.push({ at: Date.parse(p.created_at), kind: 'buy', sec: Math.max(0, p.hours) * 3600 })
  // Same instant: the purchase lands first, so hours bought for a recording pay for it.
  events.sort((a, b) => a.at - b.at || (a.kind === 'buy' ? -1 : 1))

  const current = monthKey(now)
  let month = ''
  let includedLeft = includedSec
  let boughtLeft = 0
  let usedThisMonth = 0

  for (const e of events) {
    const k = monthKey(new Date(e.at))
    if (k !== month) {
      month = k
      includedLeft = includedSec
    }
    if (e.kind === 'buy') {
      boughtLeft += e.sec
      continue
    }
    if (k === current) usedThisMonth += e.sec
    const fromIncluded = Math.min(includedLeft, e.sec)
    includedLeft -= fromIncluded
    // Clamped at zero: the part of a crossing recording beyond the balance is forgiven.
    boughtLeft = Math.max(0, boughtLeft - (e.sec - fromIncluded))
  }
  // The last event may be from an earlier month, in which case this month is untouched.
  if (month !== current) includedLeft = includedSec

  const uncapped = isUncapped(email)
  const remainingSec = includedLeft + boughtLeft
  return {
    uncapped,
    includedSec,
    usedThisMonthSec: usedThisMonth,
    includedLeftSec: includedLeft,
    boughtTotalSec: bought.reduce((n, p) => n + Math.max(0, p.hours) * 3600, 0),
    boughtLeftSec: boughtLeft,
    remainingSec,
    canProcess: uncapped || remainingSec > 0,
    heldCount: rows.filter((r) => r.status === 'held').length,
    resetsAt: nextMonthStart(now).toISOString(),
  }
}
