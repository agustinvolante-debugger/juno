// "Merge Titi Dyas into Titi? Reply yes": one action per account waiting for the user's yes.
//
// Same guarantee as drafts: the yes must come in a LATER message than the one that asked, so
// "delete it" never deletes in the turn that found it. A new ask replaces the old one, and an
// ask older than PENDING_TTL_MS is gone ("yes" an hour later is more likely about something else).
// Stored in pen_whatsapp_links.pending.
//
// The yes has to be the very next thing, too. The ask is gone when:
//   - the user's next message isn't an answer to it (runAgent ends the turn without
//     confirm_pending: dropIfUnanswered);
//   - Juno sent anything after the message that asked (a proactive offer, a briefing): the
//     asking turn is the first assistant turn in the chat after createdAt, so a second one means
//     a later "yes" may be about that, not this;
//   - a proactive message goes out (proactive.ts clears it).

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import type { Ctx } from './agent'
import type { ToolModule } from './tools/types'
import { unseen } from './burst'
import { stateOf } from './state'

// "Ask once, only where it can't be undone or reaches other people" (18 Oct). Done at once, said
// in one line: combining or separating recordings (undo: ./undo.ts), deleting or moving an event
// with no guests, disconnecting an app, adding to the user's own calendar. Still one yes: deleting
// a recording or a contact, merging contacts (mergePeople deletes the merged card: no undo),
// anything that emails other people (briefings, invites, an event change Google sends to guests),
// and what Juno suggests itself (a contact card it was sent, "Juno noticed…" offers).
//
// A 👍 reaction on the message that asked is the same as typing yes (bot.ts): outIds are the ids
// of the message(s) that carried the question, stored once the reply has gone out.

export type Pending = {
  kind: string
  args: Record<string, unknown>
  summary: string
  msgId: string
  createdAt: string
  /** Provider ids of the reply that asked (Meta wamid / Sendblue handle), and its text. */
  outIds?: string[]
  outText?: string
}

/** Whether an action waits for a yes. Anything not listed asks (the safe default). */
const ASK: Record<string, boolean | 'if_guests'> = {
  delete_recording: true,
  delete_person: true,
  merge_people: true,
  send_briefing: true,
  calendar_invite: true,
  gcal_invite: true,
  save_contacts: true,
  delete_event: 'if_guests',
  move_event: 'if_guests',
  add_to_calendar: false,
  // The user's own reminders and to-dos, also when relative to something Juno looked up ("15 min
  // before the meeting with Chris": find_meeting sets them). Never "reply yes" (20 Oct regression).
  set_reminder: false,
  add_todo: false,
  find_meeting: false,
  set_default_calendar: false,
  combine_recordings: false,
  combine_day: false,
  separate_recordings: false,
  disconnect_app: false,
  import_granola: false,
}

export function asksFirst(action: string, facts: { guests?: boolean } = {}): boolean {
  const rule = ASK[action]
  if (rule === undefined) return true
  return rule === 'if_guests' ? facts.guests !== false : rule
}

export const PENDING_TTL_MS = 30 * 60 * 1000

/** A bare yes or no to a waiting question, in any of the app's languages. Handled in code (like
 *  "send it"): left to the model, a short "yes" was sometimes answered by asking again. */
