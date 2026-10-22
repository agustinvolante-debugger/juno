// Streaming WAV prep: read → decode → mono → 16 kHz, a slice at a time.
//
// Why (22 Oct): an hour of pen audio is ~87 MB of IMA ADPCM, and the old prep read it whole,
// decoded it whole on the main thread and resampled it whole — hundreds of MB to over a GB per
// file and minutes with the page frozen at "Preparing… 5%". Chris's 14 files: the two short ones
// went up, the twelve long ones sat there. This walks the file in ~1 MB slices instead, so memory
// stays flat however long the recording is. It has no DOM in it: the Web Worker
// (prep.worker.ts) drives it in the browser and the unit tests drive it in node.

import { decodeIma, decodeALaw, decodeMuLaw, readWavInfo, formatName, FMT_PCM, FMT_ALAW, FMT_MULAW, FMT_IMA_ADPCM, type WavInfo } from './wav'

const FMT_FLOAT = 3

export const STREAM_TARGET_RATE = 16000

/** Bytes read per step. Big enough that an hour is ~90 steps, small enough that each step's
 *  decoded floats are a few MB. Rounded down to whole blocks by the reader. */
export const STREAM_CHUNK_BYTES = 256 * 1024

export type WavHead = { info: WavInfo; dataStart: number; dataEnd: number }

/**
 * The format from the first bytes of the file. `readWavInfo` clamps the data length to the
 * buffer it was given, which for a header slice is meaningless, so the declared size is read
 * here and capped by the real file size (recorders that die mid-file leave it too big, or 0).
 */
export function readWavHead(head: ArrayBuffer, fileSize: number): WavHead | null {
  let info = readWavInfo(head)
  if (!info) return null
  // WAVE_FORMAT_EXTENSIBLE (field recorders, phones): the real format is the first two bytes of
  // the sub-format GUID, 24 bytes into the fmt chunk.
  if (info.formatTag === 0xfffe) {
    const v = new DataView(head)
    for (let p = 12; p + 8 <= head.byteLength; ) {
      const size = v.getUint32(p + 4, true)
      if (v.getUint32(p, false) === 0x666d7420 /* 'fmt ' */ && size >= 40 && p + 8 + 26 <= head.byteLength) {
        info = { ...info, formatTag: v.getUint16(p + 8 + 24, true) }
        break
      }
      p += 8 + size + (size % 2)
    }
  }
  const declared = new DataView(head).getUint32(info.dataOffset - 4, true)
  const dataStart = info.dataOffset
  const dataEnd = declared > 0 && declared !== 0xffffffff ? Math.min(fileSize, dataStart + declared) : fileSize
  return { info, dataStart, dataEnd }
}

/** Formats this decoder handles. Anything else goes the old way (or up as-is). */
export function streamable(info: WavInfo): boolean {
  const { formatTag: f, bitsPerSample: b, channels, sampleRate, blockAlign } = info
  if (channels < 1 || channels > 8 || sampleRate < 8000 || sampleRate > 192000 || blockAlign < 1) return false
  if (f === FMT_IMA_ADPCM) return blockAlign > 4 * channels && blockAlign % channels === 0
  if (f === FMT_ALAW || f === FMT_MULAW) return blockAlign === channels
  if (f === FMT_PCM) return (b === 8 || b === 16 || b === 24 || b === 32) && blockAlign === channels * (b / 8)
  if (f === FMT_FLOAT) return b === 32 && blockAlign === channels * 4
  return false
}

/**
 * Decodes the data chunk in arbitrary slices. Keeps the bytes of a block cut in half by a slice
 * boundary for the next call; IMA ADPCM's predictor state restarts every block, so whole blocks
 * decode independently and the output equals the whole-file decoder's exactly.
 */
export class WavChunkDecoder {
  private carry = new Uint8Array(0)
  readonly info: WavInfo
  constructor(info: WavInfo) {
    this.info = info
  }

  /** Whole blocks out of carry + bytes; the remainder is carried. */
  private whole(bytes: Uint8Array): Uint8Array {
    const ba = this.info.blockAlign
    let all = bytes
    if (this.carry.length) {
      all = new Uint8Array(this.carry.length + bytes.length)
      all.set(this.carry)
      all.set(bytes, this.carry.length)
    }
    const n = all.length - (all.length % ba)
    this.carry = all.slice(n)
    return all.subarray(0, n)
  }

