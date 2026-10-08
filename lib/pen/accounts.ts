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
  /** Set while a monthly subscription is paused (Stripe pause_collection.resumes_at). */
  paused_until?: string | null
  /** Cancelled, effective then: full access until this moment, read-only after (lib/pen/access.ts). */
  cancel_at?: string | null
  /** When the subscription actually ended. Read-only from here; deleted KEEP_DAYS later. */
  ended_at?: string | null
  /** Why they cancelled, from the in-app menu. */
  cancel_reason?: string | null
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
}): Promise<boolean> {
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
    // Coming back after the plan ended: no longer read-only, nothing scheduled to end.
    ...(existing && existing.status !== 'active' ? { cancel_at: null, ended_at: null } : {}),
  }

  // Stripe sends checkout.session.completed and customer.subscription.created within moments of
  // each other, in either order. Whichever flips the row to active first "claims" the signup, and
  // only that one returns true, so the welcome and the owners' email go out exactly once.
  let claimed = false
  const write = async (body: Record<string, unknown>) => {
    if (!existing) {
      const r = await supabaseAdmin.from('pen_accounts').insert({ ...body, source: 'stripe' })
      if (!r.error) claimed = true
      return r
    }
    if (existing.status !== 'active') {
      const r = await supabaseAdmin.from('pen_accounts').update(body).eq('id', existing.id).neq('status', 'active').select('id')
      if (r.error) return r
      if (r.data?.length) {
        claimed = true
        return r
      }
    }
    return await supabaseAdmin.from('pen_accounts').update(body).eq('id', existing.id)
  }

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
  return claimed
}

/**
 * Subscription ended. The row stays so the history and the recordings survive, read-only
 * (lib/pen/access.ts). True only for the event that closed it, so the "your account is now
 * read-only" email goes out once however often Stripe retries.
 */
export async function deactivate(stripeSubscriptionId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const r = await supabaseAdmin
    .from('pen_accounts')
    .update({ status: 'cancelled', ended_at: now, updated_at: now })
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .neq('status', 'cancelled')
    .select('id')
  if (!r.error) return Boolean(r.data?.length)
  if (!/column .* does not exist|schema cache/i.test(r.error.message)) throw new Error(r.error.message)
  // Deployed before the ALTER: close the account anyway; the end date falls back to updated_at.
  const { error } = await supabaseAdmin
    .from('pen_accounts')
    .update({ status: 'cancelled', updated_at: now })
    .eq('stripe_subscription_id', stripeSubscriptionId)
  if (error) throw new Error(error.message)
  return false
}

/**
 * Records a cancellation at period end (or its undoing, with null). True only when this call
 * is the one that scheduled it, so the confirmation email goes out once. Tolerates the
 * column not existing yet, like setPausedUntil.
 */
export async function setCancelAt(stripeSubscriptionId: string, at: string | null, reason?: string | null): Promise<boolean> {
  const missing = (m: string) => /column .* does not exist|schema cache/i.test(m)
  const stamp = { updated_at: new Date().toISOString() }
  if (!at) {
    const { error } = await supabaseAdmin.from('pen_accounts').update({ cancel_at: null, ...stamp }).eq('stripe_subscription_id', stripeSubscriptionId).not('cancel_at', 'is', null)
    if (error && !missing(error.message)) throw new Error(error.message)
    return false
  }
  const extra = reason ? { cancel_reason: reason } : {}
  const first = await supabaseAdmin
    .from('pen_accounts')
    .update({ cancel_at: at, ...extra, ...stamp })
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .is('cancel_at', null)
    .select('id')
  if (first.error) {
    if (missing(first.error.message)) return false
    throw new Error(first.error.message)
  }
  if (first.data?.length) return true
  // Already scheduled: keep the date honest (a plan change can move it) without re-announcing.
  const { error } = await supabaseAdmin.from('pen_accounts').update({ cancel_at: at, ...extra }).eq('stripe_subscription_id', stripeSubscriptionId)
  if (error && !missing(error.message)) throw new Error(error.message)
  return false
}

/** Paused right now. A date in the past means the pause is over, whatever the webhook did. */
export function isPaused(a: PenAccount | null, now = new Date()): boolean {
  return !!a?.paused_until && new Date(a.paused_until) > now
}

/**
 * Records a pause (or its end) against the account. Keyed by subscription, because Stripe's
 * subscription events carry no email. Tolerates the column not existing yet: a pause that
 * isn't recorded here still stops the charges in Stripe, it just doesn't hold uploads.
 */
export async function setPausedUntil(stripeSubscriptionId: string, until: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from('pen_accounts')
    .update({ paused_until: until, updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', stripeSubscriptionId)
  if (error && !/column .* does not exist|schema cache/i.test(error.message)) throw new Error(error.message)
}

/**
 * The account a Stripe subscription event is about. Subscription objects carry no email, so
 * without this renewals and plan changes never reached activate() and the stored period end
 * and trial end froze at signup. Matched on subscription first, then customer.
 */
export async function getAccountByStripe(subscriptionId: string | null, customerId: string | null): Promise<PenAccount | null> {
  for (const [col, v] of [['stripe_subscription_id', subscriptionId], ['stripe_customer_id', customerId]] as const) {
    if (!v) continue
    const { data } = await supabaseAdmin.from('pen_accounts').select('*').eq(col, v).limit(1).maybeSingle()
    if (data) return data as PenAccount
  }
  return null
}

/**
 * Records when someone signs in ('login', every Google or email-link sign-in) or opens the Pen
 * app ('seen', at most every 10 minutes). Shown on /pen/customers as "Last seen". Best effort:
 * a failure here must never block sign-in or the app, and people with no account row are skipped.
 */
export async function noteSeen(email: string, kind: 'login' | 'seen'): Promise<void> {
  const e = email.trim().toLowerCase()
  if (!e) return
  const now = new Date()
  try {
    if (kind === 'login') {
      await supabaseAdmin.from('pen_accounts').update({ last_login_at: now.toISOString(), last_seen_at: now.toISOString() }).eq('email', e)
    } else {
      const stale = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
      await supabaseAdmin.from('pen_accounts').update({ last_seen_at: now.toISOString() }).eq('email', e)
        .or(`last_seen_at.is.null,last_seen_at.lt.${stale}`)
    }
  } catch { /* columns not added yet, or the database is down: never block */ }
}
