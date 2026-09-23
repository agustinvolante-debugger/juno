// Bought recording hours. One row per completed checkout.
//
// Keyed on the Stripe Checkout Session id, which is what makes recording a purchase safe to
// do twice: the webhook and the success-page confirmation both try, and whichever lands
// second hits the unique index and changes nothing.

import { supabaseAdmin } from '@/lib/supabase'
import { isMissingSchema } from './allowance'

export type HourPurchase = {
  id: string
  user_email: string
  hours: number
  amount_cents: number
  stripe_session_id: string
  created_at: string
}

/** Returns true when this call recorded it, false when it was already recorded. */
export async function recordPurchase(p: {
  email: string
  hours: number
  amountCents: number
  stripeSessionId: string
}): Promise<boolean> {
  const { error } = await supabaseAdmin.from('pen_hour_purchases').insert({
    user_email: p.email.toLowerCase(),
    hours: p.hours,
    amount_cents: p.amountCents,
    stripe_session_id: p.stripeSessionId,
  })
  if (!error) return true
  if (error.code === '23505') return false
  // Throwing makes the Stripe webhook answer 500, so Stripe retries until the table exists.
  // Someone who paid must not be silently dropped.
  if (isMissingSchema(error.message)) {
    throw new Error('pen_hour_purchases does not exist yet. Run the 2026-09-23 migration in lib/pen/schema.sql.')
  }
  throw new Error(error.message)
}

export async function listPurchases(email: string): Promise<HourPurchase[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_hour_purchases')
    .select('*')
    .ilike('user_email', email)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as HourPurchase[]
}

/**
 * Turns a completed hours checkout into hours, then lets anything waiting on them through.
 *
 * Called from two places on purpose: the Stripe webhook, which is the reliable path, and the
 * success page, which is the fast one (and the only one on localhost, where Stripe cannot
 * reach the webhook). Either can run first; the unique index makes the second a no-op.
 */
export async function settleHoursCheckout(o: {
  id: string
  payment_status?: string
  amount_total?: number | null
  metadata?: Record<string, string> | null
}): Promise<{ email: string; hours: number; recorded: boolean; resumed: number } | null> {
  const m = o.metadata ?? {}
  if (m.kind !== 'hours') return null
  // A delayed payment method completes the session before the money arrives.
  if (o.payment_status !== 'paid') return null
  const hours = Math.floor(Number(m.hours))
  const email = (m.email ?? '').toLowerCase()
  if (!email || !Number.isFinite(hours) || hours < 1) throw new Error(`hours checkout ${o.id} is missing its metadata`)

  const recorded = await recordPurchase({
    email,
    hours,
    amountCents: o.amount_total ?? 0,
    stripeSessionId: o.id,
  })
  // Held recordings go through now rather than on the next visit to the app.
  const { resumeHeld } = await import('./transcribe')
  const resumed = recorded ? (await resumeHeld(email).catch(() => ({ started: 0 }))).started : 0
  return { email, hours, recorded, resumed }
}
