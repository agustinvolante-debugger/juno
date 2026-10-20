// Connected apps from the chat: "connect my Google Calendar", "conecta Notion", "connect Google
// Docs", "what's connected?", "disconnect Notion". Google Calendar and Google Docs & Sheets are
// one Google connection with two abilities (lib/pen/google-calendar.ts); each connects and
// disconnects on its own. connect_app sends a personal one-tap link
// (lib/pen/connect-link.ts) that opens Google's / Notion's consent screen directly; when it is
// done Juno says "Connected ✓" in the chat on its own. Disconnecting happens at once.
//
// Calendars (20 Oct, lib/pen/calendars.ts): with Gmail available, a calendar connects through the
// same per-address Google connection as email. "Connect my work calendar" for an address already
// connected = a one-tap re-consent link for it (send/read kept, calendar added); for a new one, a
// calendar-only link (Google's screen picks the account). Without Gmail, the old Settings → Google flow.
//
// Outlook (21 Oct, lib/pen/outlook.ts): app 'outlook' = a Microsoft account (work Microsoft 365 or
// personal outlook.com/hotmail), one sign-in for its calendar AND sending as the user. Shown only
// when outlookAvailable(). Several addresses; "disconnect my Outlook" deletes the token (Microsoft
// access itself is removed by the user at Microsoft: the result carries where).

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'
import { APP_NAME, COPY, connectLink, viaOf, type ConnectApp } from '../../connect-link'
import { abilities, disconnectGoogle, gcalConfigured, getGcalConnection } from '../../google-calendar'
import { disconnect as disconnectNotion, getConnection, notionConfigured } from '../../notion'
import { disconnect as disconnectGranola, getConnection as getGranola, granolaAvailable } from '../../granola'
import { calendarOff, disconnectGmail, gmailAvailable, listAccounts as gmailAccounts, listGoogleAccounts } from '../../gmail'
import { defaultCalendar, listCalendars, type Calendar } from '../../calendars'
import { matchAccount } from '../../mail-compose'
import { REMOVE_ACCESS, disconnectOutlook, listOutlookAccounts, outlookAvailable, outlookCalendarOff } from '../../outlook'
import { PERSONAL_TID } from '../../outlook-graph'

const APP_ENUM = { type: 'string', enum: ['google_calendar', 'google_docs', 'notion', 'granola', 'gmail', 'outlook'] } as const

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'connect_app',
    description:
      'Send the user a personal link that connects Google Calendar, Google Docs & Sheets (google_docs), Notion, Granola, Gmail (send-only, for sending drafts from their own address; more than one Gmail can be connected) ' +
      'or Outlook (a Microsoft account, work Microsoft 365 or personal outlook.com/hotmail: its calendar AND sending drafts from it, one sign-in; when available) to Juno in one tap ' +
      '(it opens Google\'s / Notion\'s / Granola\'s own sign-in screen; no website sign-in). Use when they ask to connect one, or say yes to ' +
      'connecting it after an action needed it. Granola: the link is Granola\'s sign-in (any plan; free plans only reach the last 30 days and ' +
      'give notes without transcripts). If they say they have a Granola API key, set api_key: true instead of sending a link.',
    input_schema: {
      type: 'object',
      properties: {
        app: APP_ENUM,
        reconnect: { type: 'boolean', description: 'true when it is already connected and they want to connect again (another account, or it stopped working), or ANOTHER calendar.' },
        account: { type: 'string', description: 'google_calendar / gmail / outlook: which account, when they name one ("my work calendar", "agustin@tryjunoapp.com"). Omit otherwise.' },
        calendar: { type: 'boolean', description: 'outlook only: true when they asked for their Outlook CALENDAR specifically (an Outlook address already connected for email gets its calendar added).' },
        api_key: { type: 'boolean', description: 'Granola only: they want to use a Granola API key (Business/Enterprise) rather than the sign-in link.' },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'connection_status',
    description: 'Which apps are connected to Juno (Google Calendar, Google Docs & Sheets, Notion, Granola, Gmail for sending, Outlook) and with which account or workspace.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'disconnect_app',
    description: 'Disconnect Google Calendar, Google Docs & Sheets, Notion, Granola, a Gmail address or an Outlook address from Juno, at once (the user asked; no need to confirm). google_calendar with account: just that calendar (Google or Outlook).',
    input_schema: {
      type: 'object',
      properties: { app: APP_ENUM, account: { type: 'string', description: 'Gmail, Outlook or a calendar: which address, when more than one is connected.' } },
      required: ['app'],
      additionalProperties: false,
    },
  },
]

