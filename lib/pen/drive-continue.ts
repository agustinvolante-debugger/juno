// "Auto-continue after picking a file" (21 Oct). The chat asks Juno to change a Doc or Sheet Juno
// can't open yet (drive.file: only files it made or the user chose), so the reply carries a link
// to /pen/drive/pick. Before, the user picked the file there and had to come back and say "done".
// Now:
//
//   1. pickLink (from the google.ts tools) makes /pen/drive/pick?t=<token>. The token is signed
//      (HMAC, NEXTAUTH_SECRET, its own domain prefix; connect-link.ts sealPayload) and names the
//      account, a nonce, the chat it came from (`c`: wa / im / web:<chat id>) and lasts 2 hours.
//      What the user asked (capped) and the phone turn's message id stay on the server, in a
//      pen_proactive_log row (kind 'pick', ref = nonce, status 'open', channel = the origin,
//      template = JSON {q, m}), so the link stays short enough for WhatsApp. No row → the plain
//      link, as before.
//   2. The page (app/pen/drive/pick) checks the token against the signed-in account; on a pick,
//      POST /api/pen/drive/picked sends it along. drive-routes.ts pickedFor → startContinue: the
//      origin must still be reachable (web thread exists; WhatsApp inside the 24-hour window;
//      linked phone), then the row is spent (open → used, compare-and-set: single use), and
//      runContinue is scheduled after the response.
//   3. runContinue runs ONE agent turn in that conversation with a stand-in message in the user's
//      language ("I just let Juno edit the Google file … Continue my earlier request now: …"), the
//      same tools do the edit, and the reply goes out like a normal turn: WhatsApp / iMessage are
//      sent and kept in the chat history (undo on the original message's row); a web thread gets
//      only the assistant turn (with its parts: links, undo), no user bubble. Under the same turn
//      locks as typed messages; busy → one retry a few seconds later, then a short "say done" note.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { openPayload, sealPayload, viaOfCtx, waWindowOpen, webChatOf, type Via } from './connect-link'
import type { Lang } from './i18n'
import type { ArchiveTurn } from './store'

export const PICK_TTL_MS = 2 * 60 * 60 * 1000
const DAY = 86_400_000
const PICK = 'pen-pick-link'
const MAX_REQUEST = 500
const RETRY_MS = 5000

