// "Undo" for what the assistant now does without asking (18 Oct, see confirm.ts): combining
// recordings or a day into one, and separating them again. One action per account, the latest:
// "undo" / "deshacer" / "desfazer" runs it, in code (like a bare yes), for UNDO_TTL_MS.
//
// Kept on the inbound message that did it (pen_whatsapp_messages.payload.undo), so no new column:
// the newest message row carrying an undo is the last undoable action, and once it has run (done)
// there is nothing left to undo, even if an older one is still within the day.
//
// Deleting an event is not here: Google's API has no restore, and the guests-free delete is the
// user's own request. Disconnecting an app needs a new sign-in, so it isn't either.

import { supabaseAdmin } from '@/lib/supabase'
import { groupSessions, joinSegments, splitGroup } from '../merge'
import { getSession } from '../store'

export const UNDO_TTL_MS = 24 * 60 * 60 * 1000

/** The whole message is "undo", in any of the app languages. */
export const UNDO = /^\s*(undo|undo (it|that)|deshacer|deshaz(lo|lo por favor)?|desh[aá]celo|desfazer|desfaz|desfa[cç]a|desfaz isso)[\s.!]*$/i

/** separate: undoes a combine (the ids that were joined). combine: undoes a separate (the parts, in order). */
export type Undo =
  | { kind: 'separate'; ids: string[]; title: string; at: string; done?: boolean }
  | { kind: 'combine'; ids: string[]; title: string; event: boolean; at: string; done?: boolean }

type UndoIn<U = Undo> = U extends Undo ? Omit<U, 'at'> : never

type Row = { id: string; payload: Record<string, unknown> | null; created_at: string }

/** Remembers what the message msgId did, as the account's latest undoable action. */
export async function setUndo(email: string, msgId: string, u: UndoIn): Promise<void> {
  const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('payload').eq('id', msgId).eq('email', email.toLowerCase()).maybeSingle()
  if (!data) return
  await supabaseAdmin.from('pen_whatsapp_messages').update({ payload: { ...((data.payload as object) ?? {}), undo: { ...u, at: new Date().toISOString() } } }).eq('id', msgId)
}

async function latest(email: string): Promise<{ row: Row; undo: Undo } | null> {
  const { data } = await supabaseAdmin
    .from('pen_whatsapp_messages')
    .select('id,payload,created_at')
    .eq('email', email.toLowerCase())
    .not('payload->undo', 'is', null)
    .gt('created_at', new Date(Date.now() - UNDO_TTL_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  const row = (data?.[0] ?? null) as Row | null
  const undo = (row?.payload?.undo ?? null) as Undo | null
  if (!row || !undo || undo.done || Date.now() - Date.parse(undo.at) > UNDO_TTL_MS) return null
  return { row, undo }
}

/** The undo waiting for this account, if any (for the prompt and tests). */
export async function getUndo(email: string): Promise<Undo | null> {
  return (await latest(email))?.undo ?? null
}

/** Whether the undo stored on msgId has run: a combine still finishing after the reply checks it. */
export async function undone(msgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('payload').eq('id', msgId).maybeSingle()
  return Boolean((data?.payload as { undo?: Undo } | null)?.undo?.done)
}

/** Runs the latest undo. The result goes to the model, which says it in one line. */
export async function runUndo(email: string): Promise<Record<string, unknown>> {
  const l = await latest(email)
  if (!l) return { nothing_to_undo: true, note: 'Say in one line there is nothing to undo (undo covers combining or separating recordings, for a day).' }
  const { row, undo } = l
  // Claimed first, so two "undo"s in a row can't both run it.
  const { data: claimed } = await supabaseAdmin
    .from('pen_whatsapp_messages')
    .update({ payload: { ...(row.payload ?? {}), undo: { ...undo, done: true } } })
    .eq('id', row.id)
    .is('payload->undo->>done', null)
    .select('id')
  if (!claimed?.length) return { nothing_to_undo: true, note: 'Say in one line it was already undone.' }

  if (undo.kind === 'separate') {
    const rows = await Promise.all(undo.ids.map((id) => getSession(email, id)))
    const group = rows[0]?.merge_group ?? null
    // Still combining (the join runs after the reply): it sees `done` and stops before joining.
    if (!group) return { ok: true, undone: 'combine', recordings: undo.ids.length, title: undo.title, note: 'Say in one line they are kept as separate recordings; nothing was combined.' }
    if (rows.some((r) => r?.merge_group !== group)) return { error: 'those recordings changed since they were combined; open them on the website to separate them' }
    await splitGroup(email, group)
    return { ok: true, undone: 'combine', recordings: undo.ids.length, title: undo.title, note: 'Say in one line they are separate recordings again, each with its own notes.' }
  }

  const rows = await Promise.all(undo.ids.map((id) => getSession(email, id)))
  if (rows.some((r) => !r)) return { error: 'one of those recordings is gone; nothing was combined' }
  if (rows.some((r) => r!.merge_group)) return { error: 'one of those recordings is already part of another combined meeting; nothing was combined' }
  const group = await joinSegments(email, undo.ids)
  if (undo.event) await supabaseAdmin.from('pen_sessions').update({ event_mode: true }).eq('user_email', email).eq('merge_group', group)
  const parts = await groupSessions(email, group)
  return { ok: true, undone: 'separate', recordings: parts.length, title: undo.title, note: 'Say in one line they are one recording again, with the notes it had.' }
}
