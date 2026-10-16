// Connected apps from the chat: "connect my Google Calendar", "conecta Notion", "connect Google
// Docs", "what's connected?", "disconnect Notion". Google Calendar and Google Docs & Sheets are
// one Google connection with two abilities (lib/pen/google-calendar.ts); each connects and
// disconnects on its own. connect_app sends a personal one-tap link
// (lib/pen/connect-link.ts) that opens Google's / Notion's consent screen directly; when it is
// done Juno says "Connected ✓" in the chat on its own. Disconnecting asks first.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { askConfirm } from '../confirm'
import { str, type ToolModule } from './types'
import { APP_NAME, COPY, connectLink, viaOf, type ConnectApp } from '../../connect-link'
import { abilities, disconnectGoogle, gcalConfigured, getGcalConnection } from '../../google-calendar'
import { disconnect as disconnectNotion, getConnection, notionConfigured } from '../../notion'
import { disconnect as disconnectGranola, getConnection as getGranola, granolaAvailable } from '../../granola'

const APP_ENUM = { type: 'string', enum: ['google_calendar', 'google_docs', 'notion', 'granola'] } as const

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'connect_app',
    description:
      'Send the user a personal link that connects Google Calendar, Google Docs & Sheets (google_docs), Notion or Granola to Juno in one tap ' +
      '(it opens Google\'s / Notion\'s / Granola\'s own sign-in screen; no website sign-in). Use when they ask to connect one, or say yes to ' +
      'connecting it after an action needed it. Granola: the link is Granola\'s sign-in (any plan; free plans only reach the last 30 days and ' +
      'give notes without transcripts). If they say they have a Granola API key, set api_key: true instead of sending a link.',
    input_schema: {
      type: 'object',
      properties: {
        app: APP_ENUM,
        reconnect: { type: 'boolean', description: 'true when it is already connected and they want to connect again (another account, or it stopped working).' },
        api_key: { type: 'boolean', description: 'Granola only: they want to use a Granola API key (Business/Enterprise) rather than the sign-in link.' },
      },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'connection_status',
    description: 'Which apps are connected to Juno (Google Calendar, Google Docs & Sheets, Notion, Granola) and with which account or workspace.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'disconnect_app',
    description: 'Disconnect Google Calendar, Google Docs & Sheets, Notion or Granola from Juno. Asks the user to confirm first.',
    input_schema: { type: 'object', properties: { app: APP_ENUM }, required: ['app'], additionalProperties: false },
  },
]

const APPS: Record<string, ConnectApp> = { notion: 'notion', google_calendar: 'gcal', google_docs: 'gdrive', granola: 'granola' }
const appOf = (input: Record<string, unknown>): ConnectApp | null => APPS[str(input, 'app')] ?? null
const KEY: Record<ConnectApp, 'google_calendar' | 'google_docs' | 'notion' | 'granola'> = { gcal: 'google_calendar', gdrive: 'google_docs', notion: 'notion', granola: 'granola' }

async function status(email: string) {
  const [g, n, gr, grOk] = await Promise.all([getGcalConnection(email).catch(() => null), getConnection(email).catch(() => null), getGranola(email).catch(() => null), granolaAvailable().catch(() => false)])
  const on = abilities(g)
  const google = (yes: boolean) =>
    g && yes ? { connected: !g.last_error, account: g.calendar_email, ...(g.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: gcalConfigured() }
  return {
    google_calendar: google(on.calendar),
    google_docs: google(on.drive),
    notion: n ? { connected: !n.last_error, workspace: n.workspace_name, ...(n.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: notionConfigured() },
    granola: gr
      ? { connected: !(gr.kind === 'mcp' && gr.last_error?.includes('Connect again')), via: gr.kind === 'api' ? 'API key' : 'Granola sign-in', account: gr.account_email, last_import_at: gr.last_import_at, ...(gr.kind === 'mcp' && gr.last_error?.includes('Connect again') ? { needs_reconnect: true } : {}) }
      : { connected: false, available: grOk },
  }
}

async function connectApp(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const app = appOf(input)
  if (!app) return { error: 'app must be google_calendar, google_docs, notion or granola' }
  if (!(app === 'notion' ? notionConfigured() : app === 'granola' ? await granolaAvailable() : gcalConfigured())) return { error: `${APP_NAME.en[app]} connections are not available yet` }
  if (app === 'granola' && input.api_key === true) {
    return {
      ok: true,
      api_key_route: true,
      message: GRANOLA_KEY[ctx.lang],
      note: 'Reply with `message` word for word, including the Granola menu path (Settings → Connectors → API keys) and where to paste it (Settings → Granola); translate only if the chat is in another language. Never ask for the key here; if they paste one anyway, do not repeat it, tell them to delete that message and paste it in Settings → Granola instead.',
    }
  }
  const s = (await status(ctx.email))[KEY[app]]
  if (s.connected && input.reconnect !== true) {
    return { already_connected: true, ...s, note: 'Say it is already connected (with the account/workspace) in one line. Offer to connect again only if they want another account.' }
  }
  const url = connectLink(ctx.email, app, undefined, viaOf(ctx.phone))
  return {
    ok: true,
    message: COPY[ctx.lang].tap(APP_NAME[ctx.lang][app], url),
    note: 'Send the message as is (if the chat is in another language, translate the words, never the link; the link must stay whole on its own line). Add nothing else: when they finish, Juno confirms in this chat by itself.',
  }
}

async function disconnectApp(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const app = appOf(input)
  if (!app) return { error: 'app must be google_calendar, google_docs, notion or granola' }
  const s = (await status(ctx.email))[KEY[app]]
  if (!s.connected && !('needs_reconnect' in s)) return { error: `${APP_NAME.en[app]} is not connected` }
  const what = app === 'gcal'
    ? 'Disconnect Google Calendar? Juno stops reading and adding events; events already on your calendar stay. Reply yes.'
    : app === 'gdrive'
      ? 'Disconnect Google Docs & Sheets? Juno stops making files in your Drive; the ones it made stay yours. Reply yes.'
      : app === 'granola'
        ? 'Disconnect Granola? Juno deletes its stored key or sign-in; meetings already imported stay. Reply yes.'
        : 'Disconnect Notion? New notes stop going there; pages already in Notion stay. Reply yes.'
  return askConfirm(ctx, { kind: 'disconnect_app', args: { app }, summary: what })
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
  confirm: { disconnect_app: confirmDisconnect },
  prompt:
    '- Connected apps: "connect my Google Calendar" / "conecta Notion" / "connect Google Docs" (or Sheets, Drive: app google_docs) / "connect Granola" → ' +
    'connect_app and send its message as is (a one-tap link; ' +
    'Juno confirms in the chat when it is done, so do not ask them to tell you). "What\'s connected?" → connection_status. ' +
    'Disconnect → disconnect_app (asks first). When a calendar, Google Docs/Sheets or Notion action fails because it is not connected or needs ' +
    'reconnecting, say so in one line and offer to send the link (on their yes: connect_app). Never send people to Settings for this, ' +
    'except a Granola API key: that is only ever pasted in Settings → Granola. When they mention a Granola API key, call connect_app (app granola, api_key true) and send its message. Never accept a key in the chat.',
}
