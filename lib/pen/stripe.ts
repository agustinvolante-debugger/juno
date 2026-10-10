// The smallest Stripe client that does the job.
//
// No SDK, for the same reason the webhook verifies its own signatures: this needs two calls,
// and the REST API is form-encoded POSTs. The dependency would be carrying a megabyte to save
// forty lines.

/** Stripe takes form-encoded bodies with bracket notation, so nested objects flatten. */
/** Exported so the bracket-notation flattening can be tested without a Stripe account. */
export function encode(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') out.push(...encode(item as Record<string, unknown>, `${key}[${i}]`))
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)
      })
    } else if (typeof v === 'object') {
      out.push(...encode(v as Record<string, unknown>, key))
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
    }
  }
  return out
}

async function stripe<T>(path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    // No body means a read. Every write here is a form-encoded POST.
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Pinning the version means a Stripe upgrade cannot silently reshape what we read.
      // current_period_end already moved off Subscription onto its items; see webhook.
      'Stripe-Version': '2025-03-31.basil',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: encode(body).join('&') } : {}),
  })
  const json = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json?.error?.message ?? `stripe ${path} failed (${res.status})`)
  return json
}

export type CheckoutSession = { id: string; url: string }

/**
 * A subscription checkout that takes a card now and charges nothing until the trial ends.
 *
 * `payment_method_collection: 'always'` is the entire point of this function. Stripe's default
 * happens to be 'always' today, but with a trial the total due is zero, and 'if_required'
 * would then let someone through without a card — which is precisely the outcome that makes
 * free-pen conversion 25% instead of 60%. It is set explicitly so a default change cannot
 * quietly gut the offer.
 */
export async function createCheckoutSession(opts: {
  priceId: string
  /** One-time prices charged at checkout alongside the subscription: the $50 recorder. */
  oneTimePriceIds?: string[]
  email: string
  trialDays: number
  successUrl: string
  cancelUrl: string
  /** Ties the Stripe session back to our signup row. */
  reference?: string
  metadata?: Record<string, string>
  /** Stripe's payment page language, e.g. 'es-419'. Unset: the browser's. */
  locale?: string
  /** A line under the pay button, e.g. the free-pen offer's "cancel anytime" promise. */
  submitMessage?: string
  /** A returning customer: Stripe already has them (and maybe their card). Replaces `email`. */
  customerId?: string | null
  /** A coupon applied up front (a referred friend on a prepaid plan). Stripe then refuses
   *  promotion codes on the same checkout, so they're switched off. */
  coupon?: string | null
}): Promise<CheckoutSession> {
  return stripe<CheckoutSession>('checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: opts.priceId, quantity: 1 }, ...(opts.oneTimePriceIds ?? []).map((price) => ({ price, quantity: 1 }))],
    ...(opts.customerId ? { customer: opts.customerId } : { customer_email: opts.email }),
    client_reference_id: opts.reference,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    payment_method_collection: 'always',
    ...(opts.coupon ? { discounts: [{ coupon: opts.coupon }] } : { allow_promotion_codes: true }),
    ...(opts.locale ? { locale: opts.locale } : {}),
    ...(opts.submitMessage ? { custom_text: { submit: { message: opts.submitMessage.slice(0, 1200) } } } : {}),
    subscription_data: {
      // trialDays 0 means charge now: the yearly plan, where the recorder is included and
      // shipping it before any payment would hand out free hardware to anyone who cancels.
      ...(opts.trialDays > 0
        ? {
            trial_period_days: opts.trialDays,
            // Belt and braces behind payment_method_collection: if a subscription somehow
            // reaches the end of its trial with no card, cancel it rather than leaving it
            // paused and ambiguous. An account either converts or it doesn't.
            trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
          }
        : {}),
      metadata: opts.metadata,
    },
    metadata: opts.metadata,
  })
}

/** True when checkout can be offered at all. Pages use it to say so instead of failing on click. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/**
 * A one-off payment for extra recording hours.
 *
 * The price is set here with `price_data` rather than a Price made in the dashboard, so
 * there is nothing to create in Stripe and nothing to keep in step with HOUR_USD. The hours
 * and the account email ride along in metadata: the email someone types at checkout can
 * differ from the Google account they sign in with, and the hours belong to the second one.
 */
export async function createHoursCheckout(opts: {
  email: string
  hours: number
  unitCents: number
  customerId?: string | null
  successUrl: string
  cancelUrl: string
}): Promise<CheckoutSession> {
  const metadata = { kind: 'hours', hours: String(opts.hours), email: opts.email }
  return stripe<CheckoutSession>('checkout/sessions', {
    mode: 'payment',
    line_items: [
      {
        quantity: opts.hours,
        price_data: {
          currency: 'usd',
          unit_amount: opts.unitCents,
          product_data: {
            name: 'Juno Pen recording hours',
            description: 'Extra recording time. Used after your monthly hours, and never expires.',
          },
        },
      },
    ],
    // An existing customer keeps their saved card; anyone else is matched by email.
    ...(opts.customerId ? { customer: opts.customerId } : { customer_email: opts.email }),
    client_reference_id: opts.email,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata,
    payment_intent_data: { metadata },
  })
}

