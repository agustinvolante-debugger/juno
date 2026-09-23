// Starting a plan checkout, in one place.
//
// Two routes start one: the signup form (the path every landing-page button takes) and the
// direct /api/pen/checkout. They used to each build the session themselves and drifted: the
// $50 recorder was charged by neither, and a change to the yearly trial landed in only one.

import { createCheckoutSession } from './stripe'
import { trialDaysFor, type Offer, type Plan } from './plan'

export type PlanCheckout = { url: string } | { error: string }

export async function startPlanCheckout(opts: {
  email: string
  plan: Plan
  offer: Offer
  /** Where to send them back to: the origin the request came from. */
  origin: string
  reference?: string
}): Promise<PlanCheckout> {
  const priceId = opts.plan === 'annual' ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY
  // Named precisely, because the failure otherwise looks like a Stripe outage.
  if (!priceId) return { error: `Checkout isn't configured yet — STRIPE_PRICE_${opts.plan.toUpperCase()} is not set.` }

  // The recorder is $50 on the monthly plan and included in the yearly one. Someone who
  // brings their own recorder pays for no pen at all.
  const chargePen = opts.plan === 'monthly' && opts.offer === 'posted-pen'
  const penPrice = process.env.STRIPE_PRICE_PEN
  if (chargePen && !penPrice) return { error: "Checkout isn't configured yet — STRIPE_PRICE_PEN is not set." }

  const session = await createCheckoutSession({
    priceId,
    oneTimePriceIds: chargePen && penPrice ? [penPrice] : [],
    email: opts.email,
    trialDays: trialDaysFor(opts.offer, opts.plan),
    successUrl: `${opts.origin}/pen?welcome=1`,
    cancelUrl: `${opts.origin}/pen/signup?cancelled=1`,
    reference: opts.reference,
    metadata: { plan: opts.plan, offer: opts.offer },
  })
  return { url: session.url }
}
