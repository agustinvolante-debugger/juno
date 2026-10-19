// "Connect my Google Calendar" / "conecta Notion" from the chat (WhatsApp or iMessage).
//
//   (Granola, too: its sign-in is OAuth with PKCE, the verifier kept in the sealed state cookie.)
//   1. The agent's connect_app tool (whatsapp/tools/connections.ts) makes a personal link:
//      /api/pen/connect/<token>. The token is signed (HMAC, NEXTAUTH_SECRET, its own domain
//      prefix), names the account and the app, carries a nonce, and lasts 15 minutes.
//   2. Tapping it (app/api/pen/connect/[token]) verifies the token, spends the nonce, and goes
//      straight to Google's / Notion's consent screen bound to that account: no website sign-in.
//      The OAuth state is a "chat state" (signed: email + app + a fresh nonce that is also the
//      same cookie the website flow uses), so the callback knows the account without a session.
//   3. The callbacks see a chat state, connect that account, redirect to /pen/connected and
//      send "Connected ✓ …" in the chat (announceConnected).
//
// Single use, without new tables: spending a nonce inserts a row in pen_proactive_log
// (kind 'connect', ref = nonce, status 'used'). Its unique index on (user_email, kind, ref)
// makes the insert the atomic test-and-set: a second tap gets 23505 and is refused. The
// proactive scheduler never reads these rows as messages (its counts look at status
// sent/sending, its dedupe keys on its own kinds), and spent nonces older than a day are
// deleted on the next claim (a token is dead after 15 minutes anyway).

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import type { Lang } from './i18n'

/** gdrive = Google Docs & Sheets: the same Google connection as gcal, the drive.file ability. */
/** gmail = send-only Gmail (lib/pen/gmail.ts): its own Google token, one per connected address. */
export type ConnectApp = 'gcal' | 'gdrive' | 'notion' | 'granola' | 'gmail'
export type Via = 'wa' | 'im'

export const LINK_TTL_MS = 15 * 60 * 1000
const STATE_TTL_MS = 10 * 60 * 1000
const DAY = 86_400_000

const baseUrl = () => (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set; connect links cannot be signed.')
  return s
}

const hmac = (domain: string, body: string) => crypto.createHmac('sha256', secret()).update(`${domain}.${body}`).digest('base64url')

function sealPayload(domain: string, p: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url')
  return `${body}.${hmac(domain, body)}`
}

