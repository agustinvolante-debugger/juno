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

async function stripe<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Pinning the version means a Stripe upgrade cannot silently reshape what we read.
      // current_period_end already moved off Subscription onto its items; see webhook.
      'Stripe-Version': '2025-03-31.basil',
    },
    body: encode(body).join('&'),
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
    line_items: [{ price: opts.priceId, quantity: 1 }],
    customer_email: opts.email,
    client_reference_id: opts.reference,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    payment_method_collection: 'always',
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: opts.trialDays,
      // Belt and braces behind payment_method_collection: if a subscription somehow reaches
      // the end of its trial with no card, cancel it rather than leaving it paused and
      // ambiguous. An account either converts or it doesn't.
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      metadata: opts.metadata,
    },
    metadata: opts.metadata,
  })
}
