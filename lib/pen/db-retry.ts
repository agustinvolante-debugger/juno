// Retrying a database call that failed because the database was busy, not because it was wrong.
//
// 22 Oct: Chris uploaded 14 pen files at once. Ten pipelines ran against the database together,
// and two write-ups died on "canceling statement due to statement timeout" and "upstream request
// timeout", while some uploads never got their recording row at all. Those errors say "try again
// in a moment", and a moment later the same call works. Anything else (a missing column, a
// duplicate, a bad request) fails the same way every time, so it is never retried.
//
// Works for both shapes a call comes in: a Supabase builder that RESOLVES with { error }, and a
// function that THROWS (getSession, updateSession...). Pure apart from the timer, so the tests
// can drive it with no database.

/** Postgres / PostgREST / gateway / network failures that pass on their own. */
const TRANSIENT_RE =
  /statement timeout|canceling statement|upstream request timeout|upstream connect error|gateway time-?out|bad gateway|service unavailable|temporarily unavailable|\b50[234]\b|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|socket hang up|fetch failed|network error|other side closed|terminating connection|connection terminated|too many connections|remaining connection slots|timeout exceeded when trying to connect|Connection timed out|could not connect to server|server closed the connection/i

/** Postgres error codes that mean "busy, try again": query_canceled (the statement timeout),
 *  too_many_connections, admin/crash shutdown, cannot_connect_now, and PostgREST's own
 *  connection errors. */
const TRANSIENT_CODES = new Set(['57014', '53300', '57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '08004', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'])

type ErrLike = { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; details?: unknown; hint?: unknown; cause?: unknown; name?: unknown }

/** True for an error worth retrying: the database or the gateway was busy, or the network blinked. */
export function isTransientError(e: unknown): boolean {
  if (e == null) return false
  if (typeof e === 'string') return TRANSIENT_RE.test(e)
  if (typeof e !== 'object') return false
  const x = e as ErrLike
  const code = x.code == null ? '' : String(x.code)
  if (TRANSIENT_CODES.has(code)) return true
  const status = Number(x.status ?? x.statusCode)
  if (status === 502 || status === 503 || status === 504) return true
  // A timeout the caller set itself (AbortSignal.timeout) is the database being slow too.
  if (x.name === 'TimeoutError') return true
  const text = [x.message, x.details, x.hint].filter((v) => typeof v === 'string').join(' ')
  if (text && TRANSIENT_RE.test(text)) return true
  if (x.cause && x.cause !== e) return isTransientError(x.cause)
  return false
}

export type RetryOptions = {
  /** Attempts in all, the first included. Default 3. */
  tries?: number
  /** Wait before attempt n+1 (n = 1 for the first retry), in ms; or a fixed number. Default 400 ms, then 1.2 s. */
  backoff?: number | ((attempt: number) => number)
  /** For tests. */
  sleep?: (ms: number) => Promise<void>
  /** Called before each retry, for logging. */
  onRetry?: (attempt: number, error: unknown) => void
}

const defaultBackoff = (attempt: number) => Math.round(400 * 3 ** (attempt - 1) * (0.8 + Math.random() * 0.4))
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** The defaults every call uses unless it passes its own. Tests shorten the wait. */
export const dbRetryDefaults: { backoff: number | ((attempt: number) => number); sleep: (ms: number) => Promise<void> } = {
  backoff: defaultBackoff,
  sleep: realSleep,
}

/**
 * Runs `fn`, retrying while it fails transiently: it throws a transient error, or resolves with
 * `{ error }` holding one. Returns the last result (or throws the last error), so callers keep
 * handling `{ data, error }` exactly as before. Non-transient failures return or throw at once.
 */
export async function withDbRetry<T>(fn: () => PromiseLike<T> | T, opts: RetryOptions = {}): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 3)
  const wait = opts.backoff ?? dbRetryDefaults.backoff
  const sleep = opts.sleep ?? dbRetryDefaults.sleep
  for (let attempt = 1; ; attempt++) {
    let failure: unknown = null
    let result: T | undefined
    let threw = false
    try {
      result = await fn()
      const err = result && typeof result === 'object' ? (result as { error?: unknown }).error : null
      if (err && isTransientError(err)) failure = err
    } catch (e) {
      threw = true
      failure = e
      if (!isTransientError(e)) throw e
    }
    if (!failure || attempt >= tries) {
      if (threw) throw failure
      return result as T
    }
    opts.onRetry?.(attempt, failure)
    await sleep(typeof wait === 'number' ? wait : wait(attempt))
  }
}
