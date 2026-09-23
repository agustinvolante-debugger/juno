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

/** No cap. Kept as a named export so the meter reads as a decision rather than a missing check. */
export const MINUTES_UNLIMITED = true

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
 * Recording included each month, on both plans.
 *
 * Not a cost limit — we keep $9.25 of every $15 at twelve hours and only stop making money at
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
export function trialDaysFor(offer: Offer): number {
  return offer === 'posted-pen' ? TRIAL_DAYS_POSTED : TRIAL_DAYS
}

export type Usage = {
  /** Minutes recorded in the current calendar month. */
  used: number
  /** ISO timestamp of the next reset (first instant of next month, UTC). */
  resetsAt: string
}

/** First instant of the next UTC month — when the monthly counter rolls over. */
export function nextMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

/** First instant of the current UTC month. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
