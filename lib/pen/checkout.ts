// Starting a plan checkout, in one place.
//
// Two routes start one: the signup form (the path every landing-page button takes) and the
// direct /api/pen/checkout. They used to each build the session themselves and drifted: the
// $50 recorder was charged by neither, and a change to the yearly trial landed in only one.
//
// 15 Oct prices (lib/pen/prices.ts): $9.99/month or $90/year, charged today; the $65 pen is an
// optional one-time line on either plan, and buying it makes Stripe require a shipping address;
// the given-pen link is the monthly plan with 60 days of trial and a $5 one-time line, so the
// card is charged $5 today and $9.99 a month from day 60.

import { createCheckoutSession, createCustomer, ensureFriendCoupon, priceIdFor } from './stripe'
import { planPrice, trialDaysFor, buysPen, FREE_PEN_FEE_USD, FREE_PEN_MIN_DAYS, FREE_PEN_MIN_MONTHS, type Offer, type Plan } from './plan'
import { PRICES, fmtUsd, priceKey } from './prices'
import { LOCAL_PRICES, stripeLocale, type Currency, type Lang } from './currency'

const dayFrom = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

/** Under the pay button on the free-pen checkout: the promise, with the actual date. */
function freePenMessage(usd: number): string {
  return `Your Juno pen is free and the first 30 days are free. You won't be charged until ${dayFrom(trialDaysFor('free-pen'))}, then ${fmtUsd(usd)}/month. The free pen comes with a ${FREE_PEN_MIN_MONTHS}-month minimum: if your plan ends before then, the pen is charged at $${FREE_PEN_FEE_USD}. We'll email you before your trial ends.`
}

/** Under the pay button for a pen handed over in person: $5 for two months, then monthly. */
function givenPenMessage(): string {
  const g = PRICES.givenPen
  return `${fmtUsd(g.today)} today covers your first ${g.months} months of Juno. From ${dayFrom(trialDaysFor('given-pen'))} it's ${fmtUsd(g.then)}/month and renews until you cancel, which you can do anytime in Settings, Billing. The pen is yours to keep either way. We'll email you before the first ${fmtUsd(g.then)} charge.`
}

/**
 * Where a bought pen can be posted (Stripe country codes): Chile for CLP, Brazil for BRL, and for
 * dollars the US, or PEN_SHIP_COUNTRIES="US,CA" to widen it.
 */
export function penShipCountries(cur: Currency = 'usd'): string[] {
  if (cur === 'clp') return ['CL']
  if (cur === 'brl') return ['BR']
  const list = (process.env.PEN_SHIP_COUNTRIES || 'US').split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
  return list.length ? list : ['US']
}

export type PlanCheckout = { url: string } | { error: string }

export type ShipAddress = { name: string; phone?: string | null; line1: string; line2?: string | null; city: string; state?: string | null; postcode: string; country?: string | null }

/** A Stripe customer carrying the address from our form, so checkout opens with it filled in. An
 *  address outside the countries we post to is left out (Stripe then asks for one it accepts). */
async function customerWithAddress(email: string, a: ShipAddress, allowed: string[]): Promise<string> {
  const country = (a.country ?? '').toUpperCase()
  const ok = allowed.includes(country)
  const c = await createCustomer({
    email,
    name: a.name,
    phone: a.phone ?? undefined,
    ...(ok ? { shipping: { name: a.name, phone: a.phone ?? undefined, address: { line1: a.line1, line2: a.line2 ?? undefined, city: a.city, state: a.state ?? undefined, postal_code: a.postcode, country } } } : {}),
  })
  return c.id
}

