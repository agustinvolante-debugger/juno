// The actions Home's cards (app/api/pen/home) and the WhatsApp assistant take on one item of a
// recording's notes, without opening it:
//
//   done / undone        tick an action off, or put it back (undo)
//   handled / unhandled  mark a nearly-missed item as dealt with, or put it back
//   todo                 turn a nearly-missed item into an action, and mark it handled
//
// Each is a read-modify-write of one row's small index array. Two tabs ticking two items on
// the same recording in the same instant could lose one; at one user per row that is a
// trade worth making over a new table.

import { updateSession, type PenSession } from './store'

export type ItemOp = 'done' | 'undone' | 'handled' | 'unhandled' | 'todo'
export const ITEM_OPS: ItemOp[] = ['done', 'undone', 'handled', 'unhandled', 'todo']

/** `missing`: no item at that index. `actionIndex`: where a missed item landed as a to-do. */
export async function applyItemOp(session: PenSession, op: ItemOp, index: number): Promise<{ ok: true; actionIndex?: number } | { ok: false; missing: true }> {
  const n = session.notes ?? {}
  const toggle = (list: unknown, on: boolean) => {
    const set = new Set(Array.isArray(list) ? (list as number[]) : [])
    if (on) set.add(index)
    else set.delete(index)
    return Array.from(set).sort((x, y) => x - y)
  }
  const missedDone = missedDoneOf(session)

  if (op === 'done' || op === 'undone') {
    if (!n.actions?.[index]) return { ok: false, missing: true }
    await updateSession(session.id, { action_done: toggle(session.action_done, op === 'done') })
  } else if (op === 'handled' || op === 'unhandled') {
    if (!n.missed?.[index]) return { ok: false, missing: true }
    await updateSession(session.id, { missed_done: toggle(missedDone, op === 'handled') })
  } else {
    const m = n.missed?.[index]
    if (!m) return { ok: false, missing: true }
    const actions = [...(n.actions ?? []), { action: m.item, owner: '', due: '', priority: 'normal' as const }]
    // The user chose to take this on, so it is theirs. Labels stay parallel to actions.
    const meta = Array.isArray(session.action_meta) && session.action_meta.length === actions.length - 1
      ? [...session.action_meta, { mine: 'me' as const, due_date: null, waiting: null }]
      : session.action_meta ?? null
    await updateSession(session.id, { notes: { ...n, actions }, missed_done: toggle(missedDone, true), action_meta: meta })
    return { ok: true, actionIndex: actions.length - 1 }
  }
  return { ok: true }
}

/** Indexes of the nearly-missed items already dealt with. */
export function missedDoneOf(session: PenSession): number[] {
  const v = (session as unknown as { missed_done?: number[] }).missed_done
  return Array.isArray(v) ? v : []
}
