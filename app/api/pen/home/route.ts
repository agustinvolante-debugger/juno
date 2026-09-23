import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession } from '@/lib/pen/store'
import { isMissingSchema } from '@/lib/pen/allowance'

export const dynamic = 'force-dynamic'

// The actions Home's cards take on a single item, without opening the recording:
//
//   done / undone        tick an action off, or put it back (undo)
//   handled / unhandled  mark a nearly-missed item as dealt with, or put it back
//   todo                 turn a nearly-missed item into an action, and mark it handled
//
// Each is a read-modify-write of one row's small index array. Two tabs ticking two items on
// the same recording in the same instant could lose one; at one user per row that is a
// trade worth making over a new table.

type Op = 'done' | 'undone' | 'handled' | 'unhandled' | 'todo'

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { op?: Op; sessionId?: string; index?: number }
  const index = Number(b.index)
  if (!b.sessionId || !Number.isInteger(index) || index < 0 || !b.op) {
    return NextResponse.json({ error: 'op, sessionId and index required' }, { status: 400 })
  }

  const session = await getSession(email, b.sessionId)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const n = session.notes ?? {}
  const toggle = (list: unknown, on: boolean) => {
    const set = new Set(Array.isArray(list) ? (list as number[]) : [])
    if (on) set.add(index)
    else set.delete(index)
    return Array.from(set).sort((x, y) => x - y)
  }
  const missedDone = (session as unknown as { missed_done?: number[] }).missed_done

  try {
    if (b.op === 'done' || b.op === 'undone') {
      if (!n.actions?.[index]) return NextResponse.json({ error: 'no such action' }, { status: 404 })
      await updateSession(session.id, { action_done: toggle(session.action_done, b.op === 'done') })
    } else if (b.op === 'handled' || b.op === 'unhandled') {
      if (!n.missed?.[index]) return NextResponse.json({ error: 'no such item' }, { status: 404 })
      await updateSession(session.id, { missed_done: toggle(missedDone, b.op === 'handled') })
    } else if (b.op === 'todo') {
      const m = n.missed?.[index]
      if (!m) return NextResponse.json({ error: 'no such item' }, { status: 404 })
      const actions = [...(n.actions ?? []), { action: m.item, owner: '', due: '', priority: 'normal' as const }]
      await updateSession(session.id, { notes: { ...n, actions }, missed_done: toggle(missedDone, true) })
      return NextResponse.json({ ok: true, actionIndex: actions.length - 1 })
    } else {
      return NextResponse.json({ error: 'unknown op' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = (e as Error).message
    return NextResponse.json(
      { error: isMissingSchema(msg) ? 'Run the missed_done ALTER in lib/pen/schema.sql first.' : msg },
      { status: 500 },
    )
  }
}
