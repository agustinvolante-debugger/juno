import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession } from '@/lib/pen/store'
import type { ChatTurn } from '@/lib/pen/store'
import { askTranscript } from '@/lib/pen/chat'
import { toDialogue } from '@/lib/pen/aai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; question?: string; reset?: boolean }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (b.reset) {
    await updateSession(session.id, { chat: [] })
    return NextResponse.json({ chat: [] })
  }

  const question = (b.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })
  if (question.length > 2000) return NextResponse.json({ error: 'question too long' }, { status: 400 })

  const dialogue = toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  if (!dialogue.trim()) return NextResponse.json({ error: 'no transcript to ask about yet' }, { status: 400 })

  const history: ChatTurn[] = Array.isArray(session.chat) ? session.chat : []

  try {
    const answer = await askTranscript({ dialogue, notes: session.notes ?? {}, history, question })
    const now = Date.now()
    // Capped so one long-running conversation can't grow the row unboundedly.
    const chat: ChatTurn[] = [
      ...history,
      { role: 'user' as const, content: question, ts: now },
      { role: 'assistant' as const, content: answer, ts: now + 1 },
    ].slice(-40)
    await updateSession(session.id, { chat })
    return NextResponse.json({ chat })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