export async function startPlanCheckout(opts: {
  email: string
  plan: Plan
  /** 'posted-pen' buys the pen with the plan; 'own-recorder' is software only. */
  offer: Offer
  /** Where to send them back to: the origin the request came from. */
  origin: string
  reference?: string
  /** Chile and Brazil pay the plan and the pen in CLP/BRL. Ignored for the given and free pen. */
  currency?: Currency
  /** The language the customer signed up in: Stripe's page and every later email follow it. */
  lang?: Lang
  /**
   * Coming back after the plan ended (lib/pen/cancel.ts): charged today, no trial, no pen
   * (they kept theirs), and the Stripe customer they already have.
   */
  returning?: { customerId: string | null }
  /** A friend's referral code (lib/pen/referrals.ts), already checked as eligible. */
  referral?: string | null
  /** Where to post the pen, from the signup form: prefilled on Stripe's page. */
  shipping?: ShipAddress | null
}): Promise<PlanCheckout> {
  // The 6-month plan is no longer sold. Someone coming back from one starts monthly.
  const plan: Plan = opts.plan === 'halfyear' ? 'monthly' : opts.plan
  const price = planPrice(opts.offer, plan)
  if (!price?.price) return { error: 'That plan is not available. The pen offers come with the monthly plan only.' }

  // Chile and Brazil pay in CLP/BRL (lib/pen/prices.ts PRICES.local): the plan and the pen, at the
  // prices decided 15 Oct. The two pen offers (given, free) are dollars only.
  const cur: Currency = (opts.offer === 'own-recorder' || opts.offer === 'posted-pen') && opts.currency ? opts.currency : 'usd'
  const priceId = await priceIdFor(cur === 'usd' ? price.price : priceKey(price.price === 'yearly' ? 'yearly' : 'monthly', cur))
  // Named precisely, because the failure otherwise looks like a Stripe outage.
  if (!priceId) return { error: `Checkout isn't configured yet: no Stripe price for ${price.price} in ${cur.toUpperCase()} (run .pentest/stripe-prices.mts).` }

  // The pen, in the same currency as the plan, when they chose it. Never on a comeback (they kept theirs).
  const chargePen = buysPen(opts.offer) && !opts.returning
  const penPrice = chargePen ? await priceIdFor(priceKey('pen', cur)) : null
  if (chargePen && !penPrice) return { error: "Checkout isn't configured yet: no Stripe price for the pen (run .pentest/stripe-prices.mts)." }
  // The given pen: $5 today for the first two months (the trial), then the monthly price.
  const chargeGiven = opts.offer === 'given-pen' && !opts.returning
  const givenPrice = chargeGiven ? await priceIdFor('given') : null
  if (chargeGiven && !givenPrice) return { error: "Checkout isn't configured yet: no Stripe price for the given pen (run .pentest/stripe-prices.mts)." }

  // A referred friend's first month: $9.99 off at checkout on every plan. There's no trial left to
  // absorb it as credit, and credit would only land on the second bill. The pen keeps its price.
  const coupon = opts.referral ? await ensureFriendCoupon({ clp: LOCAL_PRICES.clp.monthly, brl: LOCAL_PRICES.brl.monthly }) : null

  const session = await createCheckoutSession({
    priceId,
    oneTimePriceIds: [penPrice, givenPrice].filter((p): p is string => !!p),
    email: opts.email,
    trialDays: opts.returning ? 0 : trialDaysFor(opts.offer, plan),
    successUrl: opts.returning ? `${opts.origin}/pen/settings/billing?back=1` : `${opts.origin}/pen?welcome=1`,
    cancelUrl: opts.returning ? `${opts.origin}/pen/settings/billing` : `${opts.origin}/pen/signup?cancelled=1`,
    reference: opts.reference,
    customerId: opts.returning?.customerId ?? (chargePen && opts.shipping ? await customerWithAddress(opts.email, opts.shipping, penShipCountries(cur)).catch(() => null) : null),
    prefilled: Boolean(chargePen && opts.shipping),
    coupon,
    shipTo: chargePen ? penShipCountries(cur) : null,
    metadata: {
      plan,
      offer: opts.offer,
      lang: opts.lang ?? 'en',
      currency: cur,
      // The webhook stores the shipping address and the owners' table lists the pen to post.
      pen: chargePen ? '1' : '0',
      ...(opts.returning ? { returning: '1' } : {}),
      ...(opts.referral ? { ref: opts.referral, friend: 'coupon' } : {}),
      // The free pen's minimum (lib/pen/plan.ts): the webhook charges the pen if the plan ends before this.
      ...(opts.offer === 'free-pen' && !opts.returning ? { pen_min_until: new Date(Date.now() + FREE_PEN_MIN_DAYS * 86_400_000).toISOString() } : {}),
    },
    locale: stripeLocale(opts.lang ?? 'en'),
    ...(opts.offer === 'free-pen' && !opts.returning ? { submitMessage: freePenMessage(price.usd) } : {}),
    ...(chargeGiven ? { submitMessage: givenPenMessage() } : {}),
  })
  return { url: session.url }
}
