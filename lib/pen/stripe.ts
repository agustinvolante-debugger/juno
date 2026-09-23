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

async function stripe<T>(path: string, body?: Record<string, unknown>): Promise<T> {
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
}): Promise<CheckoutSession> {
  return stripe<CheckoutSession>('checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: opts.priceId, quantity: 1 }, ...(opts.oneTimePriceIds ?? []).map((price) => ({ price, quantity: 1 }))],
    customer_email: opts.email,
    client_reference_id: opts.reference,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    payment_method_collection: 'always',
    allow_promotion_codes: true,
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
