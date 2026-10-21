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
//
// 20 Oct: reminders and calendar events Juno set without asking ("remind me 15 and 30 min before
// the meeting with Chris", "add lunch Friday to my work calendar") are undoable too: "undo" cancels
// the reminders / deletes the event (no guests: it was the user's own). Everything set by one
// message is one undo (both reminders go together).
//
// 21 Oct: an edit to a Google Doc or Sheet (tools/google.ts edit_google_doc / edit_google_sheet)
// is undoable too: its record (lib/pen/google-drive.ts DriveUndo) is kept the same way, and "undo"
// puts the file back with undoDriveEdit, unless someone changed it since (then: Version history).

import { supabaseAdmin } from '@/lib/supabase'
import { groupSessions, joinSegments, splitGroup } from '../merge'
import { getSession } from '../store'
import type { AgentStore } from './state'
import type { DriveUndo } from '../google-drive'

export const UNDO_TTL_MS = 24 * 60 * 60 * 1000

/** The whole message is "undo", in any of the app languages. */
export const UNDO = /^\s*(undo|undo (it|that)|deshacer|deshaz(lo|lo por favor)?|desh[aá]celo|desfazer|desfaz|desfa[cç]a|desfaz isso)[\s.!]*$/i

/** separate: undoes a combine (the ids that were joined). combine: undoes a separate (the parts, in order). */
export type Undo =
  | { kind: 'separate'; ids: string[]; title: string; at: string; done?: boolean }
  | { kind: 'combine'; ids: string[]; title: string; event: boolean; at: string; done?: boolean }
  /** set: reminder ids and calendar event refs (lib/pen/calendars.ts eventRef) made by one message. */
  | { kind: 'set'; reminders: string[]; events: { ref: string; title: string }[]; title: string; at: string; done?: boolean }
  /** drive: an edit to a Google Doc / Sheet (title = the file's name). */
  | { kind: 'drive'; rec: DriveUndo; title: string; at: string; done?: boolean }

export type UndoIn<U = Undo> = U extends Undo ? Omit<U, 'at'> : never

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

/**
 * Adds a reminder or an event to what the message msgId set (one undo for all of it). Replaces an
 * older undo of another kind on the same message (the newest thing done is the one undone).
 */
export async function addSetUndo(email: string, msgId: string, add: { reminder?: string; event?: { ref: string; title: string }; title: string }): Promise<void> {
  const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('payload').eq('id', msgId).eq('email', email.toLowerCase()).maybeSingle()
  if (!data) return
  const payload = (data.payload as Record<string, unknown> | null) ?? {}
  const cur = payload.undo as Undo | undefined
  const base = cur?.kind === 'set' && !cur.done ? cur : { kind: 'set' as const, reminders: [], events: [], title: add.title, at: new Date().toISOString() }
  const next: Undo = {
    ...base,
    reminders: add.reminder ? [...base.reminders, add.reminder] : base.reminders,
    events: add.event ? [...base.events, add.event] : base.events,
    title: base.title || add.title,
    at: new Date().toISOString(),
  }
  await supabaseAdmin.from('pen_whatsapp_messages').update({ payload: { ...payload, undo: next } }).eq('id', msgId)
}

/** Claims the account's latest undo on the phone (marked done first, so two "undo"s in a row can't both run it). */
export async function claimPhoneUndo(email: string): Promise<{ undo: Undo } | { nothing: true; already?: boolean }> {
  const l = await latest(email)
  if (!l) return { nothing: true }
  const { row, undo } = l
  const { data: claimed } = await supabaseAdmin
    .from('pen_whatsapp_messages')
    .update({ payload: { ...(row.payload ?? {}), undo: { ...undo, done: true } } })
    .eq('id', row.id)
    .is('payload->undo->>done', null)
    .select('id')
  if (!claimed?.length) return { nothing: true, already: true }
  return { undo }
}

/**
 * Runs the latest undo. The result goes to the model, which says it in one line. `store`: where
 * the undo lives (the web chat's thread: state.ts); `turn`: that turn's undo (the web Undo button).
 */
export async function runUndo(email: string, opts: { store?: AgentStore; turn?: string } = {}): Promise<Record<string, unknown>> {
  const c = opts.store ? await opts.store.claimUndo(opts.turn) : await claimPhoneUndo(email)
  if ('nothing' in c) {
    return c.already
      ? { nothing_to_undo: true, note: 'Say in one line it was already undone.' }
      : { nothing_to_undo: true, note: 'Say in one line there is nothing to undo (undo covers reminders and calendar events Juno just set, edits to Google Docs and Sheets, and combining or separating recordings, for a day).' }
  }
  const { undo } = c

  if (undo.kind === 'set') {
    const { cancelReminder } = await import('../reminders')
    const { deleteByRef } = await import('../calendars')
    const cancelled = (await Promise.all(undo.reminders.map((id) => cancelReminder(email, id).catch(() => false)))).filter(Boolean).length
    const deleted: string[] = []
    for (const e of undo.events) {
      try {
        await deleteByRef(email, e.ref)
        deleted.push(e.title)
      } catch {}
    }
    return { ok: true, undone: 'set', reminders_cancelled: cancelled, events_deleted: deleted, note: 'Say in one line what was undone (the reminders cancelled, the event taken off their calendar). If a reminder had already gone off, say that one could not be cancelled.' }
  }

  if (undo.kind === 'drive') {
    const { undoDriveEdit } = await import('../google-drive')
    const r = await undoDriveEdit(email, undo.rec)
    if (r.ok) return { ok: true, undone: 'edit', file: r.name || undo.title, restored: true, note: `Say in one line that "${r.name || undo.title}" is back to how it was before the edit.` }
    // Someone typed in the file after the edit: Juno doesn't guess (google-drive.ts), Google's history does.
    const changed = /changed since/i.test(r.error)
    return {
      ok: false,
      undone: 'nothing',
      file: undo.title,
      restored: false,
      ...(changed ? { changed_since: true } : { reason: r.error.slice(0, 200) }),
      note: changed
        ? `Say in one line that "${undo.title}" changed since Juno edited it, so Juno left it as it is: they can use File → Version history in Google to go back.`
        : `Say in one line that Juno couldn't take the edit to "${undo.title}" back right now; they can use File → Version history in Google to go back.`,
    }
  }

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