const publicBase = () => (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
/** The page where the user lets Juno edit files of theirs (signed in on the website). */
export const pickUrl = () => `${publicBase()}/pen/drive/pick`

/** Test seam: the agent, the sender and the clock are looked up here. */
export const deps = {
  runAgent: async (...a: Parameters<typeof import('./whatsapp/agent').runAgent>) => (await import('./whatsapp/agent')).runAgent(...a),
  sendText: async (to: string, text: string) => (await import('./whatsapp/provider')).sendText(to, text),
  channelFor: async (email: string) => (await import('./proactive')).channelFor(email),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
}

const WEB_VIA = /^web:[\w-]{1,64}$/
const asVia = (v: unknown): Via | null => (v === 'wa' || v === 'im' ? v : typeof v === 'string' && WEB_VIA.test(v) ? (v as Via) : null)
/** Which "back" the page shows. */
export const backOf = (via: Via): 'wa' | 'im' | 'web' => (webChatOf(via) ? 'web' : via === 'im' ? 'im' : 'wa')

/* ------------------------------------------------------------ the link */

type LinkCtx = { email: string; question: string; msgId: string; channel?: string; phone?: string | null; store?: { chatId?: string }; resumeRequest?: string }

export function pickToken(email: string, nonce: string, via: Via, now = Date.now()): string {
  return sealPayload(PICK, { e: email.toLowerCase(), n: nonce, c: via, x: now + PICK_TTL_MS })
}

/**
 * The pick link for this turn: carries a token so the pick continues the request in this chat.
 * Any failure → the plain link (the user then says "done", as before).
 */
export async function pickLink(ctx: LinkCtx, now = Date.now()): Promise<string> {
  const base = pickUrl()
  try {
    const email = ctx.email.toLowerCase()
    const via = viaOfCtx({ channel: ctx.channel, phone: ctx.phone, store: ctx.store })
    const q = (ctx.resumeRequest ?? ctx.question ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_REQUEST)
    if (!q) return base
    const nonce = crypto.randomBytes(12).toString('base64url')
    await supabaseAdmin.from('pen_proactive_log').delete().eq('user_email', email).eq('kind', 'pick').lt('sent_at', new Date(now - DAY).toISOString()).then(() => {}, () => {})
    const { error } = await supabaseAdmin.from('pen_proactive_log').insert({
      user_email: email,
      kind: 'pick',
      ref: nonce,
      status: 'open',
      channel: via,
      template: JSON.stringify({ q, m: ctx.channel === 'web' ? null : ctx.msgId }),
      sent_at: new Date(now).toISOString(),
    })
    if (error) {
      console.warn(`pen pick: link row not saved: ${error.message}`)
      return base
    }
    return `${base}?t=${pickToken(email, nonce, via, now)}`
  } catch (e) {
    console.warn(`pen pick: plain link: ${(e as Error).message}`)
    return base
  }
}

export type PickCheck = { ok: true; email: string; nonce: string; via: Via } | { ok: false; reason: 'bad' | 'expired' | 'other_user' }

/** Signature, expiry, and the signed-in account (null = signed out → other_user). Not whether it was used. */
export function verifyPickToken(token: string | null | undefined, email: string | null | undefined, now = Date.now()): PickCheck {
  if (!token || token.length > 1000) return { ok: false, reason: 'bad' }
  const p = openPayload(PICK, token)
  const via = asVia(p?.c)
  if (!p || typeof p.e !== 'string' || typeof p.n !== 'string' || typeof p.x !== 'number' || !via) return { ok: false, reason: 'bad' }
  if (p.x <= now) return { ok: false, reason: 'expired' }
  if (!email || email.toLowerCase() !== p.e) return { ok: false, reason: 'other_user' }
  return { ok: true, email: p.e, nonce: p.n, via }
}

/** Spends the link: open → used, once. Returns what was asked, or null (used, missing, other origin). */
export async function claimPick(email: string, nonce: string, via: Via): Promise<{ q: string; m: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from('pen_proactive_log')
    .update({ status: 'used' })
    .eq('user_email', email.toLowerCase())
    .eq('kind', 'pick')
    .eq('ref', nonce)
    .eq('status', 'open')
    .select('channel,template')
  if (error || !data?.length) return null
  const row = data[0] as { channel?: string; template?: string }
  if (row.channel !== via) return null
  try {
    const t = JSON.parse(row.template ?? '{}') as { q?: unknown; m?: unknown }
    return typeof t.q === 'string' && t.q ? { q: t.q, m: typeof t.m === 'string' ? t.m : null } : null
  } catch {
    return null
  }
}

/* -------------------------------------------------------- the continue */

export type PickedFile = { id: string; name: string; kind: 'doc' | 'sheet'; url: string }
export type ContinueOut = { continued: boolean; back?: 'wa' | 'im' | 'web'; chat?: string; reason?: 'window' | 'unreachable' | 'used' }

/** Runs after the response; outside a request (tests, scripts) it just runs. */
async function laterDefault(job: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import('next/server')
    after(job)
  } catch {
    void job().catch(() => {})
  }
}

/** Whether a reply can reach the chat the link came from, now. */
async function reachable(email: string, via: Via): Promise<'ok' | 'window' | 'unreachable'> {
  const web = webChatOf(via)
  if (web) {
    const { getChat } = await import('./chats')
    return (await getChat(email, web).catch(() => null)) ? 'ok' : 'unreachable'
  }
  const { getLinkByEmail } = await import('./whatsapp/store')
  const link = await getLinkByEmail(email).catch(() => null)
  if (!link?.phone || !link.linked_at) return 'unreachable'
  if (via === 'wa' && !(await waWindowOpen(email).catch(() => false))) return 'window'
  return 'ok'
}

/**
 * After a pick with a token: checks it, spends it and schedules the turn. Never throws; anything
 * short of a scheduled turn returns continued: false (the page shows today's copy, or "say done"
 * when the WhatsApp window is closed).
 */