export type CheckoutSessionFull = {
  id: string
  mode: string
  payment_status: string
  amount_total: number | null
  metadata: Record<string, string> | null
}

export async function getCheckoutSession(id: string): Promise<CheckoutSessionFull> {
  return stripe<CheckoutSessionFull>(`checkout/sessions/${encodeURIComponent(id)}`)
}

/**
 * A one-time link into Stripe's customer portal for someone we already know: change card,
 * see invoices, cancel (at the end of the period, so a trial cancelled now is never charged).
 * The portal's look and features are the default configuration in Stripe, made by
 * .pentest/portal-setup.sh. The link expires quickly, so it is minted on click, never emailed.
 */
export async function createPortalSession(opts: { customerId: string; returnUrl: string; locale?: string }): Promise<{ url: string }> {
  return stripe<{ url: string }>('billing_portal/sessions', {
    customer: opts.customerId,
    return_url: opts.returnUrl,
    ...(opts.locale ? { locale: opts.locale } : {}),
  })
}

/**
 * The portal's own sign-in page (Stripe emails the customer a code). Emails link here: it needs
 * no Juno session, so it still works for an account on hold after a declined card.
 */
export function portalLoginUrl(): string | null {
  return process.env.STRIPE_PORTAL_LOGIN_URL || null
}

export type Subscription = {
  id: string
  status: string
  pause_collection: { resumes_at: number | null } | null
  cancel_at?: number | null
  cancel_at_period_end?: boolean
  metadata?: Record<string, string>
  items?: { data?: { current_period_end?: number; price?: { currency?: string; unit_amount?: number | null; recurring?: { interval?: string; interval_count?: number } | null } }[] }
}

/**
 * Stops charging until `resumesAt`, then Stripe restarts the subscription by itself. `void`
 * means the invoices that fall inside the pause are voided, not saved up and billed later.
 */
export async function pauseSubscription(id: string, resumesAt: Date): Promise<Subscription> {
  return stripe<Subscription>(`subscriptions/${encodeURIComponent(id)}`, {
    pause_collection: { behavior: 'void', resumes_at: Math.floor(resumesAt.getTime() / 1000) },
  })
}

/** Ends a pause now. An empty value is how Stripe unsets pause_collection. */
export async function resumeSubscription(id: string): Promise<Subscription> {
  return stripe<Subscription>(`subscriptions/${encodeURIComponent(id)}`, { pause_collection: '' })
}

/** Stripe's own list of cancellation reasons; anything else is sent as 'other'. */
export const CANCEL_FEEDBACK = ['too_expensive', 'unused', 'missing_features', 'switched_service', 'low_quality', 'too_complex', 'other'] as const
export type CancelFeedback = (typeof CANCEL_FEEDBACK)[number]

/**
 * Cancels at the end of the period already paid for (or the trial), never now: nobody loses
 * days they paid for, and a trial cancelled today is never charged. Stripe ends the
 * subscription on that date and sends customer.subscription.deleted.
 */
export async function cancelAtPeriodEnd(id: string, feedback: CancelFeedback, comment?: string): Promise<Subscription> {
  return stripe<Subscription>(`subscriptions/${encodeURIComponent(id)}`, {
    cancel_at_period_end: true,
    cancellation_details: { feedback, ...(comment ? { comment: comment.slice(0, 500) } : {}) },
  })
}

