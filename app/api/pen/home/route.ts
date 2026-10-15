import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession } from '@/lib/pen/store'
import { isMissingSchema } from '@/lib/pen/allowance'
import { applyItemOp, ITEM_OPS, type ItemOp } from '@/lib/pen/item-ops'

export const dynamic = 'force-dynamic'

// The actions Home's cards take on a single item, without opening the recording: done/undone,
// handled/unhandled, todo. The logic is shared with the WhatsApp assistant (lib/pen/item-ops.ts).

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { op?: ItemOp; sessionId?: string; index?: number }
  const index = Number(b.index)
  if (!b.sessionId || !Number.isInteger(index) || index < 0 || !b.op) {
    return NextResponse.json({ error: 'op, sessionId and index required' }, { status: 400 })
  }
  if (!ITEM_OPS.includes(b.op)) return NextResponse.json({ error: 'unknown op' }, { status: 400 })

  const session = await getSession(email, b.sessionId)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    const r = await applyItemOp(session, b.op, index)
    if (!r.ok) return NextResponse.json({ error: b.op === 'done' || b.op === 'undone' ? 'no such action' : 'no such item' }, { status: 404 })
    return NextResponse.json(r.actionIndex !== undefined ? { ok: true, actionIndex: r.actionIndex } : { ok: true })
  } catch (e) {
    const msg = (e as Error).message
    return NextResponse.json(
      { error: isMissingSchema(msg) ? 'Run the missed_done ALTER in lib/pen/schema.sql first.' : msg },
      { status: 500 },
    )
  }
}
