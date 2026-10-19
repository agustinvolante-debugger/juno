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
import type { Button, ContactCard, Inbound } from './vonage'

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

/** The wamid Meta gives a sent message: a reaction to it comes back with this id (reaction.message_id). */
function sentId(r: Record<string, unknown>): string | null {
  const id = (r.messages as { id?: string }[] | undefined)?.[0]?.id
  return typeof id === 'string' ? id : null
}

/** Returns the wamid of each part sent. */
export async function sendText(to: string, text: string, split: (t: string, max: number) => string[]): Promise<string[]> {
  const ids: string[] = []
  for (const part of split(text, MAX_TEXT - 96)) {
    const id = sentId(await post({ recipient_type: 'individual', to, type: 'text', text: { body: part, preview_url: false } }))
    if (id) ids.push(id)
  }
  return ids
}

export async function sendButtons(to: string, body: string, buttons: Button[]): Promise<string[]> {
  const r = await post({
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body.slice(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
    },
  })
  const id = sentId(r)
  return id ? [id] : []
}

/** Meta's code for each app language: the code a template was approved under (en, es, pt_BR). */
export const TEMPLATE_LANG = { en: 'en', es: 'es', pt: 'pt_BR' } as const

/**
 * A template variable as Meta accepts it: no newlines or tabs, no runs of 4+ spaces (Meta
 * rejects both), about 120 characters, no trailing period (the template text adds its own).
 */
export function templateVar(v: string): string {
  let t = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.length > 120) t = `${t.slice(0, 119).trimEnd()}…`
  return t.replace(/[.。]+$/, '').trim() || '-'
}

/**
 * An approved message template: the only kind of message Meta delivers outside the 24-hour
 * window. `vars` fill {{1}}, {{2}}… in the body, in order. `buttons` are the payloads of the
 * template's quick-reply buttons, by position (the button texts live in the template itself, in
 * the same order in every language), so a tap comes back as that payload (parseInboundAll:
 * kind 'reply', replyId = payload).
 */
export async function sendTemplate(to: string, name: string, lang: string, vars: string[], buttons: string[] = []): Promise<void> {
  const components: Record<string, unknown>[] = []
  if (vars.length) components.push({ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: templateVar(v) })) })
  buttons.forEach((payload, i) => {
    components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: payload.slice(0, 256) }] })
  })
  await post({ recipient_type: 'individual', to, type: 'template', template: { name, language: { code: lang }, components } })
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

type Media = { id?: string; filename?: string; caption?: string; mime_type?: string; voice?: boolean }
type RawMsg = {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
  audio?: Media
  voice?: Media
  video?: Media
  document?: Media
  image?: Media
  interactive?: { type?: string; button_reply?: { id?: string; title?: string } }
  button?: { payload?: string; text?: string }
  reaction?: { message_id?: string; emoji?: string }
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  contacts?: RawContact[]
  unsupported?: { type?: string }
}
type RawContact = {
  name?: { formatted_name?: string; first_name?: string; last_name?: string }
  phones?: { phone?: string; wa_id?: string }[]
  emails?: { email?: string }[]
  org?: { company?: string; title?: string }
}

/** A contact card as Meta sends it, in the shape the bot offers to save. Nameless cards are dropped. */
export function contactCard(c: RawContact): ContactCard | null {
  const n = c.name ?? {}
  const name = (n.formatted_name || [n.first_name, n.last_name].filter(Boolean).join(' ')).trim()
  if (!name) return null
  const phones = (c.phones ?? []).map((p) => (p.phone || (p.wa_id ? `+${p.wa_id}` : '')).trim()).filter(Boolean)
  const emails = (c.emails ?? []).map((e) => (e.email ?? '').trim()).filter(Boolean)
  return { name: name.slice(0, 120), phones, emails, company: c.org?.company?.trim() || null, role: c.org?.title?.trim() || null }
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
        else if (media?.id) {
          // A voice note is an audio message with voice: true (or, on older payloads, type 'voice').
          const voice = m.type === 'voice' || (!!m.audio && m.audio.voice === true)
          out.push({ ...base, kind: 'media', voice, mime: media.mime_type ?? null, mediaUrl: `meta:${media.id}`, fileName: media.filename ?? null, text: media.caption ?? '' })
        } else if (m.type === 'image' && m.image?.id) out.push({ ...base, kind: 'image', mime: m.image.mime_type ?? null, mediaUrl: `meta:${m.image.id}`, text: m.image.caption ?? '' })
        else if (m.type === 'interactive' && m.interactive?.button_reply) out.push({ ...base, kind: 'reply', replyId: m.interactive.button_reply.id ?? null, text: m.interactive.button_reply.title ?? '' })
        else if (m.type === 'button') out.push({ ...base, kind: 'reply', replyId: m.button?.payload ?? null, text: m.button?.text ?? '' })
        // A reaction to one of Juno's messages; an empty emoji is a reaction taken back.
        else if (m.type === 'reaction' && m.reaction) out.push({ ...base, kind: 'reaction', reaction: { emoji: m.reaction.emoji ?? '', to: m.reaction.message_id ?? null } })
        else if (m.type === 'location' && typeof m.location?.latitude === 'number' && typeof m.location?.longitude === 'number') {
          const l = m.location
          out.push({ ...base, kind: 'location', location: { lat: l.latitude!, lng: l.longitude!, name: l.name?.trim() || null, address: l.address?.trim() || null } })
        } else if (m.type === 'contacts' && m.contacts?.length) {
          const cards = m.contacts.map(contactCard).filter((c): c is ContactCard => !!c)
          out.push(cards.length ? { ...base, kind: 'contacts', contacts: cards } : { ...base, kind: 'other', otherType: 'contacts' })
        }
        // Stickers, system notices, edits, unsupported types (unsupported.type says which, on newer
        // API versions), a media message that came without its id: the bot decides (inbound.ts).
        else out.push({ ...base, kind: 'other', otherType: m.type === 'unsupported' && m.unsupported?.type ? `unsupported:${m.unsupported.type}` : m.type ?? 'unknown' })
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
