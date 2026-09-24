// Vonage Messages API, WhatsApp only. Everything that knows it is talking to Vonage lives in
// this file, so moving to Meta's Cloud API or Twilio later is a rewrite of one file.
//
// Two ways to authenticate a send, picked by what is in the env:
//   - VONAGE_APPLICATION_ID + VONAGE_PRIVATE_KEY: a short RS256 JWT. Production WhatsApp
//     numbers are attached to a Vonage Application and Vonage's docs say they want this.
//   - VONAGE_API_KEY + VONAGE_API_SECRET: Basic auth. What the sandbox uses.
//
// VONAGE_SANDBOX=1 points at the sandbox host and defaults the sender to the sandbox number.

import crypto from 'node:crypto'

const PROD = 'https://api.nexmo.com/v1/messages'
const SANDBOX = 'https://messages-sandbox.nexmo.com/v1/messages'
/** Vonage's shared WhatsApp sandbox number. Only allow-listed phones can talk to it. */
const SANDBOX_NUMBER = '14157386102'

export function isSandbox(): boolean {
  return process.env.VONAGE_SANDBOX === '1'
}

/** The number people message, digits only. */
export function botNumber(): string {
  const n = (process.env.VONAGE_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')
  return n || (isSandbox() ? SANDBOX_NUMBER : '')
}

export function configured(): boolean {
  const auth = Boolean(
    (process.env.VONAGE_APPLICATION_ID && process.env.VONAGE_PRIVATE_KEY) ||
      (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET),
  )
  return auth && Boolean(botNumber())
}

function b64url(b: Buffer | string): string {
  return Buffer.from(b).toString('base64url')
}

function authHeader(): string {
  const app = process.env.VONAGE_APPLICATION_ID
  const pem = process.env.VONAGE_PRIVATE_KEY
  if (app && pem) {
    const now = Math.floor(Date.now() / 1000)
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const body = b64url(JSON.stringify({ application_id: app, iat: now, exp: now + 300, jti: crypto.randomUUID() }))
    // Vercel env can't hold newlines comfortably, so a key pasted with literal \n is accepted.
    const key = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key)
    return `Bearer ${head}.${body}.${b64url(sig)}`
  }
  const k = process.env.VONAGE_API_KEY
  const s = process.env.VONAGE_API_SECRET
  if (!k || !s) throw new Error('Vonage is not configured: set VONAGE_API_KEY and VONAGE_API_SECRET')
  return `Basic ${Buffer.from(`${k}:${s}`).toString('base64')}`
}

async function send(to: string, message: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(isSandbox() ? SANDBOX : PROD, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ channel: 'whatsapp', from: botNumber(), to, ...message }),
  })
  if (!res.ok) throw new Error(`vonage send ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = (await res.json().catch(() => ({}))) as { message_uuid?: string }
  return j.message_uuid ?? null
}

/** WhatsApp's own ceiling for a text body. */
const MAX_TEXT = 4096

export async function sendText(to: string, text: string): Promise<void> {
  // A long answer goes as several messages rather than being cut off mid-sentence.
  for (const part of splitText(text, MAX_TEXT - 96)) await send(to, { message_type: 'text', text: part })
}

export type Button = { id: string; title: string }

/** Up to three reply buttons under a short body. WhatsApp caps a button title at 20 chars. */
export async function sendButtons(to: string, body: string, buttons: Button[]): Promise<void> {
  await send(to, {
    message_type: 'custom',
    custom: {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })),
        },
      },
    },
  })
}

export function splitText(text: string, max: number): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > max) {
    // Break at a paragraph, then a line, then a sentence, then anywhere.
    let cut = rest.lastIndexOf('\n\n', max)
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max)
    if (cut < max / 2) cut = rest.lastIndexOf('. ', max) + 1
    if (cut < max / 2) cut = max
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

/* ---------------------------------------------------------------- inbound */

export type Inbound = {
  id: string
  /** The user's number, digits only. */
  from: string
  name: string | null
  kind: 'text' | 'media' | 'reply' | 'other'
  text: string
  mediaUrl: string | null
  fileName: string | null
  replyId: string | null
  raw: unknown
}

type Raw = {
  message_uuid?: string
  from?: string
  channel?: string
  message_type?: string
  profile?: { name?: string }
  text?: string
  audio?: { url?: string; name?: string }
  video?: { url?: string; name?: string }
  file?: { url?: string; name?: string; caption?: string }
  reply?: { id?: string; title?: string }
  button?: { payload?: string; text?: string }
}

/**
 * Normalises Vonage's inbound payload. Returns null for anything that isn't a WhatsApp
 * message (status callbacks sent to the wrong URL, pings).
 *
 * Measured on the sandbox, 24 Sep: a pen WAV shared from the Files app arrives as `audio`,
 * with its filename in `audio.name` (not as `file`, which the docs suggested). Both are read,
 * and the filename is kept either way because it is what joins split meetings.
 */
export function parseInbound(body: unknown): Inbound | null {
  const b = (body ?? {}) as Raw
  if (!b.message_uuid || !b.from || (b.channel && b.channel !== 'whatsapp')) return null
  const base = {
    id: b.message_uuid,
    from: String(b.from).replace(/\D/g, ''),
    name: b.profile?.name ?? null,
    text: '',
    mediaUrl: null,
    fileName: null,
    replyId: null,
    raw: body,
  }
  switch (b.message_type) {
    case 'text':
      return { ...base, kind: 'text', text: (b.text ?? '').trim() }
    case 'audio':
      return { ...base, kind: 'media', mediaUrl: b.audio?.url ?? null, fileName: b.audio?.name ?? null }
    case 'video':
      return { ...base, kind: 'media', mediaUrl: b.video?.url ?? null, fileName: b.video?.name ?? null }
    case 'file':
      return { ...base, kind: 'media', mediaUrl: b.file?.url ?? null, fileName: b.file?.name ?? null, text: b.file?.caption ?? '' }
    case 'reply':
      return { ...base, kind: 'reply', replyId: b.reply?.id ?? null, text: b.reply?.title ?? '' }
    case 'button':
      return { ...base, kind: 'reply', replyId: b.button?.payload ?? null, text: b.button?.text ?? '' }
    default:
      return { ...base, kind: 'other' }
  }
}

/**
 * Vonage signs each webhook with an HS256 JWT in Authorization, keyed by the account's
 * signature secret, carrying a sha256 of the body. Checked only when VONAGE_SIGNATURE_SECRET
 * is set; the URL's own secret is the gate either way.
 */
export function verifySignature(rawBody: string, authorization: string | null): boolean {
  const secret = process.env.VONAGE_SIGNATURE_SECRET
  if (!secret) return true
  const token = authorization?.replace(/^Bearer\s+/i, '') ?? ''
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) return false
  const expect = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
  if (expect.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return false
  try {
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as { payload_hash?: string; iat?: number }
    if (claims.iat && Math.abs(Date.now() / 1000 - claims.iat) > 600) return false
    if (claims.payload_hash) {
      const hash = crypto.createHash('sha256').update(rawBody).digest('hex')
      if (hash !== claims.payload_hash) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Opens the inbound file. Vonage keeps it for 48 hours; the URL needs no credentials unless
 * "Enhanced Inbound Media Security" is on, in which case it wants the same auth as a send.
 */
export async function openMedia(url: string): Promise<Response> {
  let res = await fetch(url)
  if (res.status === 401 || res.status === 403) res = await fetch(url, { headers: { Authorization: authHeader() } })
  if (!res.ok || !res.body) throw new Error(`vonage media ${res.status}`)
  return res
}
