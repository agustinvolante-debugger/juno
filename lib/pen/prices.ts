// Juno Pen prices, decided 15 Oct 2026 (founders). One place for every page that shows a price.
//
//   Software       $9.99 a month, or $90 a year paid upfront. No free trial; no 6-month plan.
//   Pen            $65 one-time, optional at checkout (with or without a subscription choice);
//                  a shipping address is required when the pen is bought.
//   Given pens     the founders hand out pens; that link charges $5 today for the first 2 months,
//                  then $9.99 a month (renews unless cancelled).
//
// Stripe prices are found by lookup_key at runtime (lib/pen/stripe.ts priceIdFor), made in test
// and live by .pentest/stripe-prices.mts. The env var next to each key is only a fallback.

export const PRICES = {
  currency: 'usd',
  monthly: 9.99,
  yearly: 90,
  pen: 65,
  givenPen: { today: 5, months: 2, then: 9.99 },
  /** Chile and Brazil, decided 15 Oct: real Stripe prices in that currency, same rules as USD.
   *  CLP has no decimals. The given-pen link stays in dollars everywhere. */
  local: {
    clp: { monthly: 9990, yearly: 89990, pen: 59990 },
    brl: { monthly: 59.9, yearly: 459, pen: 360 },
  },
} as const

export const fmtUsd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

/** The Stripe price behind each amount: lookup_key first, env fallback second. `amount` is in the
 *  currency's smallest unit (cents; whole pesos for CLP, which has no decimals). */
export const STRIPE_PRICES = {
  monthly: { lookup: 'juno_monthly_999', env: 'STRIPE_PRICE_JUNO_MONTHLY', currency: 'usd', cents: 999, recurring: 'month' },
  yearly: { lookup: 'juno_yearly_9000', env: 'STRIPE_PRICE_JUNO_YEARLY', currency: 'usd', cents: 9000, recurring: 'year' },
  pen: { lookup: 'juno_pen_6500', env: 'STRIPE_PRICE_JUNO_PEN', currency: 'usd', cents: 6500, recurring: null },
  given: { lookup: 'juno_given_500', env: 'STRIPE_PRICE_JUNO_GIVEN', currency: 'usd', cents: 500, recurring: null },
  monthly_clp: { lookup: 'juno_monthly_clp_9990', env: 'STRIPE_PRICE_JUNO_MONTHLY_CLP', currency: 'clp', cents: 9990, recurring: 'month' },
  yearly_clp: { lookup: 'juno_yearly_clp_89990', env: 'STRIPE_PRICE_JUNO_YEARLY_CLP', currency: 'clp', cents: 89990, recurring: 'year' },
  pen_clp: { lookup: 'juno_pen_clp_59990', env: 'STRIPE_PRICE_JUNO_PEN_CLP', currency: 'clp', cents: 59990, recurring: null },
  monthly_brl: { lookup: 'juno_monthly_brl_5990', env: 'STRIPE_PRICE_JUNO_MONTHLY_BRL', currency: 'brl', cents: 5990, recurring: 'month' },
  yearly_brl: { lookup: 'juno_yearly_brl_45900', env: 'STRIPE_PRICE_JUNO_YEARLY_BRL', currency: 'brl', cents: 45900, recurring: 'year' },
  pen_brl: { lookup: 'juno_pen_brl_36000', env: 'STRIPE_PRICE_JUNO_PEN_BRL', currency: 'brl', cents: 36000, recurring: null },
} as const

export type StripePriceKey = keyof typeof STRIPE_PRICES

/** Days of the given-pen trial: the "first 2 months" the $5 pays for. */
export const GIVEN_PEN_DAYS = 60

/** The price key for a plan or the pen in a currency: 'monthly' (USD), 'monthly_clp', 'pen_brl'… */
export function priceKey(item: 'monthly' | 'yearly' | 'pen', currency: 'usd' | 'clp' | 'brl'): StripePriceKey {
  return (currency === 'usd' ? item : `${item}_${currency}`) as StripePriceKey
}
