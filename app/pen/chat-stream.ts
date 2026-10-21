// The web chat's request (22 Oct): POST /api/pen/chats, answered either as JSON (the archive
// answer, PEN_WEB_AGENT off) or as Server-Sent Events from the action-taking assistant
// (lib/pen/agent-io.ts: progress → done | error). One function for both, so ChatView does not
// care which one the server chose.
//
// Browser-only: no server imports.

import type { ArchiveTurn } from '@/lib/pen/store'
import type { AgentParts, WebAction } from '@/lib/pen/agent-io'
import { PenHttpError } from '@/lib/pen/http'
import type { Lang } from '@/lib/pen/i18n'

/** An assistant turn as the agent stores it: the archive turn plus its buttons and cards. Local
 *  until store.ts carries `parts` itself; an intersection, so it keeps working after that merge. */
export type AgentTurn = ArchiveTurn & { parts?: AgentParts | null }

export type ChatReply = { chat: { id: string; messages: AgentTurn[] } }

export type ChatBody = {
  id?: string
  question?: string
  mentions?: { id: string; kind: string; label?: string }[]
  action?: WebAction
}

export type StreamEvent =
  | { event: 'progress'; data: { label: string } }
  | { event: 'done'; data: ChatReply }
  | { event: 'error'; data: { error: string } }

/** Where the events come from: the real route, or the dev mock (chat-mock.ts). */
export type ChatTransport = (body: ChatBody, signal: AbortSignal) => AsyncGenerator<StreamEvent>

const FAIL = {
  en: {
    expired: 'Your session expired. Reload the page and sign in again.',
    tooMany: 'Too many requests at once. Give it a moment and try again.',
    slow: 'That took too long to answer. Try a narrower question, or ask again.',
    down: 'The server is temporarily unavailable. Try again in a moment.',
    cut: 'The answer was cut off before it finished. Try again.',
    generic: (s: number) => `Something went wrong (${s}).`,
  },
  es: {
    expired: 'Tu sesión expiró. Recarga la página y vuelve a entrar.',
    tooMany: 'Demasiadas solicitudes a la vez. Espera un momento y vuelve a intentarlo.',
    slow: 'La respuesta tardó demasiado. Prueba con una pregunta más específica, o pregunta otra vez.',
    down: 'El servidor no está disponible por ahora. Inténtalo de nuevo en un momento.',
    cut: 'La respuesta se cortó antes de terminar. Inténtalo de nuevo.',
    generic: (s: number) => `Algo salió mal (${s}).`,
  },
  pt: {
    expired: 'Sua sessão expirou. Recarregue a página e entre de novo.',
    tooMany: 'Muitas solicitações ao mesmo tempo. Espere um pouco e tente de novo.',
    slow: 'A resposta demorou demais. Tente uma pergunta mais específica, ou pergunte de novo.',
    down: 'O servidor está indisponível no momento. Tente de novo daqui a pouco.',
    cut: 'A resposta foi cortada antes de terminar. Tente de novo.',
    generic: (s: number) => `Algo deu errado (${s}).`,
  },
}

/** A failed response as a sentence a person can act on (mirrors lib/pen/http.ts's wording). */
function failure(status: number, text: string, lang: Lang): PenHttpError {
  const F = FAIL[lang]
  let msg: string | undefined
  try { msg = (JSON.parse(text) as { error?: string })?.error?.trim() } catch { /* plain text */ }
  const t = text.trim()
  const out =
    status === 401 ? F.expired
    : status === 429 ? F.tooMany
    : status === 504 || /timed? ?out|FUNCTION_INVOCATION_TIMEOUT/i.test(t) ? F.slow
    : status === 502 || status === 503 ? F.down
    : msg || (t && t.length < 240 && !/^\s*</.test(t) && !/An error occurred/i.test(t) ? t : F.generic(status))
  return new PenHttpError(out, status)
}

/** Splits an SSE body into events. Tolerates \r\n, comments and multi-line data. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const flush = function* (block: string) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue
      const c = line.indexOf(':')
      const field = c < 0 ? line : line.slice(0, c)
      const value = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (data.length) yield { event, data: data.join('\n') }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let m: RegExpExecArray | null
      while ((m = /\r?\n\r?\n/.exec(buf))) {
        const block = buf.slice(0, m.index)
        buf = buf.slice(m.index + m[0].length)
        yield* flush(block)
      }
    }
    buf += dec.decode()
    if (buf.trim()) yield* flush(buf)
  } finally {
    reader.releaseLock()
  }
}

/** The real route. A JSON answer (agent off) arrives as a single `done`. */
export function httpTransport(lang: Lang): ChatTransport {
  return async function* (body, signal) {
    const r = await fetch('/api/pen/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
      body: JSON.stringify(body),
      signal,
    })
    const type = r.headers.get('content-type') ?? ''
    if (r.ok && type.includes('text/event-stream') && r.body) {
      for await (const ev of readSse(r.body)) {
        let data: unknown = null
        try { data = JSON.parse(ev.data) } catch { continue }
        if (ev.event === 'progress' || ev.event === 'done' || ev.event === 'error') {
          yield { event: ev.event, data } as StreamEvent
        }
      }
      return
    }
    const text = await r.text()
    if (!r.ok) throw failure(r.status, text, lang)
    let j: ChatReply | null = null
    try { j = JSON.parse(text) as ChatReply } catch { /* below */ }
    if (!j?.chat) throw failure(r.status, text, lang)
    yield { event: 'done', data: j }
  }
}

/** Runs a request to the end: progress labels as they come, then the thread. */
export async function runChat(
  transport: ChatTransport,
  body: ChatBody,
  onProgress: (label: string) => void,
  signal: AbortSignal,
  lang: Lang,
): Promise<ChatReply> {
  for await (const ev of transport(body, signal)) {
    if (ev.event === 'progress' && ev.data?.label) onProgress(ev.data.label)
    else if (ev.event === 'done' && ev.data?.chat) return ev.data
    else if (ev.event === 'error') throw new PenHttpError(ev.data?.error || FAIL[lang].generic(500), 500)
  }
  throw new PenHttpError(FAIL[lang].cut, 0)
}
