// WAV formats that browsers refuse.
//
// The pen records IMA ADPCM — 4-bit, 48 kHz, mono — because it quarters the file size against
// PCM and cheap recorders care about hours-per-card. `decodeAudioData` handles PCM and a few
// compressed containers; it does not handle ADPCM in a WAV, in any browser. So the recorder's
// own native format failed at the very first step with "couldn't be decoded", which read like
// a corrupt file and was nothing of the sort.
//
// Decoding it is a small, fully specified algorithm, so we do it here and hand the rest of the
// pipeline ordinary PCM. A-law and mu-law are included because the same class of recorder
// often uses them and they cost fifteen lines each.

const FMT_PCM = 1
const FMT_ALAW = 6
const FMT_MULAW = 7
const FMT_IMA_ADPCM = 17

export type WavInfo = {
  formatTag: number
  channels: number
  sampleRate: number
  bitsPerSample: number
  blockAlign: number
  dataOffset: number
  dataLength: number
}

const IMA_STEP = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66,
  73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408,
  449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
  2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630,
  9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
]
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]

/** Walks the RIFF chunk list. Recorders emit `fact` and padding chunks; assuming a fixed
 *  44-byte header is the classic way to misread one. */
export function readWavInfo(buf: ArrayBuffer): WavInfo | null {
  const v = new DataView(buf)
  if (buf.byteLength < 12) return null
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null

  let p = 12
  let fmt: Partial<WavInfo> = {}
  let dataOffset = -1
  let dataLength = 0

  while (p + 8 <= buf.byteLength) {
    const id = tag(p)
    const size = v.getUint32(p + 4, true)
    const body = p + 8
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        formatTag: v.getUint16(body, true),
        channels: v.getUint16(body + 2, true),
        sampleRate: v.getUint32(body + 4, true),
        blockAlign: v.getUint16(body + 12, true),
        bitsPerSample: v.getUint16(body + 14, true),
      }
    } else if (id === 'data') {
      dataOffset = body
      // Some recorders write a data size larger than the file; trust the file.
      dataLength = Math.min(size, buf.byteLength - body)
    }
    p = body + size + (size % 2) // chunks are word-aligned
  }

  if (dataOffset < 0 || fmt.formatTag === undefined) return null
  return { ...(fmt as Omit<WavInfo, 'dataOffset' | 'dataLength'>), dataOffset, dataLength }
}

/** True when the browser's own decoder will refuse this file. */
export function needsManualDecode(info: WavInfo): boolean {
  return info.formatTag === FMT_IMA_ADPCM || info.formatTag === FMT_ALAW || info.formatTag === FMT_MULAW
}

export function formatName(tag: number): string {
  return (
    { [FMT_PCM]: 'PCM', 2: 'MS ADPCM', [FMT_ALAW]: 'A-law', [FMT_MULAW]: 'mu-law', [FMT_IMA_ADPCM]: 'IMA ADPCM', 85: 'MP3', 0xfffe: 'extensible' }[tag] ??
    `format ${tag}`
  )
}

/** IMA ADPCM. Each block opens with a 4-byte header carrying the first sample and the step
 *  index; the rest is 4-bit nibbles, low nibble first. Channels interleave per block. */
function decodeIma(bytes: Uint8Array, info: WavInfo): Int16Array {
  const { channels, blockAlign } = info
  const perChannelBytes = blockAlign / channels
  const samplesPerBlock = (perChannelBytes - 4) * 2 + 1
  const blocks = Math.floor(bytes.length / blockAlign)
  const out = new Int16Array(blocks * samplesPerBlock * channels)

  let w = 0
  for (let b = 0; b < blocks; b++) {
    const base = b * blockAlign
    const pred = new Int32Array(channels)
    const idx = new Int32Array(channels)

    for (let c = 0; c < channels; c++) {
      const h = base + c * perChannelBytes
      pred[c] = (bytes[h] | (bytes[h + 1] << 8)) << 16 >> 16 // signed 16-bit
      idx[c] = Math.min(88, Math.max(0, bytes[h + 2]))
      out[w + c] = pred[c] // the header sample is the block's first output
    }
    w += channels

    // Remaining samples: 4 bytes (8 nibbles) per channel at a time for multi-channel, but a
    // mono file — which is every pen recording — is simply a nibble stream.
    for (let s = 1; s < samplesPerBlock; s++) {
      for (let c = 0; c < channels; c++) {
        const n = s - 1
        const byteIndex = base + c * perChannelBytes + 4 + (n >> 1)
        if (byteIndex >= bytes.length) break
        const nib = n & 1 ? (bytes[byteIndex] >> 4) & 0x0f : bytes[byteIndex] & 0x0f

        const step = IMA_STEP[idx[c]]
        let diff = step >> 3
        if (nib & 1) diff += step >> 2
        if (nib & 2) diff += step >> 1
        if (nib & 4) diff += step
        pred[c] += nib & 8 ? -diff : diff
        if (pred[c] > 32767) pred[c] = 32767
        else if (pred[c] < -32768) pred[c] = -32768

        idx[c] += IMA_INDEX[nib]
        if (idx[c] < 0) idx[c] = 0
        else if (idx[c] > 88) idx[c] = 88

        out[w + c] = pred[c]
      }
      w += channels
    }
  }
  return out.subarray(0, w)
}

function decodeMuLaw(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    const u = ~bytes[i] & 0xff
    const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4)
    out[i] = u & 0x80 ? 0x84 - t : t - 0x84
  }
  return out
}

function decodeALaw(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    let a = bytes[i] ^ 0x55
    const sign = a & 0x80
    if (sign) a &= 0x7f
    const exp = (a & 0x70) >> 4
    let val = exp ? ((a & 0x0f) + 16) << (exp + 3) : ((a & 0x0f) << 4) + 8
    out[i] = sign ? -val : val
  }
  return out
}

/** Re-wraps decoded samples as an ordinary 16-bit PCM WAV, which every browser can read. */
export function toPcmWav(samples: Int16Array, channels: number, sampleRate: number): ArrayBuffer {
  const out = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(out)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  new Int16Array(out, 44).set(samples)
  return out
}

/** Returns a PCM WAV the browser can decode, or null if no conversion was needed. */
export function transcodeWav(buf: ArrayBuffer): { wav: ArrayBuffer; from: string } | null {
  const info = readWavInfo(buf)
  if (!info || !needsManualDecode(info)) return null
  const bytes = new Uint8Array(buf, info.dataOffset, info.dataLength)
  const samples =
    info.formatTag === FMT_IMA_ADPCM ? decodeIma(bytes, info)
    : info.formatTag === FMT_MULAW ? decodeMuLaw(bytes)
    : decodeALaw(bytes)
  return { wav: toPcmWav(samples, info.channels, info.sampleRate), from: formatName(info.formatTag) }
}