  /** Interleaved 16-bit samples, for the formats the whole-file transcoder also produces. */
  pushInt16(bytes: Uint8Array): Int16Array {
    const w = this.whole(bytes)
    const f = this.info.formatTag
    if (f === FMT_IMA_ADPCM) return decodeIma(w, this.info)
    if (f === FMT_MULAW) return decodeMuLaw(w)
    if (f === FMT_ALAW) return decodeALaw(w)
    if (f === FMT_PCM && this.info.bitsPerSample === 16) {
      // Copy to an aligned buffer: a slice can start on an odd byte offset.
      const a = new Uint8Array(w.length)
      a.set(w)
      return new Int16Array(a.buffer, 0, w.length >> 1)
    }
    throw new Error(`pushInt16: ${formatName(f)} ${this.info.bitsPerSample}-bit`)
  }

  /** Mono floats in [-1, 1] at the source rate. */
  push(bytes: Uint8Array): Float32Array {
    const { formatTag: f, bitsPerSample: b, channels: ch } = this.info
    if (f === FMT_IMA_ADPCM || f === FMT_ALAW || f === FMT_MULAW || (f === FMT_PCM && b === 16)) {
      return int16ToMono(this.pushInt16(bytes), ch)
    }
    const w = this.whole(bytes)
    const v = new DataView(w.buffer, w.byteOffset, w.byteLength)
    const bps = b / 8
    const frames = w.length / (bps * ch)
    const out = new Float32Array(frames)
    for (let i = 0, o = 0; i < frames; i++) {
      let s = 0
      for (let c = 0; c < ch; c++, o += bps) {
        if (f === FMT_FLOAT) s += v.getFloat32(o, true)
        else if (b === 8) s += (w[o] - 128) / 128
        else if (b === 24) s += (((w[o] | (w[o + 1] << 8) | (w[o + 2] << 16)) << 8) >> 8) / 8388608
        else s += v.getInt32(o, true) / 2147483648
      }
      out[i] = s / ch
    }
    return out
  }
}

export function int16ToMono(s: Int16Array, ch: number): Float32Array {
  const frames = Math.floor(s.length / ch)
  const out = new Float32Array(frames)
  if (ch === 1) {
    for (let i = 0; i < frames; i++) out[i] = s[i] / 32768
    return out
  }
  const k = 1 / (32768 * ch)
  for (let i = 0, o = 0; i < frames; i++) {
    let acc = 0
    for (let c = 0; c < ch; c++) acc += s[o++]
    out[i] = acc * k
  }
  return out
}

/**
 * Streaming windowed-sinc resampler (Blackman window, polyphase table).
 *
 * The low-pass sits at 7 kHz with the stopband reached by ~8.4 kHz, so a 48 kHz pen file loses
 * nothing speech uses and nothing above 8 kHz folds back in as hiss. 48k→16k and 32k→16k are
 * integer ratios and use a single phase (plain filter-and-decimate); 44.1k and other rates use
 * 256 phases. Each output sample is a 2·H-tap dot product, H = 16 output periods of input.
 */
export class Resampler {
  readonly inRate: number
  readonly outRate: number
  private readonly half: number // taps either side of the centre, in input samples
  private readonly phases: number
  private readonly table: Float32Array // phases × (2·half) taps
  private buf = new Float32Array(0)
  private bufStart = 0 // absolute input index of buf[0]
  private inCount = 0 // input samples received
  private outCount = 0 // output samples produced

