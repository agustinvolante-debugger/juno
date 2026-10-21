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
//
// One yes for the whole request (22 Oct, founder: "delete test 2, test 3 and test on phone" asked
// once but the yes deleted one): every askConfirm in ONE turn adds to that turn's batch (the same
// action twice is kept once), and the question is the whole batch, a line and a numbered list. One
// yes (typed, the web button, a 👍) runs every item in order and reports each; no drops them all.
// A next message that changes the instructions ("only test 2") is the model's: it sees the list
// and runs a subset (confirm_pending only: [n]) or asks again (a new batch replaces the old one).
// Rows written before have no items: they are one action (pendingItems).

/** One action waiting in a batch. line / group / people / tail only shape the batch's question. */
export type PendingItem = {
  kind: string
  args: Record<string, unknown>
  /** The question for this action alone ("Delete "X"…? Chris will get Google's cancellation. Reply yes."). */
  summary: string
  /** The action as a list line ('"Test 2", Tue Oct 21, 3:00 PM'). Default: the summary without its question. */
  line?: string
  /** Items with the same group are said together: "Delete {n} events from your Google Calendar". */
  group?: string
  /** Other people the action emails, and what they get ("will get Google's cancellation"). */
  people?: string[]
  tail?: string
}

export type Pending = {
  /** One item: its kind and args (as before 22 Oct). Several: 'batch' and {} (the items carry them). */
  kind: string
  args: Record<string, unknown>
  summary: string
  msgId: string
  createdAt: string
  /** Provider ids of the reply that asked (Meta wamid / Sendblue handle), and its text. */
  outIds?: string[]
  outText?: string
  /** Every action the one yes runs, in order. Absent on older rows: the single kind / args / summary. */
  items?: PendingItem[]
}

/** The actions a pending runs: its items, or (a row from before batches) the one action. */
export function pendingItems(p: Pick<Pending, 'kind' | 'args' | 'summary' | 'items'>): PendingItem[] {
  return p.items?.length ? p.items : [{ kind: p.kind, args: p.args, summary: p.summary }]
}

const noAsk = (s: string) => s.replace(/\s*Reply yes\b[^.?!]*[.!]?\s*$/i, '').trim()
/** An item's question as a statement: "Delete "X" for good?" → "Delete "X" for good". */
const asLine = (i: PendingItem) => i.line ?? noAsk(i.summary).replace(/\?(\s|$)/g, (_, sp: string) => (sp ? '.' + sp : '')).trim()
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
/** "Chris "Titi" Dyas <chris@x.com>" → "Chris "Titi" Dyas"; a bare address stays. */
const shortName = (g: string) => g.replace(/\s*<[^>]+>\s*$/, '').trim() || g

/**
 * The one question for a batch: a single item is its own question; several are one line (said
 * together when they are the same kind of change on the same calendar) and the numbered list
 * (the numbers confirm_pending only takes).
 */
export function batchSummary(items: PendingItem[]): string {
  if (items.length === 1) return items[0].summary
  const n = items.length
  const g = items[0].group
  const together = g && items.every((i) => i.group === g && (i.tail ?? '') === (items[0].tail ?? ''))
  const people = [...new Set(items.flatMap((i) => i.people ?? []).map(shortName))]
  const head = together
    ? `${g!.replace('{n}', String(n))}${people.length && items[0].tail ? ` — ${names(people)} ${items[0].tail}` : ''}?`
    : `Do these ${n} things?`
  return `${head}\n${items.map((i, k) => `${k + 1}. ${asLine(i)}`).join('\n')}\nReply yes to do all ${n}.`
}

/** The same action asked twice in a turn (a second round, the nudge) is one item. */
const sameItem = (a: PendingItem, b: PendingItem) => a.kind === b.kind && JSON.stringify(a.args) === JSON.stringify(b.args)

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

/**
 * Add the action to this turn's batch, store the batch and tell the model what to ask. The first
 * ask of a turn starts a new batch (replacing an older question); later ones in the same turn add
 * to it. The summary (the batch's, batchSummary) is shown to the user as-is.
 */
export async function askConfirm(ctx: Ctx, p: PendingItem): Promise<unknown> {
  ctx.pendingTouched = true
  ctx.askedNow = true
  const prev = ctx.batch ?? []
  const items = prev.some((i) => sameItem(i, p)) ? prev : [...prev, p]
  ctx.batch = items
  ctx.batchAt ??= new Date().toISOString()
  const pending = toPending(items, ctx.msgId, ctx.batchAt)
  await stateOf(ctx).setPending(pending)
  ctx.asked = { kind: pending.kind, summary: pending.summary }
  return items.length === 1
    ? { needs_yes: true, ask_user: pending.summary, note: 'Nothing has changed yet. If the request has other actions, do them too first (any that needs a yes joins this same question). Then ask the user exactly ask_user, once, and stop; their yes in the next message runs it (confirm_pending).' }
    : { needs_yes: true, actions_waiting: items.length, ask_user: pending.summary, note: `Nothing has changed yet. This is now ONE question for all ${items.length} actions asked in this turn: ask the user exactly ask_user, once (never one question per action), and stop. Their one yes runs them all (confirm_pending).` }
}

