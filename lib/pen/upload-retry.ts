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

/* ------------------------------------------------------------ automatic retry (23 Oct) */
//
// Founder, 23 Oct: "When adding files and one file fails, instead of the user clicking Retry,
// make it automatic." A row that failed for a passing reason (busy, the connection, a stall, a
// storage PUT) tries again by itself, up to 3 times, after ~10 s, ~30 s and ~60 s. Offline, the
// countdown waits for the connection. A pen pulled out (Chrome / Edge, drive connected) goes again
// as soon as the pen is back. A file that can never go up (too big, unreadable, no hours, a
// refused request) says why at once, as before.

/** Automatic tries per file after the first failure. */
export const AUTO_RETRY_MAX = 3
/** Before automatic try n (1-based): ~10 s, ~30 s, ~60 s. */
export const AUTO_RETRY_DELAYS = [10_000, 30_000, 60_000] as const

/** The wait before automatic try `attempt` (1-based), jittered ±15% so rows don't go in step. */
export function autoRetryDelay(attempt: number, rand: () => number = Math.random): number {
  const base = AUTO_RETRY_DELAYS[Math.min(AUTO_RETRY_DELAYS.length, Math.max(1, attempt)) - 1]
  return Math.round(base * (0.85 + rand() * 0.3))
}

/**
 * Worth trying again by itself? Busy, a dropped connection, a stall, a storage PUT: yes. 'server'
 * only when the answer was a 5xx (a refused 4xx, or a file the browser couldn't decode, won't get
 * better). Too big, no hours / read-only, gone: never. 'unplugged' is the pen's own path.
 */
export function isTransient(kind: UploadFailure, status = 0): boolean {
  if (kind === 'busy' || kind === 'network' || kind === 'stalled') return true
  if (kind === 'server') return status >= 500 || status === 408 || status === 429
  return false
}

export type AutoRetryLog = { key: string; attempt: number; outcome: 'start' | 'ok' | 'failed' | 'gave-up'; reason: string }

/** What a failed row does now. */
export type AutoRetryPlan =
  | { do: 'countdown'; attempt: number; at: number | null; left: number }
  | { do: 'pen'; attempt: number }
  | { do: 'stop' }

type Wait = { batch: string; attempt: number; reason: string; pen: boolean; at: number | null; left: number }

/**
 * The automatic retries, without React or timers, so the tests drive it with their own clock.
 * The tray calls failed() when a row fails, due() once a second (it hands back the rows to start,
 * at most one per batch at a time, and only while the batch has a free lane), started rows report
 * back with failed() or succeeded(). setOnline() pauses and resumes the countdowns; penBack()
 * makes the rows waiting for the pen due at once.
 */