/** Takes a scheduled cancellation back, as long as the period hasn't ended yet. */
export async function undoCancel(id: string): Promise<Subscription> {
  return stripe<Subscription>(`subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: false })
}

export async function getSubscription(id: string): Promise<Subscription> {
  return stripe<Subscription>(`subscriptions/${encodeURIComponent(id)}`)
}

/** When a scheduled cancellation takes effect, in ISO, or null when nothing is scheduled. */
export function cancelAtOf(sub: Subscription): string | null {
  const secs = sub.cancel_at ?? (sub.cancel_at_period_end ? sub.items?.data?.[0]?.current_period_end : null)
  return typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null
}

/** The email on a Stripe customer, for events that only carry the customer id. */
export async function customerEmail(id: string): Promise<string | null> {
  const c = await stripe<{ email?: string | null; deleted?: boolean }>(`customers/${encodeURIComponent(id)}`)
  return c.deleted ? null : (c.email ?? null)
}

/** One month of a subscription, in its own currency's smallest unit (cents; whole pesos for CLP). */
export function monthlyAmount(sub: Subscription): { amount: number; currency: string } | null {
  const price = sub.items?.data?.[0]?.price
  if (!price?.unit_amount || !price.currency) return null
  const r = price.recurring
  const months = r?.interval === 'year' ? 12 * (r.interval_count ?? 1) : r?.interval === 'month' ? r.interval_count ?? 1 : 1
  return { amount: Math.round(price.unit_amount / months), currency: price.currency }
}

/**
 * A change to a customer's Stripe balance. Negative is credit (taken off their next invoices,
 * never paid out); positive takes credit back. `idempotencyKey` makes a retried call return the
 * first result instead of doing it twice.
 */
async function balanceTxn(customerId: string, amount: number, currency: string, description: string, idempotencyKey: string): Promise<{ id: string }> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  const res = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}/balance_transactions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2025-03-31.basil',
      'Idempotency-Key': idempotencyKey,
    },
    body: encode({ amount, currency, description }).join('&'),
  })
  const json = (await res.json()) as { id: string; error?: { message?: string } }
  if (!res.ok) throw new Error(json?.error?.message ?? `stripe balance change failed (${res.status})`)
  return json
}

export async function addCredit(customerId: string, amount: number, currency: string, description: string, idempotencyKey: string): Promise<{ id: string }> {
  return balanceTxn(customerId, -Math.abs(amount), currency, description, idempotencyKey)
}

export async function takeBackCredit(customerId: string, amount: number, currency: string, description: string, idempotencyKey: string): Promise<{ id: string }> {
  return balanceTxn(customerId, Math.abs(amount), currency, description, idempotencyKey)
}

/** The customer's balance: negative means unused credit. */
export async function customerBalance(customerId: string): Promise<number> {
  const c = await stripe<{ balance?: number }>(`customers/${encodeURIComponent(customerId)}`)
  return c.balance ?? 0
}

/** Fingerprints of the cards saved on a customer: the same physical card has the same one everywhere. */
export async function cardFingerprints(customerId: string): Promise<string[]> {
  const r = await stripe<{ data: { card?: { fingerprint?: string } }[] }>(`customers/${encodeURIComponent(customerId)}/payment_methods?type=card&limit=20`)
  return [...new Set(r.data.map((p) => p.card?.fingerprint).filter((f): f is string => !!f))]
}

/** The customer a charge belongs to (disputes only carry the charge). */
export async function chargeCustomer(chargeId: string): Promise<string | null> {
  const c = await stripe<{ customer?: string | null }>(`charges/${encodeURIComponent(chargeId)}`)
  return c.customer ?? null
}

export const FRIEND_COUPON = 'juno-friend-month'

/**
 * The friend's month off on a prepaid plan, made in Stripe the first time it's needed (test and
 * live each get their own). A month of the monthly price in each currency checkout can charge.
 */
export async function ensureFriendCoupon(local: { clp: number; brl: number }): Promise<string> {
  try {
    await stripe(`coupons/${FRIEND_COUPON}`)
    return FRIEND_COUPON
  } catch {
    await stripe('coupons', {
      id: FRIEND_COUPON,
      name: 'First month free (invited by a friend)',
      duration: 'once',
      amount_off: 1500,
      currency: 'usd',
      currency_options: { clp: { amount_off: Math.round(local.clp) }, brl: { amount_off: Math.round(local.brl * 100) } },
    }).catch((e) => {
      // Two checkouts racing to make it: the other one won, which is fine.
      if (!/already exists/i.test((e as Error).message)) throw e
    })
    return FRIEND_COUPON
  }
}

/**
 * The free pen's minimum (lib/pen/plan.ts FREE_PEN_MIN_DAYS): a plan that ended too soon pays for
 * the pen, once. An invoice of its own on the card already on file. Keyed on the subscription,
 * so a retried webhook can't charge twice. Returns the invoice status ('paid', or 'open' when
 * the card was declined: Stripe then retries it on its usual schedule).
 */
export async function chargePenFee(opts: { customerId: string; subscriptionId: string; amountUsd: number; description: string }): Promise<{ invoice: string; status: string }> {
  const meta = { reason: 'free-pen-minimum', subscription: opts.subscriptionId }
  await stripe('invoiceitems', { customer: opts.customerId, amount: Math.round(opts.amountUsd * 100), currency: 'usd', description: opts.description, metadata: meta }, `pen-min-item-${opts.subscriptionId}`)
  const inv = await stripe<{ id: string }>(
    'invoices',
    { customer: opts.customerId, collection_method: 'charge_automatically', auto_advance: true, pending_invoice_items_behavior: 'include', description: opts.description, metadata: meta },
    `pen-min-inv-${opts.subscriptionId}`,
  )
  await stripe(`invoices/${inv.id}/finalize`, {}, `pen-min-fin-${opts.subscriptionId}`).catch(() => {})
  try {
    const paid = await stripe<{ status: string }>(`invoices/${inv.id}/pay`, {}, `pen-min-pay-${opts.subscriptionId}`)
    return { invoice: inv.id, status: paid.status }
  } catch {
    return { invoice: inv.id, status: 'open' }
  }
}
