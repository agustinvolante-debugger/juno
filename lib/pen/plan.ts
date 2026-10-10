// The plan. One of them.
//
// Was a free 120-minute Starter and a $15 Pro. Now: $45 covers the first three months and
// the recorder, then $15/month, unlimited minutes. Nothing is free, so nothing in the product
// may say it is.

/** Charged up front. Covers the first three months and the pen. */
export const UPFRONT_USD = 45
export const UPFRONT_MONTHS = 3
/** Charged monthly after the up-front period. */
export const MONTHLY_USD = 15

// ---------------------------------------------------------------------------
// Agreed 22 Sep. The landing page still shows the numbers above; these are what
// checkout actually charges, and the page is the next thing to bring into line.
// ---------------------------------------------------------------------------

/** Paid monthly. The recorder is bought separately at PEN_USD. */
export const PLAN_MONTHLY_USD = 15
/** Agreed 25 Sep: paid every six months, the recorder included the first time. */
export const PLAN_HALFYEAR_USD = 90
/** Paid once a year, $12/month, and the recorder is included. */
export const PLAN_ANNUAL_USD = 144
/** One-time, on the monthly pen plan only. Costs us $40. */
export const PEN_USD = 50

/**
 * Software only, for people who already record (phone, WhatsApp voice notes, Plaud, any
 * recorder). No pen, no shipping.
 *
 * Agreed 10 Oct: the same price as the pen plans. It was $12 / $54, cheaper than the pen plans'
 * $15 / $90 for the same software, so anyone who had the pen could switch down and save, and a
 * loyal pen customer renewing paid $72 a year more for nothing. One software price for
 * everyone; the pen is a one-time $50, or free when the plan is paid 6 or 12 months up front.
 * Local prices (CLP, BRL) are unchanged: the pen isn't sold there, so there is nothing to game.
 */
export const SOFTWARE_MONTHLY_USD = PLAN_MONTHLY_USD
export const SOFTWARE_HALFYEAR_USD = PLAN_HALFYEAR_USD
export const SOFTWARE_ANNUAL_USD = PLAN_ANNUAL_USD

/**
 * Fair-use ceiling on "unlimited", in hours a month. Agreed 25 Sep, replacing the 12-hour cap:
 * every plan is sold as unlimited and this is the line almost nobody reaches. It exists for
 * the one account that would record around the clock (100 h costs us about $70).
 * The name is kept so the allowance code that reads it is unchanged.
 */
export const INCLUDED_HOURS = 100

/**
 * Free trial length, in days.
 *
 * Seven for software only: nothing to wait for, a week is enough to send a few recordings.
 * Twenty-one for the monthly pen plan, because posting the pen eats three to five days.
 * Prepaid plans (6 months, a year) have none: they include the pen.
 */
export const TRIAL_DAYS = 7
export const TRIAL_DAYS_POSTED = 21
/** The invited-agent offer (Orlando cold email, 30 Sep 2026): the pen free, 30 days free,
 *  then the monthly plan. Capped, because a forwarded link must not post unlimited hardware. */
export const FREE_PEN_TRIAL_DAYS = 30
export const FREE_PEN_CAP = 25
/**
 * Agreed 10 Oct: the free pen comes with a 3-month minimum (the free month plus two paid). A
 * plan that ends sooner is charged PEN_USD for the pen, once, when it ends. Measured in days
 * from checkout so the end of the second paid month (about day 90) clears it.
 * Applies to free-pen checkouts made after the change only: the subscription carries
 * `pen_min_until` in its metadata, and earlier ones (whose terms said "never charged") don't.
 */
export const FREE_PEN_MIN_MONTHS = 3
export const FREE_PEN_MIN_DAYS = 85

/** Whether a plan ending at `endsAt` falls inside the free pen's minimum (so the pen is charged). */
export function penFeeDue(meta: Record<string, unknown> | null | undefined, endsAt: string | number | Date | null | undefined): boolean {
  const until = typeof meta?.pen_min_until === 'string' ? Date.parse(meta.pen_min_until) : NaN
  if (!Number.isFinite(until) || endsAt == null) return false
  return new Date(endsAt).getTime() < until
}

export type Offer = 'own-recorder' | 'posted-pen' | 'free-pen'
export type Plan = 'monthly' | 'halfyear' | 'annual'

export function parsePlan(v: unknown): Plan {
  return v === 'annual' ? 'annual' : v === 'halfyear' ? 'halfyear' : 'monthly'
}
export function parseOffer(v: unknown): Offer {
  return v === 'own-recorder' ? 'own-recorder' : v === 'free-pen' ? 'free-pen' : 'posted-pen'
}

/** Free days before the first charge. Prepaid plans have none. */
export function trialDaysFor(offer: Offer, plan: Plan = 'monthly'): number {
  if (plan !== 'monthly') return 0
  if (offer === 'free-pen') return FREE_PEN_TRIAL_DAYS
  return offer === 'posted-pen' ? TRIAL_DAYS_POSTED : TRIAL_DAYS
}

