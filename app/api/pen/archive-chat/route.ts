import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import type { ArchiveTurn } from '@/lib/pen/store'
import { askArchive, getArchiveChat, setArchiveChat } from '@/lib/pen/archive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ messages: await getArchiveChat(email) })
}

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { question?: string; reset?: boolean }

  if (b.reset) {
    await setArchiveChat(email, [])
    return NextResponse.json({ messages: [] })
  }

  const question = (b.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })
  if (question.length > 2000) return NextResponse.json({ error: 'question too long' }, { status: 400 })

  try {
    const history = await getArchiveChat(email)
    const { answer, citations } = await askArchive({ userEmail: email, question, history })
    const now = Date.now()
    const messages: ArchiveTurn[] = [
      ...history,
      { role: 'user' as const, content: question, ts: now },
      { role: 'assistant' as const, content: answer, citations, ts: now + 1 },
    ].slice(-40)
    await setArchiveChat(email, messages)
    return NextResponse.json({ messages })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
