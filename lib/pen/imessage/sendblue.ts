// iMessage through Sendblue (a test, 14 Oct 2026: free sandbox, shared line, verified contacts).
//
// The WhatsApp assistant (lib/pen/whatsapp) is channel-agnostic past provider.ts, so iMessage
// is only this adapter: phone ids are prefixed `im:` (e.g. `im:15551234567`) wherever the bot
// keeps a sender, and provider.ts routes anything with that prefix here. The account link is
// the same row as WhatsApp (pen_whatsapp_links, digits only), so a number linked on WhatsApp
// works on iMessage with no new code.
//
// Sendblue has no official Apple backing (real iPhones in their data centres). Inbound-first
// only: people text Juno, Juno replies. No buttons in iMessage, so the consent tap becomes a
// "reply YES" (bot.ts).

import type { Inbound } from '../whatsapp/vonage'

const BASE = 'https://api.sendblue.com'
const PREFIX = 'im:'

export function configured(): boolean {
  return Boolean(process.env.SENDBLUE_API_KEY_ID && process.env.SENDBLUE_API_SECRET && process.env.SENDBLUE_NUMBER)
}

/**
 * Whether this account sees iMessage in Settings. A test on Sendblue's free plan (10 contacts):
 * only the emails in IMESSAGE_TESTERS (comma-separated). Unset means everyone, once it's paid for.
 */
