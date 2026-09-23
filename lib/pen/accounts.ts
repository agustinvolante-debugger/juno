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
    // Plan follows the same rule: 'monthly' or 'annual' when Stripe says, never overwritten
    // by a later event that does not. A brand-new row with no plan yet gets 'pen'.
    ...(opts.plan ? { plan: opts.plan } : existing ? {} : { plan: 'pen' }),
    ...(opts.trialEndsAt !== undefined ? { trial_ends_at: opts.trialEndsAt } : {}),
    ...(opts.offer ? { offer: opts.offer } : {}),
  }

  const write = async (body: Record<string, unknown>) =>
    existing
      ? await supabaseAdmin.from('pen_accounts').update(body).eq('id', existing.id)
      : await supabaseAdmin.from('pen_accounts').insert({ ...body, source: 'stripe' })

  let { error } = await write({ ...patch, ...extras })

  // trial_ends_at and offer arrived with the card-on-file trial and need an ALTER to exist.
  // If the deploy lands before the migration, the write fails, the webhook returns 500, and
  // Stripe retries forever while a paying customer sits locked out. Access matters more than
  // the two columns that describe how they got here, so drop them and write the rest.
  if (error && /column .* does not exist|schema cache/i.test(error.message)) {
    console.warn(`pen: pen_accounts is missing trial_ends_at/offer, activating without them. Run the ALTER in lib/pen/schema.sql. (${error.message})`)
    ;({ error } = await write(patch))
  }
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
