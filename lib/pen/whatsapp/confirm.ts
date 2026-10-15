// "Merge Titi Dyas into Titi? Reply yes": one action per account waiting for the user's yes.
//
// Same guarantee as drafts: the yes must come in a LATER message than the one that asked, so
// "delete it" never deletes in the turn that found it. A new ask replaces the old one, and an
// ask older than PENDING_TTL_MS is gone ("yes" an hour later is more likely about something else).
// Stored in pen_whatsapp_links.pending.

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import type { Ctx } from './agent'
import type { ToolModule } from './tools/types'

export type Pending = { kind: string; args: Record<string, unknown>; summary: string; msgId: string; createdAt: string }

export const PENDING_TTL_MS = 30 * 60 * 1000

export async function getPending(email: string): Promise<Pending | null> {
  const { data, error } = await supabaseAdmin.from('pen_whatsapp_links').select('pending').eq('email', email.toLowerCase()).maybeSingle()
  if (error) throw new Error(error.message)
  const p = (data?.pending ?? null) as Pending | null
  if (!p || Date.now() - new Date(p.createdAt).getTime() > PENDING_TTL_MS) return null
  return p
}

export async function setPending(email: string, p: Pending | null): Promise<void> {
  const { error } = await supabaseAdmin.from('pen_whatsapp_links').update({ pending: p, updated_at: new Date().toISOString() }).eq('email', email.toLowerCase())
  if (error) throw new Error(error.message)
}

/** Store the action and tell the model what to ask. `summary` is shown to the user as-is. */
export async function askConfirm(ctx: Ctx, p: { kind: string; args: Record<string, unknown>; summary: string }): Promise<unknown> {
  await setPending(ctx.email, { ...p, msgId: ctx.msgId, createdAt: new Date().toISOString() })
  return { needs_yes: true, ask_user: p.summary, note: 'Nothing has changed yet. Ask the user exactly this and stop; their yes in the next message runs it (confirm_pending).' }
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'confirm_pending',
    description:
      'Run the action the user was asked to confirm in an EARLIER message (merge, delete, send, combine…), after a clear yes. ' +
      'Or cancel it when they say no. Never call it in the same turn the action was asked.',
    input_schema: {
      type: 'object',
      properties: { decision: { type: 'string', enum: ['yes', 'no'] } },
      required: ['decision'],
      additionalProperties: false,
    },
  },
]

async function confirmPending(ctx: Ctx, decision: string): Promise<unknown> {
  const p = await getPending(ctx.email)
  if (!p) return { error: 'nothing is waiting for a yes (it may have expired after 30 minutes); ask again' }
  if (p.msgId === ctx.msgId) return { error: 'the user has not seen this question yet; ask it and wait for their reply' }
  await setPending(ctx.email, null)
  if (decision !== 'yes') return { ok: true, cancelled: p.summary }
  const { MODULES } = await import('./tools')
  const run = MODULES.map((m) => m.confirm?.[p.kind]).find(Boolean)
  if (!run) return { error: `cannot run ${p.kind}` }
  return run(ctx, p.args)
}

export const confirmModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => (name === 'confirm_pending' ? confirmPending(ctx, String(input.decision ?? '')) : undefined),
  prompt:
    '- Destructive or outward actions (merge or delete a contact, delete a recording, combine or separate recordings, ' +
    'email someone else) never run at once: the tool returns ask_user; send exactly that question and stop. On the user\'s ' +
    'clear yes in their next message, call confirm_pending yes; on no, confirm_pending no.',
}
