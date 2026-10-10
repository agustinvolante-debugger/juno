// Cancelling from inside the app, not just Stripe's portal (agreed 2 Oct).
//
// Cancelling schedules the end for the close of the period already paid for (or the trial),
// so nobody loses days and a trial is never charged. Until then nothing changes. After it the
// account is read-only (lib/pen/access.ts). Both ways back are one click: before the date,
// "Keep my plan" takes the cancellation back; after it, Reactivate opens a checkout with no
// trial and no pen charge (they have the pen already).

import { penFeeDue } from './plan'
import { getAccount, isPaused, setCancelAt, setPausedUntil, type PenAccount } from './accounts'
import { cancelAtOf, cancelAtPeriodEnd, getSubscription, resumeSubscription, undoCancel, CANCEL_FEEDBACK, type CancelFeedback } from './stripe'
import { isReadOnly } from './access'
import { sendCancelScheduled } from './cancel-mail'
import { startPlanCheckout } from './checkout'
import { parseOffer, parsePlan } from './plan'
import { parseCurrency } from './currency'
import { userLang } from './user-lang'

export function parseFeedback(v: unknown): CancelFeedback {
  return (CANCEL_FEEDBACK as readonly string[]).includes(String(v)) ? (v as CancelFeedback) : 'other'
}

/** Running, billed through Stripe, and not already on its way out. */
export function canCancel(a: PenAccount | null): boolean {
  return !!a && a.status === 'active' && !!a.stripe_subscription_id && !a.cancel_at
}

export async function cancel(email: string, feedback: CancelFeedback, comment?: string): Promise<string> {
  const a = await getAccount(email)
  if (!canCancel(a)) throw new Error('There is no running plan to cancel.')
  const subId = a!.stripe_subscription_id!
  // A paused plan has no charges to stop; end the pause so the period end is a real date.
  if (isPaused(a)) {
    await resumeSubscription(subId)
    await setPausedUntil(subId, null)
  }
  const sub = await cancelAtPeriodEnd(subId, feedback, comment)
  const at = cancelAtOf(sub) ?? a!.current_period_end ?? a!.trial_ends_at
  if (!at) throw new Error('Stripe did not say when the plan ends.')
  // The webhook records the same thing a moment later; whichever is first sends the email.
  if (await setCancelAt(subId, at, comment ? `${feedback}: ${comment}`.slice(0, 500) : feedback)) {
    await sendCancelScheduled(email, at, a!.offer, penFeeDue(sub.metadata, at)).catch((e) => console.warn(`pen cancel email failed: ${(e as Error).message}`))
  }
  return at
}

/** Before the end date: take the cancellation back. Nothing is charged until the normal date. */
export async function keep(email: string): Promise<void> {
  const a = await getAccount(email)
  if (!a?.stripe_subscription_id || a.status !== 'active' || !a.cancel_at) return
  await undoCancel(a.stripe_subscription_id)
  await setCancelAt(a.stripe_subscription_id, null)
}

/**
 * After the end date: a checkout for the same plan, charged today, no trial, no pen. Returns
 * the URL to send them to. Same currency as before when the old subscription says so.
 */
export async function reactivateCheckout(email: string, origin: string): Promise<string> {
  const a = await getAccount(email)
  if (!a || !isReadOnly(a, email)) throw new Error('Your plan is still running.')
  let currency = parseCurrency('usd')
  if (a.stripe_subscription_id) {
    const old = await getSubscription(a.stripe_subscription_id).catch(() => null)
    currency = parseCurrency(old?.items?.data?.[0]?.price?.currency)
  }
  const r = await startPlanCheckout({
    email,
    plan: parsePlan(a.plan),
    offer: parseOffer(a.offer),
    origin,
    currency,
    lang: await userLang(email),
    returning: { customerId: a.stripe_customer_id },
  })
  if ('error' in r) throw new Error(r.error)
  return r.url
}
