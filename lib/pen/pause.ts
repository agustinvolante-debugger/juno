// Pausing instead of cancelling (agreed 27 Sep).
//
// A monthly subscriber who has paid at least once can pause for 30, 60 or 90 days. Stripe stops
// charging and restarts by itself on the date; they can also resume early. While paused they
// keep reading their recordings, notes and search, but new recordings are held (the same
// 'held' state as running out of hours) and go through when the pause ends.
// Trials just cancel; 6-month and yearly plans are prepaid, so there is nothing to pause.

import { getAccount, isPaused, isTrialing, setPausedUntil, type PenAccount } from './accounts'
import { pauseSubscription, resumeSubscription } from './stripe'

export const PAUSE_DAYS = [30, 60, 90] as const
export type PauseDays = (typeof PAUSE_DAYS)[number]

export function canPause(a: PenAccount | null): boolean {
  return (
    !!a &&
    a.status === 'active' &&
    a.plan === 'monthly' &&
    !!a.stripe_subscription_id &&
    !isTrialing(a) &&
    !isPaused(a)
  )
}

export async function pause(email: string, days: PauseDays): Promise<string> {
  const a = await getAccount(email)
  if (!canPause(a)) throw new Error('This plan can’t be paused.')
  const until = new Date(Date.now() + days * 86400000)
  const sub = await pauseSubscription(a!.stripe_subscription_id!, until)
  const iso = sub.pause_collection?.resumes_at ? new Date(sub.pause_collection.resumes_at * 1000).toISOString() : until.toISOString()
  await setPausedUntil(sub.id, iso)
  return iso
}

export async function resume(email: string): Promise<void> {
  const a = await getAccount(email)
  if (!a?.stripe_subscription_id || !isPaused(a)) return
  await resumeSubscription(a.stripe_subscription_id)
  await setPausedUntil(a.stripe_subscription_id, null)
}
