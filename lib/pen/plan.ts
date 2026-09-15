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