/**
 * What each offer and plan costs, and the env var holding its Stripe price. Software only has
 * its own prices (same amounts as the pen plans) so its receipts never say "recorder included".
 */
export function planPrice(offer: Offer, plan: Plan): { usd: number; months: number; env: string } | null {
  // Free pen: monthly only, the same price as the pen plan; the pen itself is never charged.
  if (offer === 'free-pen') return plan === 'monthly' ? { usd: PLAN_MONTHLY_USD, months: 1, env: 'STRIPE_PRICE_MONTHLY' } : null
  if (offer === 'posted-pen') {
    if (plan === 'monthly') return { usd: PLAN_MONTHLY_USD, months: 1, env: 'STRIPE_PRICE_MONTHLY' }
    if (plan === 'halfyear') return { usd: PLAN_HALFYEAR_USD, months: 6, env: 'STRIPE_PRICE_HALFYEAR' }
    return { usd: PLAN_ANNUAL_USD, months: 12, env: 'STRIPE_PRICE_ANNUAL' }
  }
  if (plan === 'monthly') return { usd: SOFTWARE_MONTHLY_USD, months: 1, env: 'STRIPE_PRICE_SOFTWARE_MONTHLY' }
  if (plan === 'halfyear') return { usd: SOFTWARE_HALFYEAR_USD, months: 6, env: 'STRIPE_PRICE_SOFTWARE_HALFYEAR' }
  return { usd: SOFTWARE_ANNUAL_USD, months: 12, env: 'STRIPE_PRICE_SOFTWARE_ANNUAL' }
}

export type Usage = {
  /** Minutes recorded in the current billing month. */
  used: number
  /** ISO timestamp of the next reset (midnight on the 1st, Pacific). */
  resetsAt: string
}

// ---------------------------------------------------------------------------
// Past the fair-use ceiling a recording is still uploaded and kept, but nothing is transcribed
// until the month resets. Bought hours (from the 23 Sep top-ups) still count if anyone has
// them; the Buy hours page is no longer linked.
// ---------------------------------------------------------------------------

/** Price of one extra hour. Sold in whole hours only. */
export const HOUR_USD = 1
/** Most hours one checkout will sell. A guard against a typo, not a business limit. */
export const MAX_HOURS_PER_PURCHASE = 50

/**
 * Accounts the cap never applies to. The meter still reports for them, it just never holds
 * a recording. Kept separate from ALLOWED_EMAILS in lib/auth.ts, which is about access.
 */
export const UNCAPPED_EMAILS = [
  'agustinvolantesilva@gmail.com',
  'avolantesilva@gmail.com',
  'chrisdyas9@gmail.com',
  'cvolantesilva@gmail.com',
]
export function isUncapped(email: string): boolean {
  // Local testing of the cap from an account that is on the list. Never read in production.
  if (process.env.NODE_ENV !== 'production' && process.env.PEN_FORCE_CAP === '1') return false
  return UNCAPPED_EMAILS.includes(email.trim().toLowerCase())
}

/**
 * The month resets at midnight Pacific, not UTC. UTC midnight is 4 or 5pm the day before in
 * California, so a UTC reset would hand the new month's hours out on the evening of the 31st.
 */
export const PLAN_TZ = 'America/Los_Angeles'

const wall = new Intl.DateTimeFormat('en-US', {
  timeZone: PLAN_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

/** The Pacific wall clock at an instant, as numbers. */
function wallParts(d: Date) {
  const p = Object.fromEntries(wall.formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

/** How far Pacific wall time is from UTC at an instant, in ms (negative: behind). */
function offsetMs(d: Date): number {
  const p = wallParts(d)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000
}

/** The instant of midnight on the 1st of a Pacific month. `m` is 1-12 and may overflow. */
function pacificMonthStart(y: number, m: number): Date {
  const guess = Date.UTC(y, m - 1, 1)
  let t = guess - offsetMs(new Date(guess))
  // The first guess used the offset at UTC midnight, which can sit on the other side of a
  // daylight-saving change. Correct once with the offset at the answer itself.
  const again = guess - offsetMs(new Date(t))
  if (again !== t) t = again
  return new Date(t)
}

/** "2026-10" for any instant in October, Pacific. The unit the allowance resets on. */
export function monthKey(d: Date = new Date()): string {
  const p = wallParts(d)
  return `${p.y}-${String(p.m).padStart(2, '0')}`
}

/** First instant of the current Pacific month. */
export function monthStart(now = new Date()): Date {
  const p = wallParts(now)
  return pacificMonthStart(p.y, p.m)
}

/** First instant of the next Pacific month — when the monthly allowance rolls over. */
export function nextMonthStart(now = new Date()): Date {
  const p = wallParts(now)
  return pacificMonthStart(p.y, p.m + 1)
}

/** "3h 12m", "45m", "12h". Hours and minutes, never seconds. */
export function fmtHours(sec: number): string {
  const total = Math.max(0, Math.round(sec / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}
