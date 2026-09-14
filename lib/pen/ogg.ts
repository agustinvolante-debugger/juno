// Ogg container for Opus packets.
//
// Why this exists: the pen records WAV, and WAV is the one format that gets no benefit from
// our decode-to-mono-16kHz step — it comes out the same size it went in. Supabase caps a
// stored object at 50MB (verified: a 60MB PUT returns EntityTooLarge), so a WAV over about
// 24 minutes simply could not be uploaded. Opus at 24kbps turns half an hour of speech into
// roughly 5MB.
//
// WebCodecs' AudioEncoder emits bare Opus packets with no container, and AssemblyAI needs a
// container, so we write Ogg pages ourselves. It is ~150 lines and avoids a dependency.
//
// Reference: RFC 3533 (Ogg) and RFC 7845 (Opus in Ogg).

const OGG_MAGIC = [0x4f, 0x67, 0x67, 0x53] // "OggS"

/**
 * Ogg's CRC is unusual: polynomial 0x04c11db7, no input/output reflection, zero init, no
 * final XOR. A standard CRC-32 routine produces the wrong value here.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0
    t[i] = r >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0
  for (let i = 0; i < buf.length; i++) c = ((c << 8) >>> 0) ^ CRC_TABLE[((c >>> 24) ^ buf[i]) & 0xff]
  return c >>> 0
}

/** One Ogg page. `segments` must already satisfy the 255-segment / 255-byte lacing rules. */
function page(opts: {
  headerType: number
  granule: number
  serial: number
  sequence: number
  segments: number[]
  body: Uint8Array
}): Uint8Array {
  const out = new Uint8Array(27 + opts.segments.length + opts.body.length)
  const v = new DataView(out.buffer)
  out.set(OGG_MAGIC, 0)
  out[4] = 0 // stream structure version
  out[5] = opts.headerType

  // Granule position is 64-bit; JS numbers hold this exactly well past any recording length.
  v.setUint32(6, opts.granule >>> 0, true)
  v.setUint32(10, Math.floor(opts.granule / 0x100000000), true)
  v.setUint32(14, opts.serial, true)
  v.setUint32(18, opts.sequence, true)
  v.setUint32(22, 0, true) // CRC placeholder — must be zero while computing
  out[26] = opts.segments.length
  out.set(opts.segments, 27)
  out.set(opts.body, 27 + opts.segments.length)

  v.setUint32(22, crc32(out), true)
  return out
}

/** Lacing: a packet becomes 255-byte segments, terminated by one under 255. */
function lace(len: number): number[] {
  const segs: number[] = []
  let n = len
  while (n >= 255) {
    segs.push(255)
    n -= 255
  }
  segs.push(n) // a trailing 0 is required when len is an exact multiple of 255
  return segs
}

/** RFC 7845 identification header. 19 bytes, mapping family 0. */
function opusHead(channels: number, preSkip: number, inputRate: number): Uint8Array {
  const b = new Uint8Array(19)
  const v = new DataView(b.buffer)
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0) // "OpusHead"
  b[8] = 1
  b[9] = channels
  v.setUint16(10, preSkip, true)
  v.setUint32(12, inputRate, true)
  v.setInt16(16, 0, true) // output gain
  b[18] = 0 // channel mapping family
  return b
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode('pen')
  const b = new Uint8Array(8 + 4 + vendor.length + 4)
  const v = new DataView(b.buffer)
  b.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0) // "OpusTags"
  v.setUint32(8, vendor.length, true)
  b.set(vendor, 12)
  v.setUint32(12 + vendor.length, 0, true) // zero user comments
  return b
}

export type OpusPacket = { data: Uint8Array; granule: number }

/**
 * Wrap encoded Opus packets in an Ogg stream.
 *
 * `granule` is the running sample count at 48 kHz — always 48 kHz regardless of the encoder's
 * input rate, which is what RFC 7845 requires and the most common thing to get wrong.
 */
export function writeOggOpus(packets: OpusPacket[], channels: number, inputRate: number, preSkip: number): Blob {
  const serial = (Math.random() * 0xffffffff) >>> 0
  const parts: Uint8Array[] = []
  let seq = 0

  const head = opusHead(channels, preSkip, inputRate)
  parts.push(page({ headerType: 0x02, granule: 0, serial, sequence: seq++, segments: lace(head.length), body: head }))

  const tags = opusTags()
  parts.push(page({ headerType: 0x00, granule: 0, serial, sequence: seq++, segments: lace(tags.length), body: tags }))

  // Pack packets into pages, respecting the 255-segment ceiling. Each page carries the
  // granule of the LAST packet that finishes on it.
  let i = 0
  while (i < packets.length) {
    const segs: number[] = []
    const bodies: Uint8Array[] = []
    let granule = 0
    while (i < packets.length) {
      const l = lace(packets[i].data.length)
      if (segs.length + l.length > 255) break
      segs.push(...l)
      bodies.push(packets[i].data)
      granule = packets[i].granule
      i++
    }
    const size = bodies.reduce((n, b) => n + b.length, 0)
    const body = new Uint8Array(size)
    let o = 0
    for (const b of bodies) {
      body.set(b, o)
      o += b.length
    }
    const last = i >= packets.length
    parts.push(page({ headerType: last ? 0x04 : 0x00, granule, serial, sequence: seq++, segments: segs, body }))
  }

  return new Blob(parts as BlobPart[], { type: 'audio/ogg' })
}
