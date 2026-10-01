// Starting a plan checkout, in one place.
//
// Two routes start one: the signup form (the path every landing-page button takes) and the
// direct /api/pen/checkout. They used to each build the session themselves and drifted: the
// $50 recorder was charged by neither, and a change to the yearly trial landed in only one.

import { createCheckoutSession } from './stripe'
import { planPrice, trialDaysFor, type Offer, type Plan } from './plan'
import { stripeLocale, type Currency, type Lang } from './currency'

/** Under the pay button on the free-pen checkout: the promise, with the actual date. */
function freePenMessage(usd: number): string {
  const end = new Date(Date.now() + trialDaysFor('free-pen') * 86_400_000)
  const day = end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return `Your Juno pen is free and the first 30 days are free. You won't be charged until ${day}, then $${usd}/month. Cancel anytime before then and you pay nothing. We'll email you before your trial ends.`
}

export type PlanCheckout = { url: string } | { error: string }

export async function startPlanCheckout(opts: {
  email: string
  plan: Plan
  offer: Offer
  /** Where to send them back to: the origin the request came from. */
  origin: string
  reference?: string
  /** Chile and Brazil pay software-only plans in CLP/BRL. Ignored for pen plans. */
  currency?: Currency
  /** The language the customer signed up in: Stripe's page and every later email follow it. */
  lang?: Lang
}): Promise<PlanCheckout> {
  const price = planPrice(opts.offer, opts.plan)
  if (!price) return { error: 'That plan is not available. Software only comes monthly or every 6 months.' }
  // Local prices exist only for software-only plans (STRIPE_PRICE_SOFTWARE_MONTHLY_CLP etc).
  // If one is missing, charge the dollar price rather than fail the signup.
  const cur: Currency = opts.offer === 'own-recorder' && opts.currency && opts.currency !== 'usd' ? opts.currency : 'usd'
  const localEnv = cur === 'usd' ? null : `${price.env}_${cur.toUpperCase()}`
  const priceId = (localEnv && process.env[localEnv]) || process.env[price.env]
  const charged: Currency = localEnv && process.env[localEnv] ? cur : 'usd'
  // Named precisely, because the failure otherwise looks like a Stripe outage.
  if (!priceId) return { error: `Checkout isn't configured yet: ${price.env} is not set.` }

  // The recorder is $50 on the monthly pen plan and included in the 6-month and yearly ones.
  // Software only pays for no pen at all.
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
    metadata: { plan: opts.plan, offer: opts.offer, lang: opts.lang ?? 'en', currency: charged },
    locale: stripeLocale(opts.lang ?? 'en'),
    ...(opts.offer === 'free-pen' ? { submitMessage: freePenMessage(price.usd) } : {}),
  })
  return { url: session.url }
}
