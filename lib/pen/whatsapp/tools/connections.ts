// Connected apps from the chat: "connect my Google Calendar", "conecta Notion", "what's
// connected?", "disconnect Notion". connect_app sends a personal one-tap link
// (lib/pen/connect-link.ts) that opens Google's / Notion's consent screen directly; when it is
// done Juno says "Connected ✓" in the chat on its own. Disconnecting asks first.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { askConfirm } from '../confirm'
import { str, type ToolModule } from './types'
import { APP_NAME, COPY, connectLink, viaOf, type ConnectApp } from '../../connect-link'
import { disconnectGcal, gcalConfigured, getGcalConnection } from '../../google-calendar'
import { disconnect as disconnectNotion, getConnection, notionConfigured } from '../../notion'

const APP_ENUM = { type: 'string', enum: ['google_calendar', 'notion'] } as const

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'connect_app',
    description:
      'Send the user a personal link that connects Google Calendar or Notion to Juno in one tap (it opens Google\'s / Notion\'s own ' +
      'permission screen; no website sign-in). Use when they ask to connect one, or say yes to connecting it after an action needed it.',
    input_schema: {
      type: 'object',
      properties: { app: APP_ENUM, reconnect: { type: 'boolean', description: 'true when it is already connected and they want to connect again (another account, or it stopped working).' } },
      required: ['app'],
      additionalProperties: false,
    },
  },
  {
    name: 'connection_status',
    description: 'Which apps are connected to Juno (Google Calendar, Notion) and with which account or workspace.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'disconnect_app',
    description: 'Disconnect Google Calendar or Notion from Juno. Asks the user to confirm first.',
    input_schema: { type: 'object', properties: { app: APP_ENUM }, required: ['app'], additionalProperties: false },
  },
]

const appOf = (input: Record<string, unknown>): ConnectApp | null => (str(input, 'app') === 'notion' ? 'notion' : str(input, 'app') === 'google_calendar' ? 'gcal' : null)

async function status(email: string) {
  const [g, n] = await Promise.all([getGcalConnection(email).catch(() => null), getConnection(email).catch(() => null)])
  return {
    google_calendar: g ? { connected: !g.last_error, account: g.calendar_email, ...(g.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: gcalConfigured() },
    notion: n ? { connected: !n.last_error, workspace: n.workspace_name, ...(n.last_error ? { needs_reconnect: true } : {}) } : { connected: false, available: notionConfigured() },
  }
}

async function connectApp(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const app = appOf(input)
  if (!app) return { error: 'app must be google_calendar or notion' }
  if (!(app === 'gcal' ? gcalConfigured() : notionConfigured())) return { error: `${APP_NAME.en[app]} connections are not available yet` }
  const s = (await status(ctx.email))[app === 'gcal' ? 'google_calendar' : 'notion']
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
  if (!app) return { error: 'app must be google_calendar or notion' }
  const s = (await status(ctx.email))[app === 'gcal' ? 'google_calendar' : 'notion']
  if (!s.connected && !('needs_reconnect' in s)) return { error: `${APP_NAME.en[app]} is not connected` }
  const what = app === 'gcal'
    ? 'Disconnect Google Calendar? Juno\'s access is revoked at Google; events already on your calendar stay. Reply yes.'
    : 'Disconnect Notion? New notes stop going there; pages already in Notion stay. Reply yes.'
  return askConfirm(ctx, { kind: 'disconnect_app', args: { app }, summary: what })
}

async function confirmDisconnect(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  if (args.app === 'gcal') {
    const r = await disconnectGcal(ctx.email)
    return { ok: true, disconnected: 'Google Calendar', revoked_at_google: r.revoked, note: 'Confirm in one line. They can connect again any time by asking.' }
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
    '- Connected apps: "connect my Google Calendar" / "conecta Notion" → connect_app and send its message as is (a one-tap link; ' +
    'Juno confirms in the chat when it is done, so do not ask them to tell you). "What\'s connected?" → connection_status. ' +
    'Disconnect → disconnect_app (asks first). When a calendar or Notion action fails because it is not connected or needs ' +
    'reconnecting, say so in one line and offer to send the link (on their yes: connect_app). Never send people to Settings for this.',
}
