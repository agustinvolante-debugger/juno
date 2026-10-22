// Long WAV → Ogg/Opus at 16 kHz mono in bounded memory: the streaming decoder/resampler
// (stream-prep.ts) feeding WebCodecs' AudioEncoder and the incremental Ogg writer. Runs in the
// Web Worker (prep.worker.ts) normally, or on the main thread when the worker can't start
// (stream-prep-client.ts), in which case `yieldEachSlice` hands the event loop back between
// slices so the page stays responsive.

import { streamWavTo16k, STREAM_TARGET_RATE } from './stream-prep'
import { OggOpusWriter } from './ogg'

const OPUS_BITRATE = 24000 // same as encode.ts: speech at 24 kbps mono, ~11 MB an hour
const FRAME = STREAM_TARGET_RATE // 1 s per AudioData
const MAX_QUEUE = 4 // encoder back-pressure: at most ~4 s of audio waiting

type Enc = {
  configure: (c: { codec: string; sampleRate: number; numberOfChannels: number; bitrate: number }) => void
  encode: (d: AudioData) => void
  flush: () => Promise<void>
  close: () => void
  encodeQueueSize: number
}
type EncCtor = new (init: {
  output: (chunk: EncodedAudioChunk, meta?: { decoderConfig?: { description?: BufferSource } }) => void
  error: (e: DOMException) => void
}) => Enc

export class NoEncoderError extends Error {}

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
  opts: { yieldEachSlice?: boolean } = {},
): Promise<{ blob: Blob; durationSec: number; from: string; packets: number }> {
  const Ctor = (globalThis as unknown as { AudioEncoder?: EncCtor }).AudioEncoder
  const DataCtor = (globalThis as unknown as { AudioData?: typeof AudioData }).AudioData
  if (!Ctor || !DataCtor) throw new NoEncoderError('no AudioEncoder here')

  // Pre-skip starts at 80 ms at 48 kHz, overridden by the encoder's OpusHead when it gives one.
  const ogg = new OggOpusWriter(1, STREAM_TARGET_RATE, 3840)
  let packets = 0
  let failed: Error | null = null

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
    },
    error: (err) => {
      failed = err instanceof Error ? err : new Error(String(err))
    },
  })
  enc.configure({ codec: 'opus', sampleRate: STREAM_TARGET_RATE, numberOfChannels: 1, bitrate: OPUS_BITRATE })

  // 16 kHz samples collect here until a full second is ready.
  const frame = new Float32Array(FRAME)
  let fill = 0
  let fed = 0

  const emit = async (n: number) => {
    if (failed) throw failed
    const data = frame.slice(0, n)
    const ad = new DataCtor({
      format: 'f32-planar',
      sampleRate: STREAM_TARGET_RATE,
      numberOfFrames: n,
      numberOfChannels: 1,
      timestamp: Math.round((fed / STREAM_TARGET_RATE) * 1e6),
      data,
    })
    enc.encode(ad)
    ad.close()
    fed += n
    // Decoding outruns Opus; without this the queue would hold the whole recording.
    while (enc.encodeQueueSize > MAX_QUEUE) {
      await new Promise((r) => setTimeout(r, 2))
      if (failed) throw failed
    }
  }

  const res = await streamWavTo16k({
    size: file.size,
    read: async (s, end) => {
      if (opts.yieldEachSlice) await macrotask()
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
  if (fill > 0) await emit(fill)
  await enc.flush()
  enc.close()
  if (failed) throw failed
  if (!packets) throw new Error('encoder produced nothing')

  const blob = ogg.finish()
  return { blob, durationSec: res.durationSec, from: res.from, packets }
}
