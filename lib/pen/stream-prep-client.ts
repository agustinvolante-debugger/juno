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

export type StreamExtra = { packets: number; progressEvents: number }

export function streamPrepare(
  file: File,
  onProgress: (fraction: number) => void,
  opts: { watchdogMs?: number } = {},
): Promise<Prepared & { extra: StreamExtra }> {
  const watchdogMs = opts.watchdogMs ?? PREP_WATCHDOG_MS
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./prep.worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      return reject(e)
    }
    let events = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (fn: () => void) => {
      clearTimeout(timer)
      worker.terminate()
      fn()
    }
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => finish(() => reject(new Error(`prep stalled: no progress for ${Math.round(watchdogMs / 1000)} s`))), watchdogMs)
    }
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: 'progress'; done: number; total: number }
        | { type: 'done'; blob: Blob; durationSec: number; from: string; packets: number }
        | { type: 'error'; message: string }
      if (m.type === 'progress') {
        events++
        arm()
        onProgress(m.total > 0 ? m.done / m.total : 0)
      } else if (m.type === 'done') {
        finish(() =>
          resolve({
            blob: m.blob,
            mime: 'audio/ogg',
            durationSec: m.durationSec,
            originalBytes: file.size,
            note: `${m.from === 'PCM' ? '' : `${m.from} → `}${fmtMB(file.size)} → ${fmtMB(m.blob.size)} (Opus)`,
            extra: { packets: m.packets, progressEvents: events },
          }),
        )
      } else {
        finish(() => reject(new Error(m.message)))
      }
    }
    worker.onerror = (e) => {
      e.preventDefault?.()
      finish(() => reject(new Error(e.message || 'prep worker failed')))
    }
    arm()
    worker.postMessage({ file })
  })
}