const APPS: Record<string, ConnectApp> = { notion: 'notion', google_calendar: 'gcal', google_docs: 'gdrive', granola: 'granola', gmail: 'gmail', outlook: 'outlook' }
const appOf = (input: Record<string, unknown>): ConnectApp | null => APPS[str(input, 'app')] ?? null
const KEY: Record<ConnectApp, 'google_calendar' | 'google_docs' | 'notion' | 'granola' | 'gmail' | 'outlook'> = { gcal: 'google_calendar', gdrive: 'google_docs', notion: 'notion', granola: 'granola', gmail: 'gmail', outlook: 'outlook' }

async function status(email: string) {
  const [g, n, gr, grOk, gmOk] = await Promise.all([getGcalConnection(email).catch(() => null), getConnection(email).catch(() => null), getGranola(email).catch(() => null), granolaAvailable().catch(() => false), gmailAvailable().catch(() => false)])
  const gm = gmOk ? await gmailAccounts(email).catch(() => []) : []
  const olOk = await outlookAvailable().catch(() => false)
  const ol = olOk ? await listOutlookAccounts(email).catch(() => []) : []
  const cals = await listCalendars(email).catch((): Calendar[] => [])
  const def = cals.length ? await defaultCalendar(email, cals).catch(() => null) : null
  const on = abilities(g)
  const google = (yes: boolean) =>
    g && yes ? { connected: !g.last_error, account: g.calendar_email, ...(g.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: gcalConfigured() }
  return {
    google_calendar: cals.length > 1 || (cals.length === 1 && cals[0].via === 'email')
      ? { connected: cals.some((c) => !c.broken), calendars: cals.map((c) => ({ account: c.address ?? c.key, ...(def?.key === c.key ? { default_for_new_events: true } : {}), ...(c.broken ? { needs_reconnect: true } : {}) })) }
      : google(on.calendar),
    google_docs: google(on.drive),
    notion: n ? { connected: !n.last_error, workspace: n.workspace_name, ...(n.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: notionConfigured() },
    granola: gr
      ? { connected: !(gr.kind === 'mcp' && gr.last_error?.includes('Connect again')), via: gr.kind === 'api' ? 'API key' : 'Granola sign-in', account: gr.account_email, last_import_at: gr.last_import_at, ...(gr.kind === 'mcp' && gr.last_error?.includes('Connect again') ? { needs_reconnect: true } : {}) }
      : { connected: false, available: grOk },
    gmail: gm.length
      ? { connected: true, addresses: gm.map((a) => ({ address: a.address, default: a.is_default, ...(a.can_read ? { can_read: true } : { send_only: true }), ...(a.last_error ? { needs_reconnect: true } : {}) })) }
      : { connected: false, available: gmOk },
    outlook: ol.length
      ? { connected: ol.some((a) => !a.last_error), addresses: ol.map((a) => ({ address: a.address, ...(a.can_send ? { sending: true } : {}), ...(a.can_cal ? { calendar: true } : {}), ...(a.is_default && a.can_send ? { default_from: true } : {}), ...(a.last_error ? { needs_reconnect: true } : {}) })) }
      : { connected: false, available: olOk },
  }
}

async function connectApp(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const app = appOf(input)
  if (!app) return { error: 'app must be google_calendar, google_docs, notion, granola or gmail' }
  if (!(app === 'notion' ? notionConfigured() : app === 'granola' ? await granolaAvailable() : app === 'gmail' ? await gmailAvailable() : app === 'outlook' ? await outlookAvailable() : gcalConfigured())) {
    return app === 'outlook'
      ? { error: 'connecting Outlook is not available yet', next: 'say so in one line; drafts and events still come with a one-tap "Open in Outlook" link (set_mail_app / set_calendar_app outlook makes those links Outlook ones)' }
      : { error: `${APP_NAME.en[app]} connections are not available yet` }
  }
  if (app === 'outlook') return connectOutlookLink(ctx, input)
  if (app === 'granola' && input.api_key === true) {
    return {
      ok: true,
      api_key_route: true,
      message: GRANOLA_KEY[ctx.lang],
      note: 'Reply with `message` word for word, including the Granola menu path (Settings → Connectors → API keys) and where to paste it (Settings → Granola); translate only if the chat is in another language. Never ask for the key here; if they paste one anyway, do not repeat it, tell them to delete that message and paste it in Settings → Granola instead.',
    }
  }
  if (app === 'gcal' && (await gmailAvailable())) return connectCalendar(ctx, input)
  const s = (await status(ctx.email))[KEY[app]]
  // Gmail: several addresses can be connected, so a link is always sent ("connect another").
  if (s.connected && input.reconnect !== true && app !== 'gmail') {
    return { already_connected: true, ...s, note: 'Say it is already connected (with the account/workspace) in one line. Offer to connect again only if they want another account.' }
  }
  const url = connectLink(ctx.email, app, undefined, viaOf(ctx.phone))
  return {
    ok: true,
    message: COPY[ctx.lang].tap(APP_NAME[ctx.lang][app], url),
    note: 'Send the message as is (if the chat is in another language, translate the words, never the link; the link must stay whole on its own line). Add nothing else: when they finish, Juno confirms in this chat by itself.',
  }
}

/** Outlook: always a link (several addresses can be connected). A named address already connected keeps what it does (+ its calendar when asked). */
async function connectOutlookLink(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const said = str(input, 'account')
  const accounts = await listOutlookAccounts(ctx.email).catch(() => [])
  const hit = said ? accounts.find((a) => a.address === matchAccount(accounts, said)?.address) ?? null : !said && accounts.length === 1 && input.calendar === true ? accounts[0] : null
  if (hit && !hit.last_error && input.reconnect !== true && (input.calendar !== true || hit.can_cal)) {
    return { already_connected: true, account: hit.address, ...(hit.can_cal ? { calendar: true } : {}), ...(hit.can_send ? { sending: true } : {}), note: 'Say in one line it is already connected. Offer to connect another Outlook account if they want.' }
  }
  const hint = hit?.address ?? (said && /^[^\s@]+@[^\s@]+$/.test(said) ? said.toLowerCase() : null)
  const url = connectLink(ctx.email, 'outlook', undefined, viaOf(ctx.phone), { hint, cal: input.calendar === true && Boolean(hit) })
  return {
    ok: true,
    message: COPY[ctx.lang].tap(APP_NAME[ctx.lang].outlook, url),
    ...(hint ? { for_account: hint } : {}),
    note: 'Send the message as is (translate the words if needed, never the link; the link alone on its own line). Add nothing else: Juno confirms in this chat when it is done. ' +
      'If they later say their company blocked it or asked for admin approval: their IT admin has to approve Juno Pen once; Juno sends them the approval link to forward when that happens.',
  }
}

/** A calendar through the per-address Google connection (lib/pen/gmail.ts): one-tap link. */
async function connectCalendar(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const said = str(input, 'account')
  const accounts = await listGoogleAccounts(ctx.email).catch(() => [])
  const cals = await listCalendars(ctx.email).catch((): Calendar[] => [])
  const hit = said ? accounts.find((a) => a.address === matchAccount(accounts, said)?.address) ?? null : null
  const named = hit ? hit.address : said && /^[^\s@]+@[^\s@]+$/.test(said) ? said.toLowerCase() : null
  if (named && cals.some((c) => c.key === named && !c.broken) && input.reconnect !== true) {
    return { already_connected: true, calendar: named, note: 'Say in one line that calendar is already connected.' }
  }
  if (!said && cals.some((c) => !c.broken) && input.reconnect !== true) {
    return { already_connected: true, calendars: cals.map((c) => c.address ?? c.key), note: 'Say which calendars are connected in one line, and offer to connect another (then call again with reconnect true, or with account).' }
  }
  // An address connected for email without its calendar: re-consent for it. No account named and
  // exactly one address lacking its calendar, with no calendar at all yet: that one.
  const lacking = accounts.filter((a) => !a.can_cal)
  const target = hit && !hit.can_cal ? hit.address : !said && !cals.length && lacking.length === 1 ? lacking[0].address : named
  const url = connectLink(ctx.email, 'gmail', undefined, viaOf(ctx.phone), { hint: target, cal: true })
  return {
    ok: true,
    message: COPY[ctx.lang].tap(APP_NAME[ctx.lang].gcal, url),
    ...(target ? { for_account: target } : { note_account: 'Google\'s screen lets them pick the account.' }),
    note: 'Send the message as is (translate the words if needed, never the link; the link alone on its own line). Add nothing else: Juno confirms in this chat when it is done.',
  }
}

async function disconnectApp(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const app = appOf(input)
  if (!app) return { error: 'app must be google_calendar, google_docs, notion, granola or gmail' }
  if (app === 'outlook') {
    const accounts = await listOutlookAccounts(ctx.email).catch(() => [])
    if (!accounts.length) return { error: 'no Outlook account is connected' }
    const m = accounts.length === 1 && !str(input, 'account') ? accounts[0] : matchAccount(accounts, str(input, 'account'))
    const hit = m ? accounts.find((a) => a.address === m.address) : null
    if (!hit) return { error: 'which address?', connected: accounts.map((a) => a.address), next: 'ask which one' }
    return confirmDisconnect(ctx, { app, account: hit.address, personal: hit.tenant_id === PERSONAL_TID })
  }
  if (app === 'gmail') {
    const accounts = await gmailAccounts(ctx.email).catch(() => [])
    if (!accounts.length) return { error: 'no Gmail is connected' }
    const hit = accounts.length === 1 && !str(input, 'account') ? accounts[0] : matchAccount(accounts, str(input, 'account'))
    if (!hit) return { error: 'which address?', connected: accounts.map((a) => a.address), next: 'ask which one' }
    return confirmDisconnect(ctx, { app, account: hit.address })
  }
  if (app === 'gcal') {
    // One calendar among several: the one named (an address connected through Settings → Email).
    const cals = await listCalendars(ctx.email).catch((): Calendar[] => [])
    const said = str(input, 'account')
    const viaEmail = cals.filter((c) => c.via === 'email')
    const pick = said ? viaEmail.find((c) => c.address && matchAccount([{ address: c.address, is_default: false }], said)) : !cals.some((c) => c.via === 'google') && viaEmail.length === 1 ? viaEmail[0] : null
    // An Outlook calendar: turn its calendar off (the address keeps sending, if it does).
    const ms = cals.filter((c) => c.via === 'outlook')
    const msPick = said ? ms.find((c) => c.address && matchAccount([{ address: c.address, is_default: false }], said)) ?? (ms.length === 1 && /outlook|microsoft|hotmail|365/i.test(said) ? ms[0] : undefined) : null
    if (msPick?.address) {
      const r = await outlookCalendarOff(ctx.email, msPick.address)
      return { ok: r.removed, disconnected: `Outlook calendar ${msPick.address}`, ...(r.disconnected ? { whole_account_disconnected: true } : { email_still_connected: true }), note: 'Confirm in one line. Events already on that calendar stay there.' }
    }
    if (pick?.address) {
      const r = await calendarOff(ctx.email, pick.address)
      return { ok: r.removed, disconnected: `calendar ${pick.address}`, ...(r.disconnected ? { whole_account_disconnected: true } : { email_still_connected: true }), note: 'Confirm in one line. Events already on that calendar stay there.' }
    }
    if (said && !pick && viaEmail.length) return { error: 'which calendar?', connected: cals.map((c) => c.address ?? c.key), next: 'ask which one' }
  }
  const s = (await status(ctx.email))[KEY[app]]
  if (!s.connected && !('needs_reconnect' in s)) return { error: `${APP_NAME.en[app]} is not connected` }
  // The user asked: disconnected at once (18 Oct, confirm.ts). Connecting again is one link away.
  return confirmDisconnect(ctx, { app })
}

async function confirmDisconnect(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  if (args.app === 'gcal' || args.app === 'gdrive') {
    const r = await disconnectGoogle(ctx.email, args.app === 'gcal' ? 'gcal' : 'drive')
    return {
      ok: true,
      disconnected: args.app === 'gcal' ? 'Google Calendar' : 'Google Docs & Sheets',
      revoked_at_google: r.revoked,
      ...(r.partial ? { other_google_ability_still_connected: true } : {}),
      note: 'Confirm in one line. They can connect again any time by asking.' +
        (r.partial ? ' The other Google ability stays connected, so Google keeps the one permission until that is disconnected too.' : ''),
    }
  }
  if (args.app === 'gmail' && typeof args.account === 'string') {
    const r = await disconnectGmail(ctx.email, args.account)
    return { ok: r.removed, disconnected: `Gmail ${args.account}`, note: 'Confirm in one line. Drafts now go from their other connected address, or "via Juno" if none is left.' }
  }
  if (args.app === 'outlook' && typeof args.account === 'string') {
    const r = await disconnectOutlook(ctx.email, args.account)
    return {
      ok: r.removed,
      disconnected: `Outlook ${args.account}`,
      remove_access_at_microsoft: args.personal ? REMOVE_ACCESS.personal : REMOVE_ACCESS.work,
      note: 'Confirm in one line: Juno deleted its access token, so it can no longer use that account. To also remove Juno Pen from their Microsoft account, they can open remove_access_at_microsoft (give the link). Events already added and emails already sent stay.',
    }
  }
  if (args.app === 'notion') {
    await disconnectNotion(ctx.email)
    return { ok: true, disconnected: 'Notion', note: 'Confirm in one line. They can connect again any time by asking.' }
  }
  if (args.app === 'granola') {
    await disconnectGranola(ctx.email)
    return { ok: true, disconnected: 'Granola', note: 'Confirm in one line. Imported meetings stay. An API key can also be revoked in Granola (Settings → Connectors → API keys).' }
  }
  return { error: 'nothing to disconnect' }
}

/** Where a Granola API key comes from, and that it goes in Settings, never in the chat. */
const GRANOLA_KEY = {
  en: 'Granola API keys come with Business and Enterprise plans: in the Granola desktop app, Settings → Connectors → API keys → Create new key. Then paste it in Juno under Settings → Granola (on the website), not here in the chat. On another plan, I can send a Granola sign-in link instead.',
  es: 'Las claves API de Granola vienen con los planes Business y Enterprise: en la app de escritorio de Granola, Settings → Connectors → API keys → Create new key. Luego pégala en Juno en Ajustes → Granola (en la web), no aquí en el chat. Si tienes otro plan, te mando un link para iniciar sesión en Granola.',
  pt: 'As chaves de API do Granola vêm com os planos Business e Enterprise: no app do Granola para computador, Settings → Connectors → API keys → Create new key. Depois cole no Juno em Configurações → Granola (no site), não aqui no chat. Se o seu plano for outro, posso mandar um link para entrar no Granola.',
} as const

export const connectionsModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => {
    switch (name) {
      case 'connect_app': return connectApp(ctx, input)
      case 'connection_status': return status(ctx.email)
      case 'disconnect_app': return disconnectApp(ctx, input)
      default: return undefined
    }
  },
  // Kept for a disconnect asked before 18 Oct and still waiting for its yes.
  confirm: { disconnect_app: confirmDisconnect },
  prompt:
    '- Calendars: one Google connection per address covers email and calendar; up to 5 calendars (Google and Outlook together). "Connect my work calendar" → connect_app google_calendar with account. ' +
    '"Connect my Outlook" / "my Microsoft 365" / "my Hotmail" (calendar or email) → connect_app app outlook (calendar true when they said calendar); one sign-in covers its calendar and sending from it. ' +
    '"Connect another calendar" → connect_app google_calendar reconnect true.\n' +
    '- Connected apps: "connect my Google Calendar" / "conecta Notion" / "connect Google Docs" (or Sheets, Drive: app google_docs) / "connect Granola" / "connect my Gmail" (or "another Gmail", "my work email": app gmail; send-only) → ' +
    'connect_app and send its message as is (a one-tap link; ' +
    'Juno confirms in the chat when it is done, so do not ask them to tell you). "What\'s connected?" → connection_status. ' +
    'Disconnect → disconnect_app (runs at once; don\'t ask first). When a calendar, Google Docs/Sheets or Notion action fails because it is not connected or needs ' +
    'reconnecting, say so in one line and offer to send the link (on their yes: connect_app). Never send people to Settings for this, ' +
    'except a Granola API key: that is only ever pasted in Settings → Granola. When they mention a Granola API key, call connect_app (app granola, api_key true) and send its message. Never accept a key in the chat.',
}
