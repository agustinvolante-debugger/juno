// Long WAV → Ogg/Opus at 16 kHz mono in bounded memory: the streaming decoder/resampler
// (stream-prep.ts) feeding WebCodecs' AudioEncoder and the incremental Ogg writer. Runs in the
// Web Worker (prep.worker.ts) normally, or on the main thread when the worker can't start
// (stream-prep-client.ts), in which case `yieldEachSlice` hands the event loop back between
// slices so the page stays responsive.

import { streamWavTo16k, STREAM_TARGET_RATE } from './stream-prep'
import { OggOpusWriter } from './ogg'
import { StallClock, WATCHDOG_CAP_MS, WATCHDOG_GRACE_MS } from './watchdog'

const OPUS_BITRATE = 24000 // same as encode.ts: speech at 24 kbps mono, ~11 MB an hour
const FRAME = STREAM_TARGET_RATE // 1 s per AudioData
const MAX_QUEUE = 4 // encoder back-pressure: at most ~4 s of audio waiting
/**
 * And at most this much audio fed but not yet back out as Opus. encodeQueueSize alone is not
 * enough: Chrome takes frames off that queue as soon as its codec thread accepts them, so on the
 * real 54-minute file reading hit 100% at 27 s and the encoder was still working through the
 * backlog until 53 s, with no progress for the last 26 s (it looked exactly like a stall, and a
 * 20 s watchdog killed it). Pacing on the output keeps the percent honest and the tail short.
 */
const MAX_LAG_US = 8_000_000
/** The encoder's queue not moving for this long = it has hung (it never errored, it just stopped
 *  taking work). Normally the queue drains in milliseconds. VISIBLE time only (23 Oct): a hidden
 *  tab runs WebCodecs and timers at a lower priority, and that is not a hang; hidden time counts
 *  towards ENCODER_STUCK_CAP_MS instead (lib/pen/watchdog.ts). */
export const ENCODER_STUCK_MS = 10_000
export const ENCODER_STUCK_CAP_MS = WATCHDOG_CAP_MS

type Enc = {
  configure: (c: { codec: string; sampleRate: number; numberOfChannels: number; bitrate: number }) => void
  encode: (d: AudioData) => void
  flush: () => Promise<void>
  close: () => void
  encodeQueueSize: number
  state?: string
}
type EncCtor = new (init: {
  output: (chunk: EncodedAudioChunk, meta?: { decoderConfig?: { description?: BufferSource } }) => void
  error: (e: DOMException) => void
}) => Enc

export class NoEncoderError extends Error {}

/** Test hooks (the dev harness and the unit test): make the encoder fail, or the read hang, once
 *  this fraction of the file has been read. Never set by the app. */
export type PrepFault = { encoderErrorAt?: number; hangAt?: number }

/**
 * Samples for the encoder: finite and inside [-1, 1]. The resampler's low-pass rings on audio
 * the pen already clipped (measured on a real 54-minute file: peaks of 1.42), and NaN from a
 * damaged block would poison every Opus frame after it. Returns how many samples it changed.
 */
export function clampInPlace(x: Float32Array, from = 0, to = x.length): number {
  let n = 0
  for (let i = from; i < to; i++) {
    const v = x[i]
    if (v > 1) { x[i] = 1; n++ }
    else if (v < -1) { x[i] = -1; n++ }
    else if (v !== v) { x[i] = 0; n++ } // NaN
  }
  return n
}

/** A real macrotask (not a microtask), so rendering and input get a turn. */
function macrotask(): Promise<void> {
  return new Promise((r) => {
    if (typeof MessageChannel === 'function') {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => { ch.port1.close(); r() }
      ch.port2.postMessage(0)
    } else setTimeout(r, 0)
  })
}

