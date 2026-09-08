'use client'

// Browser-side audio prep. Runs before upload for two reasons: pen files are far too big
// to push through a Vercel function (4.5MB body cap) and often too big for a free-tier
// storage bucket, and 16 kHz mono is all a speech model uses anyway.
//
// NOTE ON OPUS: true Opus output needs WebCodecs AudioEncoder plus a hand-written Ogg or
// WebM muxer, because AudioEncoder emits bare packets with no container and AssemblyAI
// needs a container. That is real, untestable-without-the-pen code, so v1 does the
// robust thing instead: decode, downmix to mono, resample to 16 kHz, re-emit 16-bit WAV.
// On a stereo 44.1/48 kHz source that is a 5-6x reduction with no quality loss that
// matters for speech. Files that are ALREADY compressed (mp3/m4a/opus off the pen) are
// passed through untouched, since re-encoding them would only lose information.

const TARGET_RATE = 16000

const PASSTHROUGH = /^audio\/(mpeg|mp3|mp4|aac|m4a|ogg|opus|webm|amr|3gpp)/i
const PASSTHROUGH_EXT = /\.(mp3|m4a|aac|ogg|opus|webm|amr|3gp|wma)$/i

export type Prepared = {
  blob: Blob
  mime: string
  durationSec: number
  originalBytes: number
  note: string
}

function isCompressed(file: File) {
  return PASSTHROUGH.test(file.type) || PASSTHROUGH_EXT.test(file.name)
}

/** 16-bit PCM WAV from an AudioBuffer's first channel. */
function bufferToWav(buf: AudioBuffer): Blob {
  const ch = buf.getChannelData(0)
  const bytes = 44 + ch.length * 2
  const out = new ArrayBuffer(bytes)
  const v = new DataView(out)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, bytes - 8, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, buf.sampleRate, true)
  v.setUint32(28, buf.sampleRate * 2, true) // byte rate
  v.setUint16(32, 2, true) // block align
  v.setUint16(34, 16, true) // bits
  str(36, 'data')
  v.setUint32(40, ch.length * 2, true)
  let o = 44
  for (let i = 0; i < ch.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, ch[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([out], { type: 'audio/wav' })
}

export async function prepareAudio(file: File): Promise<Prepared> {
  const originalBytes = file.size

  if (isCompressed(file)) {
    let durationSec = 0
    try {
      durationSec = await probeDuration(file)
    } catch {
      /* duration is cosmetic; AssemblyAI reports the real one */
    }
    return {
      blob: file,
      mime: file.type || 'audio/mpeg',
      durationSec,
      originalBytes,
      note: 'already compressed, uploaded as-is',
    }
  }

  // Uncompressed (WAV/PCM off the pen): decode → mono → 16 kHz → 16-bit WAV.
  const raw = await file.arrayBuffer()
  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const decodeCtx = new AC()
  let decoded: AudioBuffer
  try {
    decoded = await decodeCtx.decodeAudioData(raw.slice(0))
  } finally {
    void decodeCtx.close()
  }

  const frames = Math.ceil(decoded.duration * TARGET_RATE)
  const off = new OfflineAudioContext(1, frames, TARGET_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()

  const blob = bufferToWav(rendered)
  return {
    blob,
    mime: 'audio/wav',
    durationSec: decoded.duration,
    originalBytes,
    note: `${fmtMB(originalBytes)} → ${fmtMB(blob.size)} (mono 16 kHz)`,
  }
}

async function probeDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('audio')
    const url = URL.createObjectURL(file)
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(el.duration) ? el.duration : 0)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('could not read duration'))
    }
    el.src = url
  })
}

export function fmtMB(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function fmtDur(sec: number) {
  if (!sec || !Number.isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m < 60) return `${m}:${String(s).padStart(2, '0')}`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
