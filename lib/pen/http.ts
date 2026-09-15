// Client-side fetch that never assumes the response is JSON.
//
// The bug this exists to kill: `(await r.json()).error` on a failed request. When a function
// exceeds its time limit the platform returns a plain-text body — "An error occurred with
// your deployment…" — and JSON.parse throws `Unexpected token 'A'`, so the user sees a
// crashed page instead of the error. Read as text, parse only if it parses.
//
// No server imports here: this is bundled into the browser.

export class PenHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PenHttpError'
    this.status = status
  }
}

/** Plain-text platform failures, translated into something a person can act on. */
function friendly(status: number, text: string, url = ''): string {
  const t = text.trim()
  if (status === 401) return 'Your session expired. Reload the page and sign in again.'
  if (status === 413) return 'That was too large to send.'
  if (status === 429) return 'Too many requests at once. Give it a moment and try again.'
  if (status === 504 || /timed? ?out|FUNCTION_INVOCATION_TIMEOUT/i.test(t)) {
    return /\/(chats|chat|archive)/.test(url)
      ? 'That took too long to answer. Try a narrower question, or ask again.'
      : 'That took too long and timed out. Try again — long recordings can take a couple of minutes.'
  }
  if (status === 502 || status === 503) return 'The server is temporarily unavailable. Try again in a moment.'
  if (/An error occurred/i.test(t)) return 'The server hit an error answering that. Try again.'
  // A short server message is usually the useful one; a wall of HTML never is.
  if (t && t.length < 240 && !/^\s*</.test(t)) return t
  return `Something went wrong (${status}).`
}

async function parse<T>(r: Response, url = ''): Promise<T> {
  const text = await r.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Body was not JSON. Only an error path should ever reach here.
    if (r.ok) throw new PenHttpError('The server sent back something unreadable.', r.status)
  }

  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error?.trim()
    // Auth and rate limits get the friendly wording even when the server sent its own — the
    // API's "unauthorized" is accurate and tells the user nothing about what to do.
    const preferFriendly = r.status === 401 || r.status === 429 || r.status >= 502
    throw new PenHttpError(preferFriendly || !msg ? friendly(r.status, text, url) : msg, r.status)
  }
  return data as T
}

export async function getJson<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { cache: 'no-store' }), url)
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    url,
  )
}

export async function patchJson<T>(url: string, body: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    url,
  )
}

export async function del<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { method: 'DELETE' }), url)
}

/** Message for a caught error, without leaking "[object Object]" or an empty string. */
export function errMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  return fallback
}
