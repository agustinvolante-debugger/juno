// Client-side fetch that never assumes the response is JSON.
//
// The bug this exists to kill: `(await r.json()).error` on a failed request. When a function
// exceeds its time limit the platform returns a plain-text body — "An error occurred with
// your deployment…" — and JSON.parse throws `Unexpected token 'A'`, so the user sees a
// crashed page instead of the error. Read as text, parse only if it parses.
//
// No server imports here: this is bundled into the browser.

import { clientLang } from './i18n'

export class PenHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PenHttpError'
    this.status = status
  }
}

const FRIENDLY = {
  en: {
    expired: 'Your session expired. Reload the page and sign in again.',
    tooLarge: 'That was too large to send.',
    tooMany: 'Too many requests at once. Give it a moment and try again.',
    slowAnswer: 'That took too long to answer. Try a narrower question, or ask again.',
    timedOut: 'That took too long and timed out. Try again — long recordings can take a couple of minutes.',
    unavailable: 'The server is temporarily unavailable. Try again in a moment.',
    serverError: 'The server hit an error answering that. Try again.',
    unreadable: 'The server sent back something unreadable.',
    generic: (s: number) => `Something went wrong (${s}).`,
  },
  es: {
    expired: 'Tu sesión expiró. Recarga la página y vuelve a entrar.',
    tooLarge: 'Era demasiado grande para enviarlo.',
    tooMany: 'Demasiadas solicitudes a la vez. Espera un momento y vuelve a intentarlo.',
    slowAnswer: 'La respuesta tardó demasiado. Prueba con una pregunta más específica, o pregunta otra vez.',
    timedOut: 'Tardó demasiado y se cortó. Vuelve a intentarlo: las grabaciones largas pueden tomar un par de minutos.',
    unavailable: 'El servidor no está disponible por ahora. Inténtalo de nuevo en un momento.',
    serverError: 'El servidor tuvo un error al responder. Inténtalo de nuevo.',
    unreadable: 'El servidor devolvió algo que no se pudo leer.',
    generic: (s: number) => `Algo salió mal (${s}).`,
  },
  pt: {
    expired: 'Sua sessão expirou. Recarregue a página e entre de novo.',
    tooLarge: 'Era grande demais para enviar.',
    tooMany: 'Muitas solicitações ao mesmo tempo. Espere um pouco e tente de novo.',
    slowAnswer: 'A resposta demorou demais. Tente uma pergunta mais específica, ou pergunte de novo.',
    timedOut: 'Demorou demais e o tempo esgotou. Tente de novo — gravações longas podem levar alguns minutos.',
    unavailable: 'O servidor está indisponível no momento. Tente de novo daqui a pouco.',
    serverError: 'O servidor teve um erro ao responder. Tente de novo.',
    unreadable: 'O servidor devolveu algo ilegível.',
    generic: (s: number) => `Algo deu errado (${s}).`,
  },
}

/** Plain-text platform failures, translated into something a person can act on. */
function friendly(status: number, text: string, url = ''): string {
  const F = FRIENDLY[clientLang()]
  const t = text.trim()
  if (status === 401) return F.expired
  if (status === 413) return F.tooLarge
  if (status === 429) return F.tooMany
  if (status === 504 || /timed? ?out|FUNCTION_INVOCATION_TIMEOUT/i.test(t)) {
    return /\/(chats|chat|archive)/.test(url) ? F.slowAnswer : F.timedOut
  }
  if (status === 502 || status === 503) return F.unavailable
  if (/An error occurred/i.test(t)) return F.serverError
  // A short server message is usually the useful one; a wall of HTML never is.
  if (t && t.length < 240 && !/^\s*</.test(t)) return t
  return F.generic(status)
}

async function parse<T>(r: Response, url = ''): Promise<T> {
  const text = await r.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Body was not JSON. Only an error path should ever reach here.
    if (r.ok) throw new PenHttpError(FRIENDLY[clientLang()].unreadable, r.status)
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

export async function putJson<T>(url: string, body: unknown): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: 'PUT',
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
