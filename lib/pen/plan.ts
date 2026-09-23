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
/** Paid once a year — $12/month — and the recorder is included. */
export const PLAN_ANNUAL_USD = 144
/** One-time, on the monthly plan only. Costs us $40 plus $8 to post. */
export const PEN_USD = 50
/**
 * Recording included each month, on both plans. Resets on the 1st, Pacific, whatever day
 * someone joined.
 *
 * Not chosen as a cost limit — we keep $9.25 of every $15 at twelve hours and only stop making money at
 * thirty-four. Twelve clears three showings a week with room, and across a realistic spread of
 * users the difference between capping at six and capping at twelve is 44 cents a month,
 * because most people sit at two to four hours whatever the number says.
 */
export const INCLUDED_HOURS = 12

/**
 * Free trial length, in days.
 *
 * Two weeks for someone who can start today with a phone recording. Three for someone waiting
 * on a posted recorder, because despatch eats three to five days of a fourteen-day trial and
 * a trial that expires before the product arrives is not a trial.
 */
export const TRIAL_DAYS = 14
export const TRIAL_DAYS_POSTED = 21

export type Offer = 'own-recorder' | 'posted-pen'
export type Plan = 'monthly' | 'annual'

/**
 * Free days before the first charge. Agreed 23 Sep: the yearly plan has none. It includes the
 * recorder, and a trial meant posting $48 of hardware to someone who could cancel on day 20
 * having paid nothing. Monthly customers pay for the pen up front, so their trial risks nothing.
 */
export function trialDaysFor(offer: Offer, plan: Plan = 'monthly'): number {
  if (plan === 'annual') return 0
  return offer === 'posted-pen' ? TRIAL_DAYS_POSTED : TRIAL_DAYS
}

export type Usage = {
  /** Minutes recorded in the current billing month. */
  used: number
  /** ISO timestamp of the next reset (midnight on the 1st, Pacific). */
  resetsAt: string
}

// ---------------------------------------------------------------------------
// Agreed 23 Sep: the twelve hours are a cap, not a report. Past them a recording is still
// uploaded and kept, but nothing is transcribed or written until the month resets or the
// user buys more. Bought hours never expire and are only drawn on once the month's included
// hours are gone.
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
