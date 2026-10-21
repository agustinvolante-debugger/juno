// Where the assistant keeps what waits between messages: the email draft waiting for "send it",
// the yes/no question waiting for an answer, and what "undo" would reverse (lib/pen/agent-io.ts).
//
//   phone store (WhatsApp / iMessage)  exactly as before: pen_whatsapp_links.draft / .pending and
//                                      pen_whatsapp_messages.payload.undo on the inbound message.
//   web store (the web chat)           pen_chats.agent_state on the thread (WebAgentState): one
//                                      draft and one pending per thread, undo per assistant turn
//                                      (keyed by the turn's ts, which is the turn's msgId).
//
// Until `alter table pen_chats add column if not exists agent_state jsonb;` runs, the web store
// reads nothing and saves nothing (one console warning): drafts still show, but "Send" and "Yes"
// in a later turn find nothing waiting.

import { supabaseAdmin } from '@/lib/supabase'
import type { WebAgentState } from '../agent-io'
import { getDraft, setDraft, DRAFT_TTL_MS, type Draft } from './store'
import type { Pending } from './confirm'
import type { Undo, UndoIn } from './undo'

export type SetUndoAdd = { reminder?: string; event?: { ref: string; title: string }; title: string }

/** What the latest (or a given turn's) undo claim found. */
export type UndoClaim = { undo: Undo } | { nothing: true; already?: boolean }

export interface AgentStore {
  kind: 'phone' | 'web'
  getDraft(): Promise<Draft | null>
  setDraft(d: Draft | null): Promise<void>
  getPending(): Promise<Pending | null>
  setPending(p: Pending | null): Promise<void>
  /** Clears the pending only if it is still the one created at `createdAt`. */
  dropPending(createdAt: string): Promise<void>
  setUndo(msgId: string, u: UndoIn): Promise<void>
  addSetUndo(msgId: string, add: SetUndoAdd): Promise<void>
  undone(msgId: string): Promise<boolean>
  /** Marks the latest undo (or the one on `turn`) done and returns it, so it runs once. */
  claimUndo(turn?: string): Promise<UndoClaim>
}

/* ----------------------------------------------------------------- phone */

export function phoneStore(email: string): AgentStore {
  return {
    kind: 'phone',
    getDraft: () => getDraft(email),
    setDraft: (d) => setDraft(email, d),
    getPending: async () => (await import('./confirm')).getPending(email),
    setPending: async (p) => (await import('./confirm')).setPending(email, p),
    dropPending: async (createdAt) => {
      await supabaseAdmin.from('pen_whatsapp_links').update({ pending: null }).eq('email', email.toLowerCase()).eq('pending->>createdAt', createdAt)
    },
    setUndo: async (msgId, u) => (await import('./undo')).setUndo(email, msgId, u),
    addSetUndo: async (msgId, add) => (await import('./undo')).addSetUndo(email, msgId, add),
    undone: async (msgId) => (await import('./undo')).undone(msgId),
    claimUndo: async () => (await import('./undo')).claimPhoneUndo(email),
  }
}

/* ------------------------------------------------------------------- web */

let warned = false
const missing = (msg: string | undefined) => !!msg && /agent_state/.test(msg)
function warnMissing(): void {
  if (warned) return
  warned = true
  console.warn('pen web agent: pen_chats.agent_state is missing, so drafts / questions / undo are not kept between turns. Run: alter table pen_chats add column if not exists agent_state jsonb;')
}

/** Test hook: the warning shows again. */
export function _resetWarned(): void {
  warned = false
}

export async function readWebState(email: string, chatId: string): Promise<{ state: WebAgentState; messages: { role: string; ts?: number }[] }> {
  const { data, error } = await supabaseAdmin.from('pen_chats').select('agent_state,messages').eq('user_email', email).eq('id', chatId).maybeSingle()
  if (error) {
    if (missing(error.message)) {
      warnMissing()
      return { state: {}, messages: [] }
    }
    throw new Error(error.message)
  }
  return { state: ((data?.agent_state ?? null) as WebAgentState | null) ?? {}, messages: (data?.messages ?? []) as { role: string; ts?: number }[] }
}

async function writeWebState(email: string, chatId: string, state: WebAgentState): Promise<void> {
  const { error } = await supabaseAdmin.from('pen_chats').update({ agent_state: state }).eq('user_email', email).eq('id', chatId)
  if (error) {
    if (missing(error.message)) return warnMissing()
    throw new Error(error.message)
  }
}

const UNDO_TTL_MS = 24 * 60 * 60 * 1000
const PENDING_TTL_MS = 30 * 60 * 1000