  constructor(inRate: number, outRate = STREAM_TARGET_RATE, cutoffHz = Math.min(7000, outRate * 0.4375)) {
    this.inRate = inRate
    this.outRate = outRate
    const ratio = inRate / outRate
    const down = ratio > 1
    this.half = Math.ceil(16 * Math.max(1, ratio))
    this.phases = inRate % outRate === 0 ? 1 : 256
    const fc = down ? cutoffHz / inRate : Math.min(cutoffHz, inRate * 0.4375) / inRate // cycles per input sample
    const taps = 2 * this.half
    this.table = new Float32Array(this.phases * taps)
    for (let p = 0; p < this.phases; p++) {
      const frac = p / this.phases
      let sum = 0
      for (let j = 0; j < taps; j++) {
        const t = j - this.half + 1 - frac // distance from the output position, in input samples
        const x = 2 * fc * t
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
        const u = (t + this.half) / (2 * this.half) // 0..1 across the window
        const win = u <= 0 || u >= 1 ? 0 : 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u)
        const h = 2 * fc * sinc * win
        this.table[p * taps + j] = h
        sum += h
      }
      for (let j = 0; j < taps; j++) this.table[p * taps + j] /= sum // unity gain at DC
    }
  }

  /** Output samples the input so far fully determines. */
  push(input: Float32Array): Float32Array {
    // Append. The buffer only ever holds the filter's history plus this slice.
    const merged = new Float32Array(this.buf.length + input.length)
    merged.set(this.buf)
    merged.set(input, this.buf.length)
    this.buf = merged
    this.inCount += input.length
    return this.drain(false)
  }

  /** The tail: pads with silence so the last samples come out. */
  flush(): Float32Array {
    return this.drain(true)
  }

  private drain(final: boolean): Float32Array {
    const { inRate, outRate, half, phases, table } = this
    const taps = 2 * half
    const totalOut = Math.ceil((this.inCount * outRate) / inRate)
    // Every output n here has n·in/out < inCount, so this never overflows.
    const res = new Float32Array(Math.max(0, totalOut - this.outCount))
    const buf = this.buf
    const len = buf.length
    let w = 0
    while (this.outCount < totalOut) {
      // Integer arithmetic for the position, so an hour doesn't drift: n·in/out exactly.
      const num = this.outCount * inRate
      let base = Math.floor(num / outRate)
      let p = Math.round(((num - base * outRate) / outRate) * phases)
      if (p === phases) { p = 0; base += 1 }
      if (!final && base + half >= this.inCount) break // needs input not here yet
      const row = p * taps
      const k0 = base - half + 1 - this.bufStart
      let acc = 0
      if (k0 >= 0 && k0 + taps <= len) {
        for (let j = 0; j < taps; j++) acc += buf[k0 + j] * table[row + j]
      } else {
        // Start of the file or the padded tail: missing samples count as silence.
        for (let j = 0; j < taps; j++) {
          const k = k0 + j
          if (k >= 0 && k < len) acc += buf[k] * table[row + j]
        }
      }
      res[w++] = acc
      this.outCount++
    }
    // Keep only what the next output can still reach.
    const nextFirst = Math.floor((this.outCount * inRate) / outRate) - half + 1
    const drop = Math.max(0, Math.min(len, nextFirst - this.bufStart))
    if (drop > 0) {
      this.buf = buf.slice(drop)
      this.bufStart += drop
    }
    return res.subarray(0, w)
  }
}

export type StreamPrepResult = {
  from: string
  sourceRate: number
  channels: number
  sourceFrames: number
  outFrames: number
  durationSec: number
}

/**
 * The whole read → decode → mono → 16 kHz loop, minus the encoder. `read` returns bytes
 * [start, end) of the file; `sink` gets each run of 16 kHz samples and may be async (the encoder
 * applies back-pressure there). Throws on a format it can't handle, before reading the body.
 */
export async function streamWavTo16k(opts: {
  size: number
  read: (start: number, end: number) => Promise<ArrayBuffer>
  sink: (pcm16k: Float32Array) => void | Promise<void>
  onProgress?: (done: number, total: number) => void
  chunkBytes?: number
}): Promise<StreamPrepResult> {
  const head = readWavHead(await opts.read(0, Math.min(opts.size, 64 * 1024)), opts.size)
  if (!head) throw new Error('not a WAV file we can read')
  const { info, dataStart, dataEnd } = head
  if (!streamable(info)) throw new Error(`unsupported WAV: ${formatName(info.formatTag)} ${info.bitsPerSample}-bit`)

  const dec = new WavChunkDecoder(info)
  const rs = new Resampler(info.sampleRate, STREAM_TARGET_RATE)
  const step = Math.max(info.blockAlign, (opts.chunkBytes ?? STREAM_CHUNK_BYTES) - ((opts.chunkBytes ?? STREAM_CHUNK_BYTES) % info.blockAlign))
  const total = dataEnd - dataStart
  let sourceFrames = 0
  let outFrames = 0

  for (let pos = dataStart; pos < dataEnd; pos += step) {
    const end = Math.min(dataEnd, pos + step)
    const mono = dec.push(new Uint8Array(await opts.read(pos, end)))
    sourceFrames += mono.length
    const out = rs.push(mono)
    outFrames += out.length
    if (out.length) await opts.sink(out)
    opts.onProgress?.(end - dataStart, total)
  }
  const tail = rs.flush()
  outFrames += tail.length
  if (tail.length) await opts.sink(tail)
  if (!sourceFrames) throw new Error('no audio in that file')

  return {
    from: formatName(info.formatTag),
    sourceRate: info.sampleRate,
    channels: info.channels,
    sourceFrames,
    outFrames,
    durationSec: sourceFrames / info.sampleRate,
  }
}
