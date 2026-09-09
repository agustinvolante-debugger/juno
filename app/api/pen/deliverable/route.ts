import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession } from '@/lib/pen/store'
import type { Deliverable } from '@/lib/pen/store'
import { draftDeliverable, type DeliverableKind } from '@/lib/pen/deliverables'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const KINDS: DeliverableKind[] = ['email', 'memo', 'tracker']

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; kind?: string; item?: string }
  if (!b.id || !b.item?.trim()) return NextResponse.json({ error: 'id and item required' }, { status: 400 })
  if (!KINDS.includes(b.kind as DeliverableKind)) {
    return NextResponse.json({ error: 'kind must be email, memo or tracker' }, { status: 400 })
  }

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    const drafted = await draftDeliverable({
      kind: b.kind as DeliverableKind,
      item: b.item.slice(0, 1200),
      notes: session.notes ?? {},
      sessionTitle: session.title ?? session.source_name ?? 'Untitled',
      sessionDate: (session.recorded_at ?? session.created_at).slice(0, 10),
      clientName: session.client_name,
      userNotes: session.user_notes,
    })

    const deliverable: Deliverable = {
      ...drafted,
      id: Math.random().toString(36).slice(2, 10),
      ts: Date.now(),
    }

    // Kept so a draft survives a reload, capped so the row can't grow without bound.
    const existing = Array.isArray(session.deliverables) ? session.deliverables : []
    await updateSession(session.id, { deliverables: [deliverable, ...existing].slice(0, 40) })

    return NextResponse.json({ deliverable })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
