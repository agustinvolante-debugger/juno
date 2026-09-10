import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession } from '@/lib/pen/store'
import { categorize, CONFIDENCE_FLOOR } from '@/lib/pen/categorize'
import { toDialogue } from '@/lib/pen/aai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const dialogue = toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  if (!dialogue.trim()) return NextResponse.json({ error: 'no transcript yet' }, { status: 400 })

  try {
    const r = await categorize(dialogue)
    // Only write it when the model is actually confident. Below the floor we leave the field
    // null so the UI asks, rather than putting a wrong label in the user's nav.
    const accepted = Boolean(r.category) && r.confidence >= CONFIDENCE_FLOOR
    if (accepted) await updateSession(session.id, { meeting_type: r.category })
    return NextResponse.json({ ...r, accepted, floor: CONFIDENCE_FLOOR })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
