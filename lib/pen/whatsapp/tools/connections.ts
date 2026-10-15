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

const APP_ENUM = { type: 'string', enum: ['google_calendar', 'google_docs', 'notion'] } as const

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'connect_app',
    description:
      'Send the user a personal link that connects Google Calendar, Google Docs & Sheets (google_docs) or Notion to Juno in one tap ' +
      '(it opens Google\'s / Notion\'s own permission screen; no website sign-in). Use when they ask to connect one, or say yes to ' +
      'connecting it after an action needed it.',
    input_schema: {
      type: 'object',
      properties: { app: APP_ENUM, reconnect: { type: 'boolean', description: 'true when it is already connected and they want to connect again (another account, or it stopped working).' } },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'connection_status',
    description: 'Which apps are connected to Juno (Google Calendar, Google Docs & Sheets, Notion) and with which account or workspace.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'disconnect_app',
    description: 'Disconnect Google Calendar, Google Docs & Sheets or Notion from Juno. Asks the user to confirm first.',
    input_schema: { type: 'object', properties: { app: APP_ENUM }, required: ['app'], additionalProperties: false },
  },
]

const APPS: Record<string, ConnectApp> = { notion: 'notion', google_calendar: 'gcal', google_docs: 'gdrive' }
const appOf = (input: Record<string, unknown>): ConnectApp | null => APPS[str(input, 'app')] ?? null
const KEY: Record<ConnectApp, 'google_calendar' | 'google_docs' | 'notion'> = { gcal: 'google_calendar', gdrive: 'google_docs', notion: 'notion' }

async function status(email: string) {
  const [g, n] = await Promise.all([getGcalConnection(email).catch(() => null), getConnection(email).catch(() => null)])
  const on = abilities(g)
  const google = (yes: boolean) =>
    g && yes ? { connected: !g.last_error, account: g.calendar_email, ...(g.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: gcalConfigured() }
  return {
    google_calendar: google(on.calendar),
    google_docs: google(on.drive),
    notion: n ? { connected: !n.last_error, workspace: n.workspace_name, ...(n.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: notionConfigured() },
  }
}

async function connectApp(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const app = appOf(input)
  if (!app) return { error: 'app must be google_calendar, google_docs or notion' }
  if (!(app === 'notion' ? notionConfigured() : gcalConfigured())) return { error: `${APP_NAME.en[app]} connections are not available yet` }
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
  if (!app) return { error: 'app must be google_calendar, google_docs or notion' }
  const s = (await status(ctx.email))[KEY[app]]
  if (!s.connected && !('needs_reconnect' in s)) return { error: `${APP_NAME.en[app]} is not connected` }
  const what = app === 'gcal'
    ? 'Disconnect Google Calendar? Juno stops reading and adding events; events already on your calendar stay. Reply yes.'
    : app === 'gdrive'
      ? 'Disconnect Google Docs & Sheets? Juno stops making files in your Drive; the ones it made stay yours. Reply yes.'
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
  return { error: 'nothing to disconnect' }
}

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
    '- Connected apps: "connect my Google Calendar" / "conecta Notion" / "connect Google Docs" (or Sheets, Drive: app google_docs) → ' +
    'connect_app and send its message as is (a one-tap link; ' +
    'Juno confirms in the chat when it is done, so do not ask them to tell you). "What\'s connected?" → connection_status. ' +
    'Disconnect → disconnect_app (asks first). When a calendar, Google Docs/Sheets or Notion action fails because it is not connected or needs ' +
    'reconnecting, say so in one line and offer to send the link (on their yes: connect_app). Never send people to Settings for this.',
}
