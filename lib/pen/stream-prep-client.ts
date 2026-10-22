'use client'

// Page side of the streaming prep (prep.worker.ts). One call = one worker, ended when the file
// is done, fails, or stops moving.

import { fmtMB, type Prepared } from './encode'
import type { PrepFault } from './stream-encode'

/** WAVs above this go through the worker; smaller ones keep the old in-memory path (fast and
 *  proven for short files). ~8.5 minutes of pen ADPCM. */
export const STREAM_ABOVE = 12 * 1024 * 1024

/** No progress for this long during prep = that attempt has stalled. Progress normally ticks
 *  every ~0.2 s, so 20 s is a hundred missed ticks (it was 60 s until the 22 Oct stall). */
export const PREP_WATCHDOG_MS = 20_000

const WAV_NAME = /\.(wav|wave)$/i
const WAV_MIME = /^audio\/(wav|wave|x-wav|x-pn-wav|vnd\.wave)$/i

function canStreamHere(): boolean {
  return typeof Worker === 'function' && typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder === 'function'
}

/** A long WAV on a browser with Workers + WebCodecs. Phones included: memory stays bounded. */
export function canStreamPrep(file: File, above = STREAM_ABOVE): boolean {
  return canStreamHere() && file.size > above && (WAV_NAME.test(file.name) || WAV_MIME.test(file.type))
}

/** One attempt that didn't work, for the diagnostics log (/api/pen/prep-log). */
export type PrepFallback = { path: 'worker' | 'main-thread'; stage: 'start' | 'prep'; pct: number; error: string }

export type StreamExtra = {
  packets: number
  progressEvents: number
  path: 'worker' | 'main-thread'
  /** Samples clamped into [-1, 1] before the encoder. */
  clipped: number
  /** Attempts that failed before this one succeeded (empty normally). */
  fallbacks: PrepFallback[]
}

/** Every attempt failed; `trail` says how (the caller then uploads the original as it is). */
export class PrepFailed extends Error {
  trail: PrepFallback[]
  constructor(trail: PrepFallback[]) {
    super(trail.map((t) => `${t.path} at ${t.pct}%: ${t.error}`).join('; ') || 'prep failed')
    this.trail = trail
  }
}

/** The worker must say it's alive within this long, or the main thread does the work. */
export const WORKER_START_MS = 3000

type Done = { blob: Blob; durationSec: number; from: string; packets: number; clipped?: number }
class WorkerUnavailable extends Error {}

function toPrepared(file: File, m: Done, events: number, path: StreamExtra['path'], fallbacks: PrepFallback[] = []): Prepared & { extra: StreamExtra } {
  return {
    blob: m.blob,
    mime: 'audio/ogg',
    durationSec: m.durationSec,
    originalBytes: file.size,
    note: `${m.from === 'PCM' ? '' : `${m.from} → `}${fmtMB(file.size)} → ${fmtMB(m.blob.size)} (Opus)`,
    extra: { packets: m.packets, progressEvents: events, path, clipped: m.clipped ?? 0, fallbacks },
  }
}

const stalled = (ms: number) => new Error(`prep stalled: no progress for ${ms < 10_000 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)} s`)

/**
 * Long WAV → Ogg/Opus with progress. Tries the Web Worker first. If the worker can't start (or
 * has no encoder), or fails or stalls part-way through (an encoder error, or no progress for
 * `watchdogMs`), the same streaming code runs again from the start on the main thread, yielding
 * between slices. Only when that fails too does this reject (PrepFailed, with the trail), and the
 * caller uploads the original as it is. `mode` forces one path (tests); `fault` is a test hook.
 */