/** The stored form of a batch. One item keeps the pre-batch shape (kind / args at the top). */
export function toPending(items: PendingItem[], msgId: string, createdAt: string): Pending {
  const one = items.length === 1
  return { kind: one ? items[0].kind : 'batch', args: one ? items[0].args : {}, summary: batchSummary(items), msgId, createdAt, items }
}

/** The system-prompt line while a question waits: a batch is listed with its numbers (for only). */
export function waitingLine(p: Pending): string {
  const items = pendingItems(p)
  if (items.length === 1) return `\nWaiting for the user's yes (asked earlier): ${p.summary}\n`
  return (
    `\nWaiting for the user's one yes (asked earlier) for these ${items.length} actions:\n${items.map((i, k) => `${k + 1}. ${asLine(i)}`).join('\n')}\n` +
    'A clear yes runs all of them (confirm_pending yes). If their message changes it ("only 2", "not the second one", "just Test 2"), call ' +
    'confirm_pending yes with only: the numbers to run (the rest are dropped), or ask again for a new set; never ask about the ones they already settled.\n'
  )
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'confirm_pending',
    description:
      'Run the action(s) the user was asked to confirm in an EARLIER message (merge, delete, send, combine…), after a clear yes: ' +
      'all of them, or only some (only: their numbers in the list asked) when the user changed it ("only the first", "not Test 3"). ' +
      'Or cancel them all when they say no. Never call it in the same turn the action was asked.',
    input_schema: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['yes', 'no'] },
        only: { type: 'array', items: { type: 'integer' }, description: 'With yes: the numbers (1, 2, …) of the listed actions to run; the others are dropped. Omit to run all.' },
      },
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

/**
 * The yes (or no) to the waiting question: every item in order, or only the numbers given. One
 * item answers as before (its own result); several answer with one result per item (done, or
 * failed and why), so the reply reports them all at once.
 */
export async function confirmPending(ctx: Ctx, decision: string, only?: number[]): Promise<unknown> {
  ctx.pendingTouched = true
  const p = await stateOf(ctx).getPending()
  if (!p) return { error: 'nothing is waiting for a yes (it may have expired after 30 minutes); ask again' }
  if (p.msgId === ctx.msgId || unseen(p.createdAt, ctx.sentAt)) return { error: 'the user has not seen this question yet; ask it and wait for their reply' }
  const items = pendingItems(p)
  if (decision !== 'yes') {
    await stateOf(ctx).setPending(null)
    return { ok: true, cancelled: items.length === 1 ? p.summary : items.map(asLine) }
  }
  const want = (only ?? []).filter((x) => Number.isInteger(x))
  const picked = want.length ? items.map((it, k) => ({ it, k })).filter(({ k }) => want.includes(k + 1)) : items.map((it, k) => ({ it, k }))
  if (!picked.length) return { error: `only must be numbers from 1 to ${items.length}`, waiting: items.map((i, k) => `${k + 1}. ${asLine(i)}`) }
  await stateOf(ctx).setPending(null)
  const { MODULES } = await import('./tools')
  const runOne = async (it: PendingItem): Promise<unknown> => {
    const run = MODULES.map((m) => m.confirm?.[it.kind]).find(Boolean)
    if (!run) return { error: `cannot run ${it.kind}` }
    try {
      return await run(ctx, it.args)
    } catch (e) {
      return { error: (e as Error).message.slice(0, 200) }
    }
  }
  if (items.length === 1) return runOne(items[0])
  const results: Record<string, unknown>[] = []
  for (const { it, k } of picked) {
    const r = await runOne(it)
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : { result: r }
    results.push('error' in o ? { item: k + 1, action: asLine(it), failed: String(o.error) } : { item: k + 1, action: asLine(it), done: true, ...o })
  }
  const skipped = items.filter((_, k) => !picked.some((x) => x.k === k)).map(asLine)
  return {
    ok: results.every((r) => r.done),
    results,
    ...(skipped.length ? { not_done_as_asked: skipped } : {}),
    note: 'Report every action in ONE reply, one short line each: done, or failed with the reason (each result\'s own note says how to word a done one). Don\'t ask anything again.',
  }
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
  run: (ctx, name, input) => (name === 'confirm_pending' ? confirmPending(ctx, String(input.decision ?? ''), Array.isArray(input.only) ? input.only.map(Number) : undefined) : undefined),
  confirm: { save_contacts: saveCards },
  prompt:
    '- Ask once, only where the tools ask. A tool that returns ask_user (delete a recording, delete or merge a contact, ' +
    'email or invite other people, change an event that has guests) has changed nothing: send exactly that question and ' +
    'stop. On the user\'s clear yes in their next message, call confirm_pending yes; on no, confirm_pending no.\n' +
    '- When one request needs several confirmations ("delete A, B and C"), do all the lookups and actions first, then ask once for the whole ' +
    'set: each tool that asks adds to the same question, and the last ask_user is that one question (a line and a numbered list). One yes runs ' +
    'them all. If the user then changes it ("only A", "not C"), run just those with confirm_pending only, or ask again for the new set.\n' +
    '- Everything else the user asks for runs at once (reminders, to-dos, add to their calendar, combine or separate recordings, delete or move an event with no ' +
    'guests, disconnect an app): never add your own "are you sure?", "shall I?" or "reply yes to confirm" first, also when the time comes from something you ' +
    'looked up (a meeting found in their calendar or an email: set the reminders in the same turn). Say in one ' +
    'line exactly what was done, and pass on the undo line when the tool gives one.',
}
