// The upload tray's resilience, the parts that aren't React (so they can be tested).
//
// 22 Oct, Chris: 14 files at once from a computer. 4-5 never became recordings: the tray showed
// "!" with no reason (or sat at 5% forever) because /api/pen/upload-url or the save call failed
// while the database was busy, and nothing tried again. Now:
//  - the two small calls (signed URL, save) are retried on a busy / network answer, 3 tries;
//  - a failed row says why in plain words and has its own Retry (and "Retry failed" for all);
//  - a row whose upload hasn't moved for 90 s (not while preparing) is stopped and retryable;
//  - fewer files go at once after an error, and more again once things go through.

import type { Lang } from './currency'

/** HTTP answers worth another try: busy, rate-limited, or the server fell over. 0 = no answer (network). */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

/** Why a row failed, in a word the tray can say in plain language. */
/** 'unplugged': a file from the pen stopped being readable mid-upload (the pen came out); Retry
 *  reads it again. 'gone': it still can't be read, so it has to be chosen again. */
export type UploadFailure = 'busy' | 'network' | 'stalled' | 'too-big' | 'paused' | 'server' | 'unplugged' | 'gone'

export class UploadError extends Error {
  constructor(readonly kind: UploadFailure, message: string, readonly status = 0) {
    super(message)
  }
}

/** The kind for an HTTP answer that wasn't ok. */
export function failureFor(status: number): UploadFailure {
  if (status === 0) return 'network'
  if (status === 403) return 'paused'
  if (status === 413) return 'too-big'
  if (isRetryableStatus(status)) return 'busy'
  return 'server'
}

/** The kind for anything thrown during an upload (UploadError, fetch's TypeError, the XHR's errors). */
export function classifyUploadError(e: unknown): UploadFailure {
  if (e instanceof UploadError) return e.kind
  const m = String((e as Error)?.message ?? e)
  if (/too big|too large|demasiado grande|grande demais/i.test(m)) return 'too-big'
  if (/stalled|no progress/i.test(m)) return 'stalled'
  // The XHR's own "upload failed 503: …" first: it isn't Safari's "Load failed".
  const s = /upload failed (\d{3})/.exec(m)
  if (s) return failureFor(Number(s[1]))
  if (/network|failed to fetch|^load failed|networkerror|fetch failed|aborted/i.test(m)) return 'network'
  if (/timeout|timed out|upstream|503|502|504|busy/i.test(m)) return 'busy'
  return 'server'
}

/** Worth offering Retry for: everything but a file that's too big or a paused plan. */
export function canRetry(kind: UploadFailure): boolean {
  return kind !== 'too-big' && kind !== 'paused' && kind !== 'gone'
}

/** What the browser throws reading a File whose disk went away (a USB pen pulled out). */
export function isUnreadable(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name
  return name === 'NotFoundError' || name === 'NotReadableError'
}

/** Can this file still be read? False when its disk went away (the pen was unplugged). */
export async function stillReadable(file: Blob): Promise<boolean> {
  try {
    await file.slice(0, 1).arrayBuffer()
    return true
  } catch (e) {
    return !isUnreadable(e)
  }
}

export type RetryFetchOptions = {
  tries?: number
  backoff?: (attempt: number) => number
  sleep?: (ms: number) => Promise<void>
  /** Told before each retry, so the tray can show "trying again". */
  onRetry?: (attempt: number, status: number) => void
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** 1.5 s, then 4.5 s (with a little jitter so 3 lanes don't retry in step). */
export const uploadBackoff = (attempt: number) => Math.round(1500 * 3 ** (attempt - 1) * (0.85 + Math.random() * 0.3))

/**
 * POSTs JSON and returns the parsed body, retrying a busy or failed answer (3 tries in all).
 * Throws UploadError with the server's message (or `fallback`) when it gives up or on a refusal.
 */
export async function postJsonRetry<T>(
  doFetch: (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>,
  url: string,
  body: unknown,
  fallback: string,
  opts: RetryFetchOptions = {},
): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 3)
  const backoff = opts.backoff ?? uploadBackoff
  const sleep = opts.sleep ?? wait
  for (let attempt = 1; ; attempt++) {
    let status = 0
    let message = fallback
    try {
      const r = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) return (await r.json()) as T
      status = r.status
      const j = (await r.json().catch(() => ({}))) as { error?: unknown }
      if (typeof j.error === 'string' && j.error) message = j.error
    } catch (e) {
      status = 0
      message = (e as Error)?.message || fallback
    }
    if (!isRetryableStatus(status) || attempt >= tries) throw new UploadError(failureFor(status), message, status)
    opts.onRetry?.(attempt, status)
    await sleep(backoff(attempt))
  }
}

/** A row uploading (not preparing, not waiting for its turn) with no progress for this long is stuck. */
export const STALL_MS = 90_000

/** Is this row stuck? `phase` is what it is doing: only 'upload' (sending bytes or the small calls) can stall. */
export function isStalled(row: { state: string; stage?: string; movedAt?: number }, now: number, stallMs = STALL_MS): boolean {
  return row.state === 'working' && row.stage === 'upload' && typeof row.movedAt === 'number' && now - row.movedAt > stallMs
}

