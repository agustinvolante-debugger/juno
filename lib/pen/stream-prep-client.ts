'use client'

// Page side of the streaming prep (prep.worker.ts). One call = one worker, ended when the file
// is done, fails, or stops moving.

import { fmtMB, type Prepared } from './encode'

/** WAVs above this go through the worker; smaller ones keep the old in-memory path (fast and
 *  proven for short files). ~8.5 minutes of pen ADPCM. */
export const STREAM_ABOVE = 12 * 1024 * 1024

/** No progress for this long during prep = give up and send the original. */
export const PREP_WATCHDOG_MS = 60_000

const WAV_NAME = /\.(wav|wave)$/i
const WAV_MIME = /^audio\/(wav|wave|x-wav|x-pn-wav|vnd\.wave)$/i

function canStreamHere(): boolean {
  return typeof Worker === 'function' && typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder === 'function'
}

/** A long WAV on a browser with Workers + WebCodecs. Phones included: memory stays bounded. */
export function canStreamPrep(file: File, above = STREAM_ABOVE): boolean {
  return canStreamHere() && file.size > above && (WAV_NAME.test(file.name) || WAV_MIME.test(file.type))
}

export type StreamExtra = { packets: number; progressEvents: number; path: 'worker' | 'main-thread' }

/** The worker must say it's alive within this long, or the main thread does the work. */
export const WORKER_START_MS = 3000

type Done = { blob: Blob; durationSec: number; from: string; packets: number }
class WorkerUnavailable extends Error {}

function toPrepared(file: File, m: Done, events: number, path: StreamExtra['path']): Prepared & { extra: StreamExtra } {
  return {
    blob: m.blob,
    mime: 'audio/ogg',
    durationSec: m.durationSec,
    originalBytes: file.size,
    note: `${m.from === 'PCM' ? '' : `${m.from} → `}${fmtMB(file.size)} → ${fmtMB(m.blob.size)} (Opus)`,
    extra: { packets: m.packets, progressEvents: events, path },
  }
}

const stalled = (ms: number) => new Error(`prep stalled: no progress for ${Math.round(ms / 1000)} s`)

/**
 * Long WAV → Ogg/Opus with progress. Tries the Web Worker; if it can't start, or doesn't answer
 * within WORKER_START_MS, or has no encoder, the same streaming code runs on the main thread,
 * yielding between slices. Either way, no progress for `watchdogMs` rejects (the caller then
 * uploads the original as-is). `mode` forces one path (tests).
 */
export async function streamPrepare(
  file: File,
  onProgress: (fraction: number) => void,
  opts: { watchdogMs?: number; startMs?: number; mode?: 'worker' | 'main-thread' } = {},
): Promise<Prepared & { extra: StreamExtra }> {
  const watchdogMs = opts.watchdogMs ?? PREP_WATCHDOG_MS
  if (opts.mode !== 'main-thread') {
    try {
      return await inWorker(file, onProgress, watchdogMs, opts.startMs ?? WORKER_START_MS)
    } catch (e) {
      if (!(e instanceof WorkerUnavailable) || opts.mode === 'worker') throw e
      console.warn('[pen] prep worker unavailable, preparing on the page instead:', e.message)
    }
  }
  return onMainThread(file, onProgress, watchdogMs)
}

function inWorker(file: File, onProgress: (f: number) => void, watchdogMs: number, startMs: number): Promise<Prepared & { extra: StreamExtra }> {
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
    worker.postMessage({ file })
  })
}

async function onMainThread(file: File, onProgress: (f: number) => void, watchdogMs: number): Promise<Prepared & { extra: StreamExtra }> {
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
      { yieldEachSlice: true },
    )
    work.catch(() => {})
    const m = await Promise.race([work, stall])
    return toPrepared(file, m, events, 'main-thread')
  } finally {
    clearTimeout(timer)
  }
}