export async function streamPrepare(
  file: File,
  onProgress: (fraction: number) => void,
  opts: { watchdogMs?: number; startMs?: number; mode?: 'worker' | 'main-thread'; fault?: PrepFault } = {},
): Promise<Prepared & { extra: StreamExtra }> {
  const watchdogMs = opts.watchdogMs ?? PREP_WATCHDOG_MS
  const trail: PrepFallback[] = []
  if (opts.mode !== 'main-thread') {
    let pct = 0
    try {
      return await inWorker(file, (f) => { pct = Math.floor(f * 100); onProgress(f) }, watchdogMs, opts.startMs ?? WORKER_START_MS, opts.fault)
    } catch (e) {
      const msg = (e as Error).message
      if (opts.mode === 'worker') throw new PrepFailed([{ path: 'worker', stage: e instanceof WorkerUnavailable ? 'start' : 'prep', pct, error: msg }])
      // Couldn't start is routine on some browsers; failing part-way is the case worth logging.
      if (e instanceof WorkerUnavailable) console.warn('[pen] prep worker unavailable, preparing on the page instead:', msg)
      else console.warn(`[pen] prep worker failed at ${pct}%, preparing on the page instead:`, msg)
      trail.push({ path: 'worker', stage: e instanceof WorkerUnavailable ? 'start' : 'prep', pct, error: msg })
      onProgress(0)
    }
  }
  let pct = 0
  try {
    return await onMainThread(file, (f) => { pct = Math.floor(f * 100); onProgress(f) }, watchdogMs, trail, opts.mode === 'main-thread' ? opts.fault : undefined)
  } catch (e) {
    trail.push({ path: 'main-thread', stage: 'prep', pct, error: (e as Error).message })
    throw new PrepFailed(trail)
  }
}

function inWorker(file: File, onProgress: (f: number) => void, watchdogMs: number, startMs: number, fault?: PrepFault): Promise<Prepared & { extra: StreamExtra }> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      // Kept literally in this form: both webpack and Turbopack detect `new Worker(new URL(…))`
      // and compile the file as a worker entry.
      worker = new Worker(new URL('./prep.worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      return reject(new WorkerUnavailable((e as Error).message))
    }
    let events = 0
    let started = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (fn: () => void) => {
      clearTimeout(timer)
      worker.terminate()
      fn()
    }
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => finish(() => reject(stalled(watchdogMs))), watchdogMs)
    }
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: 'started' }
        | { type: 'progress'; done: number; total: number }
        | ({ type: 'done' } & Done)
        | { type: 'error'; message: string; noEncoder?: boolean }
      if (!started) {
        started = true
        arm()
      }
      if (m.type === 'progress') {
        events++
        arm()
        onProgress(m.total > 0 ? m.done / m.total : 0)
      } else if (m.type === 'done') {
        finish(() => resolve(toPrepared(file, m, events, 'worker')))
      } else if (m.type === 'error') {
        finish(() => reject(m.noEncoder ? new WorkerUnavailable(m.message) : new Error(m.message)))
      }
    }
    worker.onerror = (e) => {
      e.preventDefault?.()
      // Failing before saying anything = the script never ran (bad bundle, CSP, old browser).
      finish(() => reject(started ? new Error(e.message || 'prep worker failed') : new WorkerUnavailable(e.message || 'worker failed to load')))
    }
    timer = setTimeout(() => finish(() => reject(new WorkerUnavailable(`no answer from the worker in ${startMs} ms`))), startMs)
    worker.postMessage(fault ? { file, fault } : { file })
  })
}

async function onMainThread(file: File, onProgress: (f: number) => void, watchdogMs: number, trail: PrepFallback[], fault?: PrepFault): Promise<Prepared & { extra: StreamExtra }> {
  const { prepWavToOgg } = await import('./stream-encode')
  let events = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let stop: Error | null = null
  let rejectStall: (e: Error) => void = () => {}
  const stall = new Promise<never>((_, rej) => { rejectStall = rej })
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => { stop = stalled(watchdogMs); rejectStall(stop) }, watchdogMs)
  }
  arm()
  try {
    const work = prepWavToOgg(
      file,
      (done, total) => {
        if (stop) throw stop // the watchdog fired: end the loop at the next slice
        events++
        arm()
        onProgress(total > 0 ? done / total : 0)
      },
      { yieldEachSlice: true, fault },
    )
    work.catch(() => {})
    const m = await Promise.race([work, stall])
    return toPrepared(file, m, events, 'main-thread', trail)
  } finally {
    clearTimeout(timer)
  }
}