/**
 * How many files go at once. Starts at `max` (3 on a computer); every failure halves it (down to
 * 1); `recoverAfter` files in a row going through raise it by one again. The tray asks `limit`
 * before starting each file.
 */
export class Lanes {
  limit: number
  private streak = 0
  constructor(readonly max: number, readonly recoverAfter = 2) {
    this.limit = Math.max(1, max)
  }
  failed(): void {
    this.streak = 0
    this.limit = Math.max(1, Math.floor(this.limit / 2))
  }
  succeeded(): void {
    if (this.limit >= this.max) return
    if (++this.streak >= this.recoverAfter) {
      this.limit++
      this.streak = 0
    }
  }
}

/**
 * Runs `items` through `fn` with at most `lanes.limit` at once (re-read before each start, so a
 * failure slows the rest of the batch down). Never rejects: `fn` handles its own errors and
 * returns whether the item went through.
 */
export async function runLanes<T>(items: T[], lanes: Lanes, fn: (item: T) => Promise<boolean>): Promise<void> {
  let next = 0
  let running = 0
  await new Promise<void>((done) => {
    const pump = () => {
      if (next >= items.length && running === 0) return done()
      while (running < lanes.limit && next < items.length) {
        const item = items[next++]
        running++
        fn(item)
          .then((ok) => (ok ? lanes.succeeded() : lanes.failed()), () => lanes.failed())
          .finally(() => {
            running--
            pump()
          })
      }
    }
    pump()
  })
}

const COPY = {
  en: {
    busy: 'Juno was busy and didn’t answer in time. Nothing is lost: tap Retry.',
    network: 'The connection dropped during the upload. Check your internet and tap Retry.',
    stalled: 'This upload stopped moving for over a minute. Tap Retry to send it again.',
    'too-big': 'This file is too big to upload.',
    paused: 'Your plan doesn’t allow new recordings right now.',
    server: 'Something went wrong on our side. Tap Retry; if it keeps failing, write to us.',
    unplugged: 'Your pen was unplugged. Plug it back in and tap Retry.',
    gone: 'Juno can’t read this file anymore. Plug your pen in and add this recording again.',
    retry: 'Retry',
    retryAll: (n: number) => (n === 1 ? 'Retry the failed one' : `Retry the ${n} failed`),
    retrying: 'Busy, trying again…',
    why: 'Why?',
  },
  es: {
    busy: 'Juno estaba ocupado y no respondió a tiempo. No se perdió nada: toca Reintentar.',
    network: 'Se cortó la conexión durante la subida. Revisa tu internet y toca Reintentar.',
    stalled: 'Esta subida dejó de avanzar por más de un minuto. Toca Reintentar para enviarla otra vez.',
    'too-big': 'Este archivo es demasiado grande para subirlo.',
    paused: 'Tu plan no permite grabaciones nuevas por ahora.',
    server: 'Algo falló de nuestro lado. Toca Reintentar; si sigue fallando, escríbenos.',
    unplugged: 'Se desconectó tu lápiz. Vuelve a conectarlo y toca Reintentar.',
    gone: 'Juno ya no puede leer este archivo. Conecta tu lápiz y vuelve a agregar esta grabación.',
    retry: 'Reintentar',
    retryAll: (n: number) => (n === 1 ? 'Reintentar la que falló' : `Reintentar las ${n} que fallaron`),
    retrying: 'Ocupado, reintentando…',
    why: '¿Por qué?',
  },
  pt: {
    busy: 'O Juno estava ocupado e não respondeu a tempo. Nada se perdeu: toque em Tentar de novo.',
    network: 'A conexão caiu durante o envio. Confira sua internet e toque em Tentar de novo.',
    stalled: 'Este envio parou de avançar por mais de um minuto. Toque em Tentar de novo para enviar outra vez.',
    'too-big': 'Este arquivo é grande demais para enviar.',
    paused: 'Seu plano não permite novas gravações agora.',
    server: 'Algo deu errado do nosso lado. Toque em Tentar de novo; se continuar falhando, fale com a gente.',
    unplugged: 'Sua caneta foi desconectada. Conecte de novo e toque em Tentar de novo.',
    gone: 'O Juno não consegue mais ler este arquivo. Conecte sua caneta e adicione esta gravação de novo.',
    retry: 'Tentar de novo',
    retryAll: (n: number) => (n === 1 ? 'Tentar de novo a que falhou' : `Tentar de novo as ${n} que falharam`),
    retrying: 'Ocupado, tentando de novo…',
    why: 'Por quê?',
  },
} satisfies Record<Lang, Record<UploadFailure, string> & { retry: string; retryAll: (n: number) => string; retrying: string; why: string }>

export const UPLOAD_RETRY_COPY = COPY

/** The plain-words reason for a failed row. */
export function uploadReason(kind: UploadFailure, lang: Lang): string {
  return COPY[lang][kind]
}
