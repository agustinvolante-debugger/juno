// Juno Pen prices, decided 15 Oct 2026 (founders). One place for every page that shows a price;
// Stripe price ids live in env (STRIPE_PRICE_*), see lib/pen/checkout.ts.
//
//   Software       $9.99 a month, or $90 a year paid upfront. No free trial; no 6-month plan.
//   Pen            $65 one-time, optional at checkout (with or without a subscription choice);
//                  a shipping address is required when the pen is bought.
//   Given pens     the founders hand out pens; that link charges $5 today for the first 2 months,
//                  then $9.99 a month (renews unless cancelled).
//   Local          Chile CLP 9.990 / 89.990 a year / pen 59.990; Brazil R$ 59,90 / R$ 459 / pen R$ 360.

export const PRICES = {
  currency: 'usd',
  monthly: 9.99,
  yearly: 90,
  pen: 65,
  givenPen: { today: 5, months: 2, then: 9.99 },
  /** Local prices, decided 15 Oct (founders): Chile in CLP, Brazil in BRL. No 6-month, no trial. */
  local: {
    clp: { monthly: 9990, yearly: 89990, pen: 59990 },
    brl: { monthly: 59.9, yearly: 459, pen: 360 },
  },
} as const

export const fmtUsd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)
