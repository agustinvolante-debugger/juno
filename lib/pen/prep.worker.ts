// Web Worker: a long WAV → Ogg/Opus at 16 kHz mono, off the main thread, in bounded memory.
// Driven by streamPrepare (stream-prep-client.ts). Messages out:
//   { type: 'progress', done, total }   bytes of audio data read so far
//   { type: 'done', blob, durationSec, from, packets }
//   { type: 'error', message }

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

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ file: File }>) => void) | null
  postMessage: (m: unknown) => void
}

scope.onmessage = async (e) => {
  try {
    scope.postMessage({ type: 'done', ...(await run(e.data.file)) })
  } catch (err) {
    scope.postMessage({ type: 'error', message: (err as Error)?.message || String(err) })
  }
}

async function run(file: File) {
  const Ctor = (globalThis as unknown as { AudioEncoder?: EncCtor }).AudioEncoder
  const DataCtor = (globalThis as unknown as { AudioData?: typeof AudioData }).AudioData
  if (!Ctor || !DataCtor) throw new Error('no AudioEncoder in this worker')

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
    read: (s, end) => file.slice(s, end).arrayBuffer(),
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
    onProgress: (done, total) => scope.postMessage({ type: 'progress', done, total }),
  })
  if (fill > 0) await emit(fill)
  await enc.flush()
  enc.close()
  if (failed) throw failed
  if (!packets) throw new Error('encoder produced nothing')

  const blob = ogg.finish()
  return { blob, durationSec: res.durationSec, from: res.from, packets }
}