export class AutoRetry {
  private tries = new Map<string, number>()
  private waits = new Map<string, Wait>()
  /** batch → the row of it retrying right now. */
  private running = new Map<string, string>()
  online: boolean
  constructor(private readonly o: { max?: number; delay?: (attempt: number) => number; log?: (e: AutoRetryLog) => void; online?: boolean } = {}) {
    this.online = o.online ?? true
  }
  private get max() { return this.o.max ?? AUTO_RETRY_MAX }
  private release(key: string) {
    for (const [b, k] of this.running) if (k === key) this.running.delete(b)
  }
  /** Automatic tries used so far. */
  attempts(key: string): number {
    return this.tries.get(key) ?? 0
  }
  /** A row failed (first time, or an automatic try). `penDrive`: the pen can be watched for. */
  failed(key: string, batch: string, f: { kind: UploadFailure; status?: number; reason: string; penDrive?: boolean }, now: number): AutoRetryPlan {
    const n = this.attempts(key)
    const wasRunning = [...this.running.values()].includes(key)
    this.release(key)
    if (wasRunning) this.o.log?.({ key, attempt: n, outcome: 'failed', reason: `${f.kind}${f.status ? ` ${f.status}` : ''}: ${f.reason}` })
    const pen = f.kind === 'unplugged' && Boolean(f.penDrive)
    if (!pen && !isTransient(f.kind, f.status)) { this.waits.delete(key); return { do: 'stop' } }
    if (n >= this.max) {
      this.waits.delete(key)
      this.o.log?.({ key, attempt: n, outcome: 'gave-up', reason: f.kind })
      return { do: 'stop' }
    }
    const attempt = n + 1
    if (pen) {
      this.waits.set(key, { batch, attempt, reason: f.kind, pen: true, at: null, left: 0 })
      return { do: 'pen', attempt }
    }
    const left = (this.o.delay ?? autoRetryDelay)(attempt)
    const at = this.online ? now + left : null
    this.waits.set(key, { batch, attempt, reason: f.kind, pen: false, at, left })
    return { do: 'countdown', attempt, at, left }
  }
  succeeded(key: string): void {
    if ([...this.running.values()].includes(key)) this.o.log?.({ key, attempt: this.attempts(key), outcome: 'ok', reason: '' })
    this.release(key)
    this.waits.delete(key)
  }
  /** Closed from the card, or retried by hand: no longer ours. */
  forget(key: string): void {
    this.release(key)
    this.waits.delete(key)
  }
  /** Offline: every countdown stops where it is. Back online: it goes on from there. */
  setOnline(on: boolean, now: number): void {
    if (on === this.online) return
    this.online = on
    for (const w of this.waits.values()) {
      if (w.pen) continue
      if (!on && w.at !== null) { w.left = Math.max(0, w.at - now); w.at = null }
      else if (on && w.at === null) w.at = now + w.left
    }
  }
  /** The pen is plugged in again: rows waiting for it go next. */
  penBack(now: number): string[] {
    const keys: string[] = []
    for (const [k, w] of this.waits) if (w.pen && w.at === null) { w.at = now; keys.push(k) }
    return keys
  }
  waitingForPen(): boolean {
    for (const w of this.waits.values()) if (w.pen && w.at === null) return true
    return false
  }
  /**
   * The rows to start now: due, online (a pen row needs no network to be read, but does to go
   * up), one per batch at a time, and only where `canStart(batch)` (a free lane) says so.
   */
  due(now: number, canStart: (batch: string) => boolean = () => true): string[] {
    if (!this.online) return []
    const out: string[] = []
    const ready = [...this.waits].filter(([, w]) => w.at !== null && w.at <= now).sort((a, b) => a[1].at! - b[1].at!)
    for (const [k, w] of ready) {
      if (this.running.has(w.batch) || !canStart(w.batch)) continue
      this.running.set(w.batch, k)
      this.waits.delete(k)
      this.tries.set(k, w.attempt)
      out.push(k)
      this.o.log?.({ key: k, attempt: w.attempt, outcome: 'start', reason: w.reason })
    }
    return out
  }
  /** What the row shows: seconds left, waiting for the connection, or for the pen. */
  view(key: string, now: number): { secs: number } | { offline: true } | { pen: true } | null {
    const w = this.waits.get(key)
    if (!w) return null
    if (w.pen) return w.at === null ? { pen: true } : { secs: 0 }
    if (w.at === null) return { offline: true }
    return { secs: Math.max(0, Math.ceil((w.at - now) / 1000)) }
  }
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
    retryIn: (n: number) => `Retrying in ${n} s…`,
    waitOnline: 'Waiting for your connection…',
    waitPen: 'Retrying as soon as your pen is plugged in…',
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
    retryIn: (n: number) => `Reintentando en ${n} s…`,
    waitOnline: 'Esperando tu conexión…',
    waitPen: 'Se reintentará apenas conectes tu lápiz…',
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
    retryIn: (n: number) => `Tentando de novo em ${n} s…`,
    waitOnline: 'Aguardando sua conexão…',
    waitPen: 'Vamos tentar de novo assim que sua caneta for conectada…',
    why: 'Por quê?',
  },
} satisfies Record<Lang, Record<UploadFailure, string> & { retry: string; retryAll: (n: number) => string; retrying: string; retryIn: (n: number) => string; waitOnline: string; waitPen: string; why: string }>

export const UPLOAD_RETRY_COPY = COPY

/** The plain-words reason for a failed row. */
export function uploadReason(kind: UploadFailure, lang: Lang): string {
  return COPY[lang][kind]
}