export async function startContinue(
  email: string,
  token: unknown,
  files: PickedFile[],
  schedule: (job: () => Promise<void>) => void | Promise<void> = laterDefault,
): Promise<ContinueOut> {
  try {
    if (typeof token !== 'string' || !files.length) return { continued: false }
    const t = verifyPickToken(token, email)
    if (!t.ok) return { continued: false }
    const back = backOf(t.via)
    const can = await reachable(t.email, t.via)
    if (can !== 'ok') return { continued: false, back, reason: can }
    const rec = await claimPick(t.email, t.nonce, t.via)
    if (!rec) return { continued: false, back, reason: 'used' }
    await schedule(() => runContinue(t.email, t.via, rec, files, t.nonce))
    const chat = webChatOf(t.via)
    return { continued: true, back, ...(chat ? { chat } : {}) }
  } catch (e) {
    console.warn(`pen pick: continue not started: ${(e as Error).message}`)
    return { continued: false }
  }
}

const quoteFiles = (files: PickedFile[]) => files.map((f) => `"${f.name.replace(/"/g, "'")}" (id ${f.id})`).join(', ')

/** The stand-in user message, in the user's language (the reply follows the message's language). */
export function continueMessage(lang: Lang, files: PickedFile[], request: string): string {
  const f = quoteFiles(files)
  const q = request.replace(/"/g, "'")
  if (lang === 'es') {
    return `(Acabo de dejar que Juno edite el archivo de Google ${f}. Sigue ahora con lo que te pedí antes: "${q}". Empieza diciendo en pocas palabras que ya puedes editarlo, hazlo con las herramientas y di qué cambió.)`
  }
  if (lang === 'pt') {
    return `(Acabei de deixar o Juno editar o arquivo do Google ${f}. Continue agora o que eu pedi antes: "${q}". Comece dizendo em poucas palavras que já pode editar, faça com as ferramentas e diga o que mudou.)`
  }
  return `(I just let Juno edit the Google file ${f}. Continue my earlier request now: "${q}". Start by saying in a few words that you can edit it now, then do it with the tools and say what changed.)`
}

/** When the turn can't run (busy, failed): the old way, said in the chat. */
export function sayDone(lang: Lang, files: PickedFile[]): string {
  const name = files.map((f) => `*${f.name}*`).join(', ')
  if (lang === 'es') return `Ya puedo editar ${name}. Escribe "listo" y sigo con lo que me pediste.`
  if (lang === 'pt') return `Já posso editar ${name}. Escreva "pronto" e eu continuo o que você pediu.`
  return `I can edit ${name} now. Say "done" and I'll carry on with what you asked.`
}

/** Takes a lock, once more after a pause if it was held. */
async function lockWithRetry(take: () => Promise<string | null>): Promise<string | null> {
  const first = await take().catch(() => null)
  if (first) return first
  await deps.sleep(RETRY_MS)
  return take().catch(() => null)
}

/** The background turn (scheduled by startContinue). Never throws. */
export async function runContinue(email: string, via: Via, rec: { q: string; m: string | null }, files: PickedFile[], nonce: string): Promise<void> {
  const { userLang } = await import('./user-lang')
  const lang = await userLang(email).catch((): Lang => 'en')
  const question = continueMessage(lang, files, rec.q)
  const web = webChatOf(via)
  try {
    if (web) await continueWeb(email, web, question, rec.q, lang, files)
    else await continuePhone(email, via, question, rec, lang, files, nonce)
  } catch (e) {
    console.warn(`pen pick: continue failed: ${(e as Error).message}`)
  }
}

async function continueWeb(email: string, chatId: string, question: string, request: string, lang: Lang, files: PickedFile[]): Promise<void> {
  const { getChat, setMessages, appendToChat } = await import('./chats')
  const { takeChatLock, releaseChatLock } = await import('./whatsapp/store')
  const { webText } = await import('./whatsapp/agent')
  const token = await lockWithRetry(() => takeChatLock(chatId))
  if (!token) {
    await appendToChat(email, chatId, { role: 'assistant', content: webText(sayDone(lang, files)), ts: Date.now() })
    return
  }
  let after: (() => Promise<void>) | undefined
  try {
    const chat = await getChat(email, chatId)
    if (!chat) return
    const { historyForAgent } = await import('./web-agent')
    const { webStore } = await import('./whatsapp/state')
    const { briefFor } = await import('./profile')
    const ch = await deps.channelFor(email).catch(() => null)
    const msgId = String(Date.now())
    const notify = async (text: string) => appendToChat(email, chatId, { role: 'assistant', content: webText(text), ts: Date.now() })
    let r: Awaited<ReturnType<typeof deps.runAgent>>
    try {
      r = await deps.runAgent({
        email,
        msgId,
        question,
        history: historyForAgent(Array.isArray(chat.messages) ? chat.messages : []),
        agentBrief: await briefFor(email).catch(() => undefined),
        recent: null,
        lang,
        channel: 'web',
        ...(ch?.to ? { phone: ch.to, reach: { imessage: ch.imessage, lastInbound: ch.lastInbound } } : {}),
        store: webStore(email, chatId),
        notify,
        resumeRequest: request,
      })
    } catch (e) {
      console.warn(`pen pick: web turn failed: ${(e as Error).message}`)
      await appendToChat(email, chatId, { role: 'assistant', content: webText(sayDone(lang, files)), ts: Date.now() })
      return
    }
    // Only the assistant turn: the stand-in message is never shown as a user bubble.
    const fresh = (await getChat(email, chatId).catch(() => null))?.messages ?? chat.messages ?? []
    const turn: ArchiveTurn = { role: 'assistant', content: r.text, citations: r.citations, parts: r.parts ?? {}, ts: Number(msgId) }
    await setMessages(email, chatId, [...fresh, turn])
    after = r.after
  } finally {
    await releaseChatLock(chatId, token).catch(() => {})
  }
  if (after) await after().catch(() => {})
}

async function continuePhone(email: string, via: Via, question: string, rec: { q: string; m: string | null }, lang: Lang, files: PickedFile[], nonce: string): Promise<void> {
  const { getLinkByEmail, setChat, takeLock, releaseLock } = await import('./whatsapp/store')
  const link = await getLinkByEmail(email)
  if (!link?.phone || !link.linked_at) return
  const to = via === 'im' ? `im:${link.phone}` : link.phone
  // Checked again: minutes may have passed since the pick.
  if (via === 'wa' && !(await waWindowOpen(email).catch(() => false))) return
  const say = async (text: string) => {
    await deps.sendText(to, text)
    const now = (await getLinkByEmail(email).catch(() => null))?.chat ?? link.chat ?? []
    await setChat(email, [...now, { role: 'assistant', content: text, ts: Date.now() }]).catch(() => {})
  }
  const token = await lockWithRetry(() => takeLock(to))
  if (!token) {
    await say(sayDone(lang, files))
    return
  }
  let after: (() => Promise<void>) | undefined
  try {
    const fresh = (await getLinkByEmail(email).catch(() => null)) ?? link
    const { briefFor } = await import('./profile')
    let r: Awaited<ReturnType<typeof deps.runAgent>>
    try {
      r = await deps.runAgent({
        email,
        // The message that asked: an edit's undo is kept on its row, as if done in that turn.
        msgId: rec.m ?? `pick:${nonce}`,
        question,
        history: fresh.chat ?? [],
        agentBrief: await briefFor(email).catch(() => undefined),
        recent: null,
        lang,
        phone: to,
        resumeRequest: rec.q,
      })
    } catch (e) {
      console.warn(`pen pick: phone turn failed: ${(e as Error).message}`)
      await say(sayDone(lang, files))
      return
    }
    const now = Date.now()
    await deps.sendText(to, r.text)
    const chat = (await getLinkByEmail(email).catch(() => null))?.chat ?? fresh.chat ?? []
    await setChat(email, [
      ...chat,
      { role: 'user', content: question, ts: now },
      { role: 'assistant', content: r.memo ? `${r.text}\n\n${r.memo}` : r.text, citations: r.citations, ts: now + 1 },
    ]).catch(() => {})
    after = r.after
  } finally {
    await releaseLock(to, token).catch(() => {})
  }
  if (after) await after().catch(() => {})
}
