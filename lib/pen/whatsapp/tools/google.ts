// Google Docs & Sheets from the chat (lib/pen/google-drive.ts, scope drive.file):
//
//   send_to_google_docs     a recording's notes as a Google Doc ("Send to Google Docs" on the web)
//   export_todos_sheet      the user's to-dos as a Google Sheet (task, owner, due, done, recording, link)
//   export_contacts_sheet   their contacts as a Google Sheet
//
// The files land in a "Juno Pen" folder in the user's own Drive; Juno can only open files it made.
// Making a file in their own Drive is what they asked for, so it runs at once (like
// send_to_notion). Not connected: a one-tap connect link (lib/pen/connect-link.ts, app gdrive).

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'
import { getSession } from '../../store'
import { connectLink, viaOf } from '../../connect-link'
import { driveConnected, gcalConfigured } from '../../google-calendar'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (properties: Record<string, unknown>, required: string[]): Anthropic.Tool['input_schema'] => ({ type: 'object', properties, required, additionalProperties: false })

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'send_to_google_docs',
    description: 'Put a recording\'s notes in a Google Doc in the user\'s Drive ("Juno Pen" folder). Once per recording: sending again returns the same Doc. Returns the link.',
    input_schema: obj({ session_id: { type: 'string' } }, ['session_id']),
  },
  {
    name: 'export_todos_sheet',
    description:
      'Make a Google Sheet of the user\'s to-dos from their recordings (task, owner, due, done, recording, link to it in Juno). ' +
      'everyone: true to include to-dos that are other people\'s. include_done: false for open ones only.',
    input_schema: obj({ everyone: { type: 'boolean' }, include_done: { type: 'boolean' } }, ['everyone', 'include_done']),
  },
  {
    name: 'export_contacts_sheet',
    description: 'Make a Google Sheet of the user\'s contacts (name, email, role, company, their note, recordings, last seen).',
    input_schema: obj({}, []),
  },
]

/** Not connected: the one-tap link to connect Google Docs & Sheets. */
async function needDrive(ctx: Ctx): Promise<Record<string, unknown> | null> {
  if (await driveConnected(ctx.email)) return null
  if (!gcalConfigured()) return { error: 'Google Docs & Sheets is not available yet' }
  return {
    error: 'Google Docs & Sheets is not connected',
    connect_link: connectLink(ctx.email, 'gdrive', undefined, viaOf(ctx.phone)),
    next: 'say so in one line with this one-tap link on its own line (works once, 15 minutes; Juno can only open files it makes); Juno confirms here when it is connected, then try again',
  }
}

async function toDocs(ctx: Ctx, id: string): Promise<unknown> {
  const s = UUID.test(id) ? await getSession(ctx.email, id) : null
  if (!s) return { error: 'no such recording' }
  const need = await needDrive(ctx)
  if (need) return need
  if (!s.notes?.summary && !s.notes?.actions?.length) return { error: 'there are no notes to send yet' }
  const { sendNotesToDocs } = await import('../../google-exports')
  const r = await sendNotesToDocs(ctx.email, s, ctx.lang)
  return { ok: true, url: r.url, already_there: !r.created, note: 'Give the link on its own line; it is in the "Juno Pen" folder of their Drive.' }
}

async function todosSheet(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const need = await needDrive(ctx)
  if (need) return need
  const { exportTodosSheet } = await import('../../google-exports')
  const r = await exportTodosSheet(ctx.email, ctx.lang, { everyone: input.everyone === true, includeDone: input.include_done !== false })
  return { ok: true, url: r.url, rows: r.rows, note: 'Say how many to-dos are in it and give the link on its own line (a new Sheet in the "Juno Pen" folder).' }
}

async function contactsSheet(ctx: Ctx): Promise<unknown> {
  const need = await needDrive(ctx)
  if (need) return need
  const { exportContactsSheet } = await import('../../google-exports')
  const r = await exportContactsSheet(ctx.email, ctx.lang)
  return { ok: true, url: r.url, rows: r.rows, note: 'Say how many contacts are in it and give the link on its own line (a new Sheet in the "Juno Pen" folder).' }
}

export const googleModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => {
    switch (name) {
      case 'send_to_google_docs': return toDocs(ctx, str(input, 'session_id'))
      case 'export_todos_sheet': return todosSheet(ctx, input)
      case 'export_contacts_sheet': return contactsSheet(ctx)
      default: return undefined
    }
  },
  prompt:
    '- Google Docs & Sheets: "send the notes to Google Docs" / "pásalo a un Google Doc" → send_to_google_docs (Notion is ' +
    'send_to_notion: use the one they name). "Export my to-dos to a sheet" / "exporta mis pendientes a una planilla" → ' +
    'export_todos_sheet; "my contacts in a spreadsheet" → export_contacts_sheet. Each makes a file in their own Drive, so run it at ' +
    'once and give the link. Not connected: the tool returns a one-tap connect_link; send it as is.',
}