export const BARE_YES = /^\s*(yes|yeah|yea|yep|yup|ya|ok|okay|okey|k|sure|of course|go ahead|do it|please do|add it|delete it|confirm(ed)?|correct|s[ií]+|sip|dale|claro|bueno|vale|va|de una|hazlo|h[aá]galo|sim|pode|isso|beleza|manda|👍|✅|👌)(,?\s*(please|pls|por favor|thanks|thank you|gracias|obrigad[oa]|dale))?[\s.!👍]*$/i
export const BARE_NO = /^\s*(no|nope|nah|not now|cancel|cancel it|don'?t|no thanks|no gracias|mejor no|cancela|n[aã]o|deixa|👎)[\s.!]*$/i

export async function getPending(email: string): Promise<Pending | null> {
  const { data, error } = await supabaseAdmin.from('pen_whatsapp_links').select('pending,chat').eq('email', email.toLowerCase()).maybeSingle()
  if (error) throw new Error(error.message)
  const p = (data?.pending ?? null) as Pending | null
  if (!p || Date.now() - new Date(p.createdAt).getTime() > PENDING_TTL_MS) return null
  // The asking reply, then something else from Juno: the question is no longer the last one.
  const since = new Date(p.createdAt).getTime()
  const after = ((data?.chat ?? []) as { role: string; ts?: number }[]).filter((t) => t.role === 'assistant' && typeof t.ts === 'number' && t.ts > since)
  if (after.length > 1) return null
  return p
}

/**
 * After the reply went out: if this message asked something (a Pending with its msgId), remember
 * which outgoing message(s) carried the question, so a 👍 on exactly that message is a yes.
 */
export async function notePendingOut(email: string, msgId: string, outIds: string[], outText: string): Promise<void> {
  if (!outIds.length && !outText) return
  const { data } = await supabaseAdmin.from('pen_whatsapp_links').select('pending').eq('email', email.toLowerCase()).maybeSingle()
  const p = (data?.pending ?? null) as Pending | null
  if (!p || p.msgId !== msgId) return
  await supabaseAdmin
    .from('pen_whatsapp_links')
    .update({ pending: { ...p, outIds, outText: outText.slice(0, 2000) } })
    .eq('email', email.toLowerCase())
    .eq('pending->>createdAt', p.createdAt)
}

export async function setPending(email: string, p: Pending | null): Promise<void> {
  const { error } = await supabaseAdmin.from('pen_whatsapp_links').update({ pending: p, updated_at: new Date().toISOString() }).eq('email', email.toLowerCase())
  if (error) throw new Error(error.message)
}

/** Store the action and tell the model what to ask. `summary` is shown to the user as-is. */
export async function askConfirm(ctx: Ctx, p: { kind: string; args: Record<string, unknown>; summary: string }): Promise<unknown> {
  ctx.pendingTouched = true
  ctx.askedNow = true
  await stateOf(ctx).setPending({ ...p, msgId: ctx.msgId, createdAt: new Date().toISOString() })
  ctx.asked = { kind: p.kind, summary: p.summary }
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

/**
 * End of a turn: an ask from an earlier message that this message didn't answer (no
 * confirm_pending, no new ask) is dropped, so a later "yes" can't run it. Only that same ask:
 * conditional on its createdAt, so one set meanwhile survives.
 */
export async function dropIfUnanswered(ctx: Ctx, asked: Pending | null): Promise<void> {
  if (!asked || asked.msgId === ctx.msgId || ctx.pendingTouched || unseen(asked.createdAt, ctx.sentAt)) return
  await stateOf(ctx).dropPending(asked.createdAt)
}

export async function confirmPending(ctx: Ctx, decision: string): Promise<unknown> {
  ctx.pendingTouched = true
  const p = await stateOf(ctx).getPending()
  if (!p) return { error: 'nothing is waiting for a yes (it may have expired after 30 minutes); ask again' }
  if (p.msgId === ctx.msgId || unseen(p.createdAt, ctx.sentAt)) return { error: 'the user has not seen this question yet; ask it and wait for their reply' }
  await stateOf(ctx).setPending(null)
  if (decision !== 'yes') return { ok: true, cancelled: p.summary }
  const { MODULES } = await import('./tools')
  const run = MODULES.map((m) => m.confirm?.[p.kind]).find(Boolean)
  if (!run) return { error: `cannot run ${p.kind}` }
  return run(ctx, p.args)
}

/** A contact card the user sent, after Juno offered to save it (bot.ts onContacts): all of them. */
async function saveCards(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const { saveContact } = await import('./agent')
  const cards = (Array.isArray(args.cards) ? args.cards : []) as { name: string; phones: string[]; emails: string[]; company: string | null; role: string | null }[]
  const saved: unknown[] = []
  for (const c of cards) {
    saved.push(await saveContact(ctx, { name: c.name, email: c.emails[0] ?? '', phone: c.phones[0] ?? '', company: c.company ?? '', role: c.role ?? '', session_id: '' }))
  }
  return { ok: true, saved, note: 'Say in one line who was saved to their contacts (names only).' }
}

export const confirmModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => (name === 'confirm_pending' ? confirmPending(ctx, String(input.decision ?? '')) : undefined),
  confirm: { save_contacts: saveCards },
  prompt:
    '- Ask once, only where the tools ask. A tool that returns ask_user (delete a recording, delete or merge a contact, ' +
    'email or invite other people, change an event that has guests) has changed nothing: send exactly that question and ' +
    'stop. On the user\'s clear yes in their next message, call confirm_pending yes; on no, confirm_pending no.\n' +
    '- Everything else the user asks for runs at once (reminders, to-dos, add to their calendar, combine or separate recordings, delete or move an event with no ' +
    'guests, disconnect an app): never add your own "are you sure?", "shall I?" or "reply yes to confirm" first, also when the time comes from something you ' +
    'looked up (a meeting found in their calendar or an email: set the reminders in the same turn). Say in one ' +
    'line exactly what was done, and pass on the undo line when the tool gives one.',
}
