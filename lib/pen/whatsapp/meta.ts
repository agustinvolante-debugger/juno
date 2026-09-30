// Meta's WhatsApp Cloud API, directly (no Vonage in between). Same surface as vonage.ts, so
// the bot doesn't know which one it is talking to; provider.ts picks.
//
// Env:
//   META_WA_TOKEN            permanent System User token with whatsapp_business_messaging
//   META_WA_PHONE_NUMBER_ID  the number's id in WhatsApp Manager (not the number itself)
//   META_WA_NUMBER           the number people message, digits only (for wa.me links)
//   META_APP_SECRET          the Meta app's secret, to check X-Hub-Signature-256 on webhooks
//   META_WA_VERIFY_TOKEN     any string; Meta echoes it once when the webhook is registered
//   META_GRAPH_VERSION       optional, defaults below

import crypto from 'node:crypto'
import type { Button, Inbound } from './vonage'

const VERSION = () => process.env.META_GRAPH_VERSION || 'v23.0'
const GRAPH = () => `https://graph.facebook.com/${VERSION()}`

export function botNumber(): string {
  return (process.env.META_WA_NUMBER ?? '').replace(/\D/g, '')
}

export function configured(): boolean {
  return Boolean(process.env.META_WA_TOKEN && process.env.META_WA_PHONE_NUMBER_ID && botNumber())
}

function token(): string {
  const t = process.env.META_WA_TOKEN
  if (!t) throw new Error('Meta WhatsApp is not configured: set META_WA_TOKEN')
  return t
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH()}/${process.env.META_WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  })
  if (!res.ok) throw new Error(`meta send ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json().catch(() => ({}))) as Record<string, unknown>
}

const MAX_TEXT = 4096

export async function sendText(to: string, text: string, split: (t: string, max: number) => string[]): Promise<void> {
  for (const part of split(text, MAX_TEXT - 96)) {
    await post({ recipient_type: 'individual', to, type: 'text', text: { body: part, preview_url: false } })
  }
}

export async function sendButtons(to: string, body: string, buttons: Button[]): Promise<void> {
  await post({
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body.slice(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
    },
  })
}

/** Blue ticks, plus "typing…" when a reply is on its way. Never throws. */
export async function markRead(messageId: string, typing = false): Promise<boolean> {
  try {
    await post({ status: 'read', message_id: messageId, ...(typing ? { typing_indicator: { type: 'text' } } : {}) })
    return true
  } catch (e) {
    console.warn(`pen whatsapp (meta): markRead failed: ${(e as Error).message}`)
    return false
  }
}

/* ---------------------------------------------------------------- inbound */

type Media = { id?: string; filename?: string; caption?: string; mime_type?: string }
type RawMsg = {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
  audio?: Media
  voice?: Media
  video?: Media
  document?: Media
  interactive?: { type?: string; button_reply?: { id?: string; title?: string } }
  button?: { payload?: string; text?: string }
}
type Payload = {
  object?: string
  entry?: { changes?: { field?: string; value?: { contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: RawMsg[]; statuses?: unknown[] } }[] }[]
}

/**
 * A Meta webhook can carry several messages, and delivery statuses (failed ones: parseFailedStatuses).
 * Media comes as an id, not a URL; it is kept as `meta:<id>` so openMedia knows to resolve it.
 */
export function parseInboundAll(body: unknown): Inbound[] {
  const b = (body ?? {}) as Payload
  if (b.object !== 'whatsapp_business_account') return []
  const out: Inbound[] = []
  for (const e of b.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value
      if (!v?.messages?.length) continue
      const names = new Map((v.contacts ?? []).map((x) => [x.wa_id ?? '', x.profile?.name ?? null]))
      for (const m of v.messages) {
        if (!m.id || !m.from) continue
        const from = String(m.from).replace(/\D/g, '')
        const base = { id: m.id, from, name: names.get(from) ?? null, text: '', mediaUrl: null, fileName: null, replyId: null, raw: m }
        const media = m.audio ?? m.voice ?? m.video ?? m.document
        if (m.type === 'text') out.push({ ...base, kind: 'text', text: (m.text?.body ?? '').trim() })
        else if (media?.id) out.push({ ...base, kind: 'media', mediaUrl: `meta:${media.id}`, fileName: media.filename ?? null, text: media.caption ?? '' })
        else if (m.type === 'interactive' && m.interactive?.button_reply) out.push({ ...base, kind: 'reply', replyId: m.interactive.button_reply.id ?? null, text: m.interactive.button_reply.title ?? '' })
        else if (m.type === 'button') out.push({ ...base, kind: 'reply', replyId: m.button?.payload ?? null, text: m.button?.text ?? '' })
        else out.push({ ...base, kind: 'other' })
      }
    }
  }
  return out
}

export type FailedStatus = { messageId: string; recipient: string; code: number | null; title: string; detail: string; at: string }

/**
 * Delivery statuses that came back "failed". A send that Meta accepts (HTTP 200) can still
 * never arrive, and this is the only place that says so and why: found on 30 Sep, when every
 * reply to a Brazilian number was accepted and none was delivered.
 */
export function parseFailedStatuses(body: unknown): FailedStatus[] {
  const b = (body ?? {}) as Payload
  if (b.object !== 'whatsapp_business_account') return []
  const out: FailedStatus[] = []
  for (const e of b.entry ?? []) {
    for (const c of e.changes ?? []) {
      for (const raw of c.value?.statuses ?? []) {
        const st = raw as {
          id?: string
          status?: string
          recipient_id?: string
          timestamp?: string
          errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[]
        }
        if (st.status !== 'failed' || !st.id) continue
        const err = st.errors?.[0]
        out.push({
          messageId: st.id,
          recipient: String(st.recipient_id ?? '').replace(/\D/g, ''),
          code: typeof err?.code === 'number' ? err.code : null,
          title: String(err?.title ?? err?.message ?? 'unknown').slice(0, 200),
          detail: String(err?.error_data?.details ?? '').slice(0, 500),
          at: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString(),
        })
      }
    }
  }
  return out
}

/** X-Hub-Signature-256: sha256 HMAC of the raw body with the app secret. Required. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET
  if (!secret) return false
  const got = (header ?? '').replace(/^sha256=/, '')
  const want = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))
}

/** Media id → short-lived URL → the bytes, both steps with the token. */
export async function openMedia(ref: string): Promise<Response> {
  const id = ref.replace(/^meta:/, '')
  const meta = await fetch(`${GRAPH()}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token()}` } })
  if (!meta.ok) throw new Error(`meta media lookup ${meta.status}`)
  const { url } = (await meta.json()) as { url?: string }
  if (!url) throw new Error('meta media has no url')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
  if (!res.ok || !res.body) throw new Error(`meta media ${res.status}`)
  return res
}