function openPayload(domain: string, token: string): Record<string, unknown> | null {
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null
  const want = hmac(domain, body)
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const isApp = (a: unknown): a is ConnectApp => a === 'gcal' || a === 'gdrive' || a === 'notion' || a === 'granola' || a === 'gmail'
export const viaOf = (phone: string | null | undefined): Via => (phone?.startsWith('im:') ? 'im' : 'wa')

/* ------------------------------------------------------------ the link */

const LINK = 'pen-connect-link'

export function connectToken(email: string, app: ConnectApp, via: Via = 'wa', now = Date.now()): string {
  return sealPayload(LINK, { e: email.toLowerCase(), a: app, n: crypto.randomBytes(12).toString('base64url'), x: now + LINK_TTL_MS, ...(via === 'im' ? { c: 'im' } : {}) })
}

/** The personal link the chat sends. `origin` defaults to the public site (must be a redirect URI the providers know). */
export function connectLink(email: string, app: ConnectApp, origin?: string, via: Via = 'wa'): string {
  return `${(origin || baseUrl()).replace(/\/$/, '')}/api/pen/connect/${connectToken(email, app, via)}`
}

export type LinkCheck =
  | { ok: true; email: string; app: ConnectApp; nonce: string; via: Via }
  | { ok: false; reason: 'bad' }
  | { ok: false; reason: 'expired'; email: string; app: ConnectApp }

/** Signature and expiry only; whether it was used is claimNonce's job. */
export function verifyConnectToken(token: string, now = Date.now()): LinkCheck {
  const p = openPayload(LINK, token)
  if (!p || typeof p.e !== 'string' || !p.e.includes('@') || !isApp(p.a) || typeof p.n !== 'string' || typeof p.x !== 'number') return { ok: false, reason: 'bad' }
  if (p.x <= now) return { ok: false, reason: 'expired', email: p.e, app: p.a }
  return { ok: true, email: p.e, app: p.a, nonce: p.n, via: p.c === 'im' ? 'im' : 'wa' }
}

/** Spends a nonce. True the first time; false if it was already spent (or the claim failed). */
export async function claimNonce(email: string, nonce: string, app: ConnectApp): Promise<boolean> {
  const lower = email.toLowerCase()
  await supabaseAdmin.from('pen_proactive_log').delete().eq('user_email', lower).eq('kind', 'connect').lt('sent_at', new Date(Date.now() - DAY).toISOString()).then(() => {}, () => {})
  const { error } = await supabaseAdmin.from('pen_proactive_log').insert({ user_email: lower, kind: 'connect', ref: nonce, status: 'used', channel: app, sent_at: new Date().toISOString() })
  if (!error) return true
  if (error.code !== '23505') console.warn(`pen connect: nonce claim failed: ${error.message}`)
  return false
}

/* ------------------------------------------------------- the OAuth state */

const STATE = 'pen-connect-state'
const CHAT_PREFIX = 'c.'

/** The OAuth state for a connect that started in the chat: account, app, browser nonce, channel. */
export function chatState(email: string, app: ConnectApp, nonce: string, via: Via, now = Date.now()): string {
  return CHAT_PREFIX + sealPayload(STATE, { e: email.toLowerCase(), a: app, n: nonce, x: now + STATE_TTL_MS, v: via })
}

/**
 * The account a chat-started callback belongs to, or null (not a chat state, tampered, expired,
 * other app, or not this browser's nonce cookie). The website flow's states never match.
 */
export function readChatState(state: string | null | undefined, app: ConnectApp, nonce: string | null | undefined, now = Date.now()): { email: string; via: Via } | null {
  if (!state?.startsWith(CHAT_PREFIX) || !nonce) return null
  const p = openPayload(STATE, state.slice(CHAT_PREFIX.length))
  if (!p || p.a !== app || typeof p.e !== 'string' || typeof p.x !== 'number' || p.x <= now) return null
  if (typeof p.n !== 'string' || p.n.length !== nonce.length || !crypto.timingSafeEqual(Buffer.from(p.n), Buffer.from(nonce))) return null
  return { email: p.e, via: p.v === 'im' ? 'im' : 'wa' }
}

/** Where a chat-started callback lands: /pen/connected in the user's language. */
export async function connectedPage(app: ConnectApp, email: string, via: Via, error?: string): Promise<string> {
  const { userLang } = await import('./user-lang')
  const q = new URLSearchParams({ app, lang: await userLang(email), c: via, ...(error ? { error } : {}) })
  return `/pen/connected?${q}`
}

/* --------------------------------------------------------------- copy */

export const APP_NAME: Record<Lang, Record<ConnectApp, string>> = {
  en: { gcal: 'Google Calendar', gdrive: 'Google Docs & Sheets', notion: 'Notion', granola: 'Granola', gmail: 'Gmail' },
  es: { gcal: 'Google Calendar', gdrive: 'Google Docs y Sheets', notion: 'Notion', granola: 'Granola', gmail: 'Gmail' },
  pt: { gcal: 'Google Agenda', gdrive: 'Google Docs e Planilhas', notion: 'Notion', granola: 'Granola', gmail: 'Gmail' },
}

export const COPY = {
  en: {
    tap: (app: string, url: string) => `Tap to connect ${app} (the link works once, for 15 minutes):\n${url}`,
    connected: { gcal: (who: string | null) => `Connected ✓ Google Calendar${who ? ` (${who})` : ''}. Events you say yes to here go straight onto it.`, gdrive: (who: string | null) => `Connected ✓ Google Docs & Sheets${who ? ` (${who})` : ''}. Docs and sheets Juno makes go into a “Juno Pen” folder in your Drive; Juno can only open the files it made.`, notion: (who: string | null) => `Connected ✓ Notion${who ? ` (${who})` : ''}. Your notes land in the “Juno Pen notes” table, and plans and memos you say yes to go there too.`, granola: (who: string | null) => `Connected ✓ Granola${who ? ` (${who})` : ''}. Ask me to import your Granola meetings, e.g. “import my Granola meetings from this week”.`, gmail: (who: string | null) => `Connected ✓ Gmail${who ? ` (${who})` : ''}. When you say “send it” to a draft, it goes from this address and lands in your Sent folder. Juno can only send; it never reads your mail.` },
    pageTitle: 'Connected',
    pageLine: (app: string) => `${app} is connected. You can go back to the chat.`,
    backWa: 'Go back to WhatsApp',
    backIm: 'You can close this page and go back to Messages.',
    failTitle: 'Not connected',
    errors: {
      cancelled: 'You cancelled on the consent screen, so nothing was connected.',
      state: 'That connection attempt expired.',
      expired: 'This link expired (links last 15 minutes).',
      used: 'This link was already used (each link works once).',
      bad: 'This link isn’t valid.',
      readonly: 'Your plan has ended, so your account is read-only. Reactivate it in Settings → Billing to connect apps.',
      setup: 'This connection isn’t available yet. Try again soon.',
      failed: 'That didn’t go through.',
      not_granted: 'Sending wasn’t allowed on Google’s screen, so nothing was connected. Leave the box ticked next time.',
      too_many: 'You can connect up to 5 addresses. Disconnect one in Settings → Email first.',
    } as Record<string, string>,
    askAgain: 'Ask Juno in the chat for a new link.',
  },
  es: {
    tap: (app: string, url: string) => `Toca para conectar ${app} (el link sirve una vez, por 15 minutos):\n${url}`,
    connected: { gcal: (who: string | null) => `Conectado ✓ Google Calendar${who ? ` (${who})` : ''}. Los eventos a los que digas que sí aquí van directo a tu calendario.`, gdrive: (who: string | null) => `Conectado ✓ Google Docs y Sheets${who ? ` (${who})` : ''}. Los documentos y hojas que haga Juno van a una carpeta “Juno Pen” en tu Drive; Juno solo puede abrir los archivos que creó.`, notion: (who: string | null) => `Conectado ✓ Notion${who ? ` (${who})` : ''}. Tus notas llegan a la tabla “Juno Pen notes”, y los planes y memos que apruebes también.`, granola: (who: string | null) => `Conectado ✓ Granola${who ? ` (${who})` : ''}. Pídeme importar tus reuniones de Granola, por ejemplo “importa mis reuniones de Granola de esta semana”.`, gmail: (who: string | null) => `Conectado ✓ Gmail${who ? ` (${who})` : ''}. Cuando digas “envíalo” a un borrador, sale desde esta dirección y queda en tus Enviados. Juno solo puede enviar; nunca lee tu correo.` },
    pageTitle: 'Conectado',
    pageLine: (app: string) => `${app} quedó conectado. Ya puedes volver al chat.`,
    backWa: 'Volver a WhatsApp',
    backIm: 'Puedes cerrar esta página y volver a Mensajes.',
    failTitle: 'No se conectó',
    errors: {
      cancelled: 'Cancelaste en la pantalla de permisos, así que no se conectó nada.',
      state: 'Ese intento de conexión expiró.',
      expired: 'Este link expiró (duran 15 minutos).',
      used: 'Este link ya se usó (cada link sirve una vez).',
      bad: 'Este link no es válido.',
      readonly: 'Tu plan terminó, así que tu cuenta es solo de lectura. Reactívala en Ajustes → Facturación para conectar apps.',
      setup: 'Esta conexión aún no está disponible. Inténtalo pronto.',
      failed: 'No se pudo completar.',
      not_granted: 'No se permitió enviar en la pantalla de Google, así que no se conectó nada. La próxima vez deja la casilla marcada.',
      too_many: 'Puedes conectar hasta 5 direcciones. Primero desconecta una en Ajustes → Correo.',
    } as Record<string, string>,
    askAgain: 'Pídele a Juno un link nuevo en el chat.',
  },
  pt: {
    tap: (app: string, url: string) => `Toque para conectar o ${app} (o link funciona uma vez, por 15 minutos):\n${url}`,
    connected: { gcal: (who: string | null) => `Conectado ✓ Google Agenda${who ? ` (${who})` : ''}. Os eventos que você aprovar aqui vão direto para a sua agenda.`, gdrive: (who: string | null) => `Conectado ✓ Google Docs e Planilhas${who ? ` (${who})` : ''}. Os documentos e planilhas que o Juno criar vão para uma pasta “Juno Pen” no seu Drive; o Juno só consegue abrir os arquivos que ele criou.`, notion: (who: string | null) => `Conectado ✓ Notion${who ? ` (${who})` : ''}. Suas notas vão para a tabela “Juno Pen notes”, e os planos e memos que você aprovar também.`, granola: (who: string | null) => `Conectado ✓ Granola${who ? ` (${who})` : ''}. Peça para importar suas reuniões do Granola, por exemplo “importe minhas reuniões do Granola desta semana”.`, gmail: (who: string | null) => `Conectado ✓ Gmail${who ? ` (${who})` : ''}. Quando você disser “enviar” a um rascunho, ele sai deste endereço e fica nos seus Enviados. O Juno só consegue enviar; nunca lê seus e-mails.` },
    pageTitle: 'Conectado',
    pageLine: (app: string) => `O ${app} está conectado. Já pode voltar para o chat.`,
    backWa: 'Voltar para o WhatsApp',
    backIm: 'Pode fechar esta página e voltar para o Mensagens.',
    failTitle: 'Não conectado',
    errors: {
      cancelled: 'Você cancelou na tela de permissões, então nada foi conectado.',
      state: 'Essa tentativa de conexão expirou.',
      expired: 'Este link expirou (os links duram 15 minutos).',
      used: 'Este link já foi usado (cada link funciona uma vez).',
      bad: 'Este link não é válido.',
      readonly: 'Seu plano terminou, então sua conta é somente leitura. Reative em Configurações → Cobrança para conectar apps.',
      setup: 'Esta conexão ainda não está disponível. Tente de novo em breve.',
      failed: 'Não deu certo.',
      not_granted: 'O envio não foi permitido na tela do Google, então nada foi conectado. Da próxima vez, deixe a caixa marcada.',
      too_many: 'Você pode conectar até 5 endereços. Desconecte um em Configurações → E-mail primeiro.',
    } as Record<string, string>,
    askAgain: 'Peça um link novo ao Juno no chat.',
  },
} as const

export const asLang = (v: unknown): Lang => (v === 'es' || v === 'pt' ? v : 'en')

/* ------------------------------------------------- the chat confirmation */

const WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * "Connected ✓ …" in the chat the connect came from, and into the chat history so the agent
 * has the context. WhatsApp only inside the 24-hour window (the user asked for the link, so it
 * is open unless they waited a day); iMessage is free-form. Never throws.
 */
export async function announceConnected(email: string, app: ConnectApp, via: Via, account?: string | null): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { getLinkByEmail, setChat } = await import('./whatsapp/store')
    const link = await getLinkByEmail(email)
    if (!link?.phone || !link.linked_at) return { sent: false, reason: 'no linked phone' }
    if (via === 'wa') {
      const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('created_at').eq('email', email.toLowerCase()).not('phone', 'like', 'im:%').order('created_at', { ascending: false }).limit(1)
      const last = data?.[0]?.created_at ? Date.parse(data[0].created_at as string) : 0
      if (Date.now() - last > WINDOW_MS) return { sent: false, reason: 'outside the 24-hour window' }
    }
    const { userLang } = await import('./user-lang')
    const lang = await userLang(email)
    let who: string | null = account ?? null
    if (app === 'gmail') {
      // The address just connected comes in `account`.
    } else if (app === 'gcal' || app === 'gdrive') {
      const { getGcalConnection } = await import('./google-calendar')
      who = (await getGcalConnection(email).catch(() => null))?.calendar_email ?? null
    } else if (app === 'granola') {
      const { getConnection } = await import('./granola')
      who = (await getConnection(email).catch(() => null))?.account_email ?? null
    } else {
      const { getConnection } = await import('./notion')
      who = (await getConnection(email).catch(() => null))?.workspace_name ?? null
    }
    const text = COPY[lang].connected[app](who)
    const { sendText } = await import('./whatsapp/provider')
    await sendText(via === 'im' ? `im:${link.phone}` : link.phone, text)
    await setChat(email, [...(link.chat ?? []), { role: 'assistant', content: text, ts: Date.now() }]).catch(() => {})
    return { sent: true }
  } catch (e) {
    console.warn(`pen connect: chat confirmation not sent: ${(e as Error).message}`)
    return { sent: false, reason: (e as Error).message }
  }
}

/** Link-preview fetchers (iMessage's comes as facebookexternalhit/Twitterbot): never spend a nonce on them. */
export function isPreviewBot(ua: string | null | undefined): boolean {
  return /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|googlebot|bingbot|applebot|skypeuripreview|embedly|preview/i.test(ua ?? '')
}