export function imessageFor(email: string | null | undefined): boolean {
  if (!configured() || !email) return false
  const list = (process.env.IMESSAGE_TESTERS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return !list.length || list.includes(email.toLowerCase())
}

export function isImessage(phone: string | null | undefined): boolean {
  return !!phone && phone.startsWith(PREFIX)
}

/** `im:15551234567` or `+1 555…` → `+15551234567`. */
export function e164(phone: string): string {
  return `+${phone.replace(/\D/g, '')}`
}

function headers(): Record<string, string> {
  return {
    'sb-api-key-id': process.env.SENDBLUE_API_KEY_ID ?? '',
    'sb-api-secret-key': process.env.SENDBLUE_API_SECRET ?? '',
    'Content-Type': 'application/json',
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  const json = (await res.json().catch(() => ({}))) as { error_message?: string; message?: string }
  if (!res.ok) throw new Error(`sendblue ${path} ${res.status}: ${json.error_message ?? json.message ?? ''}`.trim())
  return json
}

/**
 * iMessage has no hard length limit, but a wall of text reads badly: split like WhatsApp. Returns
 * the message_handle of each part when Sendblue's response carries one (its docs don't promise it).
 */
export async function sendText(to: string, text: string, split: (t: string, max: number) => string[]): Promise<string[]> {
  const ids: string[] = []
  for (const part of split(text, 3000)) {
    const r = (await post('/api/send-message', { number: e164(to), from_number: process.env.SENDBLUE_NUMBER, content: part })) as { message_handle?: unknown }
    if (typeof r?.message_handle === 'string' && r.message_handle) ids.push(r.message_handle)
  }
  return ids
}

/** The "…" bubble while the assistant thinks. Best effort: needs an existing chat. */
export async function typing(to: string): Promise<void> {
  await post('/api/send-typing-indicator', { number: e164(to), from_number: process.env.SENDBLUE_NUMBER }).catch(() => {})
}

export async function markRead(to: string): Promise<void> {
  await post('/api/mark-read', { number: e164(to), from_number: process.env.SENDBLUE_NUMBER }).catch(() => {})
}

type SbMessage = {
  message_handle: string
  content?: string | null
  from_number?: string | null
  number?: string | null
  is_outbound?: boolean
  media_url?: string | null
  message_type?: string | null
  date_sent?: string | null
  reply_to?: { message_handle?: string } | null
  // Not in Sendblue's docs (checked 18 Oct: they document sending tapbacks, not receiving them).
  // Read defensively in case a received tapback carries them.
  reaction?: string | null
  is_reaction?: boolean | null
  associated_message_handle?: string | null
}

/**
 * A received tapback. Sendblue documents no shape for one, so two ways in, both conservative:
 *   - fields, if a payload ever has them (message_type 'reaction', reaction / is_reaction);
 *   - the text Apple sends where a tapback can't be shown natively: 'Liked “…”', 'Loved “…”',
 *     'Reacted 👍 to “…”', and their Spanish and Portuguese forms. The whole message must be
 *     exactly that, quote marks included, or it is an ordinary message.
 * Liked is 👍; a removed tapback ('Removed a like from “…”') has no emoji (silent anyway).
 */
const TAPBACK_VERBS: [RegExp, string][] = [
  [/^(liked|le gust[óo]|le gusta|curtiu|gostou de)$/i, '👍'],
  [/^(loved|le encant[óo]|amou|adorou)$/i, '❤️'],
  [/^(disliked|no le gust[óo]|n[ãa]o curtiu|n[ãa]o gostou de)$/i, '👎'],
  [/^(laughed at|se ri[óo] de|riu de)$/i, '😂'],
  [/^(emphasi[sz]ed|enfatiz[óo]|destac[óo]|enfatizou|destacou)$/i, '‼️'],
  [/^(questioned|cuestion[óo]|pregunt[óo] por|questionou)$/i, '❓'],
]
const QUOTED = /^(.{2,40}?)\s+[“"«]([\s\S]*)[”"»]\s*$/
const REACTED = /^(?:reacted|reaccion[óo] con|reagiu com)\s+(\S+)\s+(?:to|a|al?|em)\s+[“"«]([\s\S]*)[”"»]\s*$/i
const REMOVED = /^(?:removed an? .{1,20} from|quit[óo] (?:un|una|el|la) .{1,20} de|removeu (?:um|uma|o|a) .{1,20} de)\s+[“"«]([\s\S]*)[”"»]\s*$/i

export function tapback(text: string): { emoji: string; quoted: string } | null {
  const t = text.trim()
  const removed = REMOVED.exec(t)
  if (removed) return { emoji: '', quoted: removed[1] }
  const r = REACTED.exec(t)
  if (r) return { emoji: r[1], quoted: r[2] }
  const q = QUOTED.exec(t)
  if (!q) return null
  const hit = TAPBACK_VERBS.find(([re]) => re.test(q[1].trim()))
  return hit ? { emoji: hit[1], quoted: q[2] } : null
}

const VOICE_EXT = /\.caf(\?|$)/i
const IMAGE_EXT = /\.(jpe?g|png|heic|heif|gif|webp)(\?|$)/i

/** One Sendblue message as the bot's Inbound. Group chats and outbound echoes are skipped. */
export function toInbound(m: SbMessage): Inbound | null {
  if (m.is_outbound || m.message_type === 'group') return null
  const who = (m.from_number || m.number || '').trim()
  // Apple Account emails can't be linked to a phone; they are left alone.
  if (!who || who.includes('@')) return null
  const from = `${PREFIX}${who.replace(/\D/g, '')}`
  const base = { id: `im-${m.message_handle}`, from, name: null, text: (m.content ?? '').trim(), mediaUrl: null, fileName: null, replyId: null, raw: m }
  if (m.message_type === 'reaction' || m.is_reaction || (typeof m.reaction === 'string' && m.reaction)) {
    const emoji = String(m.reaction ?? '').trim()
    // Sendblue's own names for tapbacks (love, like…), as in its send-reaction API.
    const named = ({ like: '👍', love: '❤️', dislike: '👎', laugh: '😂', emphasize: '‼️', question: '❓' } as Record<string, string>)[emoji.toLowerCase()]
    return { ...base, kind: 'reaction', reaction: { emoji: emoji.startsWith('-') ? '' : named ?? emoji, to: m.associated_message_handle ?? m.reply_to?.message_handle ?? null } }
  }
  const tb = m.media_url ? null : tapback(base.text)
  if (tb) return { ...base, kind: 'reaction', reaction: { emoji: tb.emoji, to: null, quoted: tb.quoted } }
  const media = (m.media_url ?? '').trim()
  if (media) {
    const fileName = decodeURIComponent(media.split('?')[0].split('/').pop() ?? '') || null
    if (IMAGE_EXT.test(media)) return { ...base, kind: 'image', mediaUrl: media, fileName }
    // An iMessage voice note is a .caf; any other audio file is a recording to write up.
    return { ...base, kind: 'media', voice: VOICE_EXT.test(media), mediaUrl: media, fileName }
  }
  return { ...base, kind: 'text' }
}

/** Received messages since `sinceIso`, oldest first. For the local poller (no public webhook). */
export async function inboundSince(sinceIso: string): Promise<SbMessage[]> {
  const q = new URLSearchParams({ is_outbound: 'false', created_at_gte: sinceIso, order_direction: 'asc', limit: '100', sendblue_number: process.env.SENDBLUE_NUMBER ?? '' })
  const res = await fetch(`${BASE}/api/v2/messages?${q}`, { headers: headers() })
  if (!res.ok) throw new Error(`sendblue list ${res.status}`)
  const json = (await res.json()) as { data?: SbMessage[] }
  return json.data ?? []
}
