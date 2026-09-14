// Plan allowances. Shared so the landing page and the in-app meter can never disagree about
// what a plan includes — they were two separate numbers waiting to drift apart.

export const STARTER_MINUTES = 120

export type Usage = {
  /** Minutes recorded in the current calendar month. */
  used: number
  /** The month's allowance. */
  allowance: number
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