export function webStore(email: string, chatId: string): AgentStore {
  const read = async () => (await readWebState(email, chatId)).state
  const patch = async (fn: (s: WebAgentState) => WebAgentState) => writeWebState(email, chatId, fn(await read()))
  const undos = (s: WebAgentState) => (s.undo ?? {}) as Record<string, Undo>
  return {
    kind: 'web',
    getDraft: async () => {
      const d = ((await read()).draft ?? null) as Draft | null
      if (!d || Date.now() - new Date(d.createdAt).getTime() > DRAFT_TTL_MS) return null
      return d
    },
    setDraft: (d) => patch((s) => ({ ...s, draft: d })),
    getPending: async () => {
      const { state, messages } = await readWebState(email, chatId)
      const p = (state.pending ?? null) as Pending | null
      if (!p || Date.now() - new Date(p.createdAt).getTime() > PENDING_TTL_MS) return null
      // As on the phone: Juno said something after the asking reply, so the question is no longer the
      // last one. (The asking turn's ts is taken before the turn runs, so it is never after createdAt.)
      const since = new Date(p.createdAt).getTime()
      if (messages.some((t) => t.role === 'assistant' && typeof t.ts === 'number' && t.ts > since)) return null
      return p
    },
    setPending: (p) => patch((s) => ({ ...s, pending: p })),
    dropPending: (createdAt) => patch((s) => ((s.pending as Pending | null)?.createdAt === createdAt ? { ...s, pending: null } : s)),
    setUndo: (msgId, u) => patch((s) => ({ ...s, undo: prune({ ...undos(s), [msgId]: { ...u, at: new Date().toISOString() } as Undo }) })),
    addSetUndo: (msgId, add) =>
      patch((s) => {
        const cur = undos(s)[msgId]
        const base = cur?.kind === 'set' && !cur.done ? cur : { kind: 'set' as const, reminders: [] as string[], events: [] as { ref: string; title: string }[], title: add.title, at: new Date().toISOString() }
        const next: Undo = {
          ...base,
          reminders: add.reminder ? [...base.reminders, add.reminder] : base.reminders,
          events: add.event ? [...base.events, add.event] : base.events,
          title: base.title || add.title,
          at: new Date().toISOString(),
        }
        return { ...s, undo: prune({ ...undos(s), [msgId]: next }) }
      }),
    undone: async (msgId) => Boolean(undos(await read())[msgId]?.done),
    claimUndo: async (turn) => {
      const s = await read()
      const all = undos(s)
      const live = (u: Undo | undefined) => !!u && Date.now() - Date.parse(u.at) <= UNDO_TTL_MS
      let key: string | undefined
      if (turn) key = turn
      else key = Object.entries(all).filter(([, u]) => live(u) && !u.done).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))[0]?.[0]
      const u = key ? all[key] : undefined
      if (!key || !u || !live(u)) return { nothing: true }
      if (u.done) return { nothing: true, already: true }
      await writeWebState(email, chatId, { ...s, undo: { ...all, [key]: { ...u, done: true } } })
      return { undo: u }
    },
  }
}

/** Undo records older than a day are dropped as new ones are written, so the row stays small. */
function prune(u: Record<string, Undo>): Record<string, Undo> {
  return Object.fromEntries(Object.entries(u).filter(([, x]) => Date.now() - Date.parse(x.at) <= UNDO_TTL_MS))
}

/** The web chat's draft for a /m/<id> link (the phone's lives in pen_whatsapp_links.draft). */
export async function webDraftById(id: string): Promise<Draft | null> {
  const { data, error } = await supabaseAdmin.from('pen_chats').select('agent_state').eq('agent_state->draft->>id', id).limit(1)
  if (error) return null
  const d = ((data?.[0]?.agent_state as WebAgentState | null)?.draft ?? null) as Draft | null
  if (!d || d.id !== id || Date.now() - new Date(d.createdAt).getTime() > DRAFT_TTL_MS) return null
  return d
}

/* ------------------------------------------------------------- for tools */

type HasStore = { email: string; msgId: string; store?: AgentStore; undoable?: boolean }

/** The turn's store; contexts built outside a turn (proactive briefs) fall back to the phone's. */
export function stateOf(ctx: { email: string; store?: AgentStore }): AgentStore {
  return ctx.store ?? phoneStore(ctx.email)
}

/** Records what this turn did for "undo", and marks the turn undoable (web: the Undo button). */
export async function turnSetUndo(ctx: HasStore, u: UndoIn): Promise<void> {
  await stateOf(ctx).setUndo(ctx.msgId, u)
  ctx.undoable = true
}

export async function turnAddSetUndo(ctx: HasStore, add: SetUndoAdd): Promise<void> {
  await stateOf(ctx).addSetUndo(ctx.msgId, add)
  ctx.undoable = true
}