export async function prepWavToOgg(
  file: Blob,
  onProgress: (done: number, total: number) => void,
  opts: {
    yieldEachSlice?: boolean
    fault?: PrepFault
    /** Is the page hidden right now? The worker hears it from the page; absent = always visible. */
    hidden?: () => boolean
    /** Test hooks for the stuck check. */
    stuckMs?: number
    now?: () => number
  } = {},
): Promise<{ blob: Blob; durationSec: number; from: string; packets: number; clipped: number }> {
  const Ctor = (globalThis as unknown as { AudioEncoder?: EncCtor }).AudioEncoder
  const DataCtor = (globalThis as unknown as { AudioData?: typeof AudioData }).AudioData
  if (!Ctor || !DataCtor) throw new NoEncoderError('no AudioEncoder here')

  // Pre-skip starts at 80 ms at 48 kHz, overridden by the encoder's OpusHead when it gives one.
  const ogg = new OggOpusWriter(1, STREAM_TARGET_RATE, 3840)
  let packets = 0
  let clipped = 0
  let encodedUs = 0 // end of the latest Opus packet out
  let failed: Error | null = null
  // Back-pressure waits wake on the encoder's own output (and dequeue), not only on a timer: a
  // hidden page's timers are clamped to 1 s or worse, and the encoder keeps calling back.
  let wake: (() => void) | null = null
  const nudge = () => { const w = wake; wake = null; w?.() }
  const waitTick = () => new Promise<void>((r) => {
    wake = r
    setTimeout(() => { if (wake === r) wake = null; r() }, 2)
  })
  const hidden = opts.hidden ?? (() => false)
  const now = opts.now ?? Date.now
  const stuckMs = opts.stuckMs ?? ENCODER_STUCK_MS
  // An encoder error ends the prep AT ONCE (the whole loop races this), rather than whenever the
  // loop next happens to look, or never if it is parked on a read.
  let rejectFailed: (e: Error) => void = () => {}
  const failure = new Promise<never>((_, rej) => { rejectFailed = rej })
  failure.catch(() => {})
  const fail = (e: unknown) => {
    if (failed) return
    failed = e instanceof Error ? e : new Error(`encoder error: ${String((e as { message?: string })?.message ?? e)}`)
    rejectFailed(failed)
  }

  const enc = new Ctor({
    output: (chunk, meta) => {
      const desc = meta?.decoderConfig?.description
      if (desc) {
        const d = desc instanceof ArrayBuffer ? new Uint8Array(desc) : new Uint8Array((desc as ArrayBufferView).buffer)
        if (d.length >= 12 && String.fromCharCode(...d.slice(0, 8)) === 'OpusHead') ogg.preSkip = d[10] | (d[11] << 8)
      }
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      const endUs = chunk.timestamp + (chunk.duration ?? 0)
      ogg.add({ data, granule: Math.round((endUs * 48000) / 1e6) })
      packets++
      if (endUs > encodedUs) encodedUs = endUs
      nudge()
    },
    error: (err) => fail(err instanceof Error ? new Error(`encoder error: ${err.message}`) : err),
  })
  try { (enc as unknown as { ondequeue: (() => void) | null }).ondequeue = nudge } catch {}
  try {
    enc.configure({ codec: 'opus', sampleRate: STREAM_TARGET_RATE, numberOfChannels: 1, bitrate: OPUS_BITRATE })
  } catch (e) {
    throw new NoEncoderError(`opus encoder refused: ${(e as Error).message}`)
  }

  // 16 kHz samples collect here until a full second is ready.
  const frame = new Float32Array(FRAME)
  let fill = 0
  let fed = 0

  const emit = async (n: number) => {
    if (failed) throw failed
    if (enc.state === 'closed') { fail(new Error('encoder closed itself')); throw failed! }
    const data = frame.slice(0, n)
    clipped += clampInPlace(data)
    const ad = new DataCtor({
      format: 'f32-planar',
      sampleRate: STREAM_TARGET_RATE,
      numberOfFrames: n,
      numberOfChannels: 1,
      timestamp: Math.round((fed / STREAM_TARGET_RATE) * 1e6),
      data,
    })
    try {
      enc.encode(ad)
    } catch (e) {
      fail(new Error(`encoder refused a frame: ${(e as Error).message}`))
      throw failed!
    } finally {
      ad.close()
    }
    fed += n
    // Decoding outruns Opus; without this the encoder would hold the whole recording. An encoder
    // that stops producing altogether has hung: say so now instead of waiting on the watchdog.
    const fedUs = (fed / STREAM_TARGET_RATE) * 1e6
    let clock: StallClock | null = null
    let lastQ = enc.encodeQueueSize
    let lastOut = encodedUs
    while (enc.encodeQueueSize > MAX_QUEUE || fedUs - encodedUs > MAX_LAG_US) {
      clock ??= new StallClock(now, hidden(), WATCHDOG_GRACE_MS)
      await waitTick()
      if (failed) throw failed
      clock.setHidden(hidden())
      if (enc.encodeQueueSize !== lastQ || encodedUs !== lastOut) { lastQ = enc.encodeQueueSize; lastOut = encodedUs; clock.kick() }
      else {
        const r = clock.read()
        if (r.visibleMs > stuckMs || r.wallMs > ENCODER_STUCK_CAP_MS) {
          const secs = Math.round((r.visibleMs > stuckMs ? stuckMs : r.wallMs) / 1000)
          fail(new Error(`encoder stopped: no output for ${secs} s${r.visibleMs > stuckMs ? '' : ' (tab in the background)'} (queue ${lastQ}, ${Math.round((fedUs - encodedUs) / 1e6)} s behind)`))
          throw failed!
        }
      }
    }
  }

  const fault = opts.fault

  const work = streamWavTo16k({
    size: file.size,
    read: async (s, end) => {
      if (opts.yieldEachSlice) await macrotask()
      if (fault && s > 0) {
        const at = s / file.size
        if (fault.encoderErrorAt !== undefined && at >= fault.encoderErrorAt) fail(new Error('encoder error: simulated (test)'))
        if (fault.hangAt !== undefined && at >= fault.hangAt) await new Promise(() => {})
      }
      return file.slice(s, end).arrayBuffer()
    },
    sink: async (pcm) => {
      let i = 0
      while (i < pcm.length) {
        const take = Math.min(FRAME - fill, pcm.length - i)
        frame.set(pcm.subarray(i, i + take), fill)
        fill += take
        i += take
        if (fill === FRAME) {
          await emit(FRAME)
          fill = 0
        }
      }
    },
    onProgress,
  })
  work.catch(() => {})
  try {
    const res = await Promise.race([work, failure])
    if (fill > 0) await Promise.race([emit(fill), failure])
    await Promise.race([
      enc.flush().catch((e: Error) => { fail(new Error(`encoder flush failed: ${e?.message ?? e}`)); throw failed! }),
      failure,
    ])
    if (failed) throw failed
    if (!packets) throw new Error('encoder produced nothing')
    const blob = ogg.finish()
    return { blob, durationSec: res.durationSec, from: res.from, packets, clipped }
  } finally {
    try { if (enc.state !== 'closed') enc.close() } catch {}
  }
}
