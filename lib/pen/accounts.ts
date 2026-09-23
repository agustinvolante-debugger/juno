// Who is allowed in, and why.
//
// Sign-in used to check a hardcoded array. That meant the funnel had no middle: someone could
// sign up, pay, and still be refused at the door, and letting them in required a code change
// and a deploy. This is the join between sign-up, payment and access.

import { supabaseAdmin } from '@/lib/supabase'

export type AccountStatus = 'pending' | 'active' | 'cancelled'

export type PenAccount = {
  id: string
  email: string
  status: AccountStatus
  plan: string | null
  source: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  /** Set while a card-on-file trial is running. In the past means they converted. */
  trial_ends_at: string | null
  /** Which offer brought them in — 'posted-pen' or 'own-recorder'. */
  offer: string | null
  activated_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export async function getAccount(email: string): Promise<PenAccount | null> {
  const { data, error } = await supabaseAdmin
    .from('pen_accounts')
    .select('*')
    .ilike('email', email)
    .maybeSingle()
  if (error) return null
  return (data as PenAccount) ?? null
}

/** True only for a paying, trialing, or hand-granted account. */
export async function isActive(email: string): Promise<boolean> {
  return (await getAccount(email))?.status === 'active'
}

/** In a trial right now — access is the same, but they have not paid us anything yet. */
export function isTrialing(a: PenAccount | null): boolean {
  return !!a && a.status === 'active' && !!a.trial_ends_at && new Date(a.trial_ends_at) > new Date()
}

/** Created at sign-up, before any money has changed hands. */
export async function createPending(email: string, source: string): Promise<void> {
  const existing = await getAccount(email)
  if (existing) return // never downgrade someone who already paid
  const { error } = await supabaseAdmin
    .from('pen_accounts')
    .insert({ email: email.toLowerCase(), status: 'pending', source })
  // 23505 means a concurrent signup won the race, which is fine.
  if (error && error.code !== '23505') throw new Error(error.message)
}

/**
 * Turns a payment into access.
 *
 * Upserts rather than updates: Stripe is allowed to be the first thing that knows about an
 * email. Someone can pay from a link without ever filling the form in, and refusing them
 * because we have no prior row would be the same bug in a new place.
 */
export async function activate(opts: {
  email: string
  plan?: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  offer?: string | null
}): Promise<void> {
  const email = opts.email.toLowerCase()
  const patch = {
    email,
    status: 'active' as const,
    plan: opts.plan ?? 'pen',
    stripe_customer_id: opts.stripeCustomerId ?? null,
    stripe_subscription_id: opts.stripeSubscriptionId ?? null,
    current_period_end: opts.currentPeriodEnd ?? null,
    activated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const existing = await getAccount(email)
  // Only write the trial fields when Stripe actually told us about them. A later event that
  // omits them must not erase the record of how this customer arrived.
  const extras = {
    ...(opts.trialEndsAt !== undefined ? { trial_ends_at: opts.trialEndsAt } : {}),
    ...(opts.offer ? { offer: opts.offer } : {}),
  }
  Object.assign(patch, extras)
  const { error } = existing
    ? await supabaseAdmin.from('pen_accounts').update(patch).eq('id', existing.id)
    : await supabaseAdmin.from('pen_accounts').insert({ ...patch, source: 'stripe' })
  if (error) throw new Error(error.message)
}

/** Subscription ended. The row stays so the history and the recordings survive. */
export async function deactivate(stripeSubscriptionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('pen_accounts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', stripeSubscriptionId)
  if (error) throw new Error(error.message)
}
