import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { askArchive } from '@/lib/pen/archive'
import { briefFor } from '@/lib/pen/profile'
import { createChat, getChat, listChats, setMessages, titleFromQuestion } from '@/lib/pen/chats'
import type { ArchiveTurn } from '@/lib/pen/store'

export const dynamic = 'force-dynamic'
// Two Opus calls (select, then answer) over a growing archive. At 60s this was returning a
// plain-text gateway timeout that the client tried to JSON.parse, which is the crash we saw.
export const maxDuration = 300

export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ chats: await listChats(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Ask a question. Creates the thread when `id` is absent, appends to it when present. */
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; question?: string; mentions?: unknown }
  const question = (b.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 })
  if (question.length > 2000) {
    return NextResponse.json({ error: 'That question is too long — try trimming it.' }, { status: 400 })
  }

  try {
    const chat = b.id ? await getChat(email, b.id) : await createChat(email, titleFromQuestion(question))
    if (!chat) return NextResponse.json({ error: 'That conversation no longer exists.' }, { status: 404 })

    const history = Array.isArray(chat.messages) ? chat.messages : []
    // Tags arrive as {id, kind, label}. Plain id strings are recordings, from before people.
    const raw = Array.isArray(b.mentions) ? b.mentions : []
    const tags = raw.flatMap((x) =>
      typeof x === 'string'
        ? [{ id: x, kind: 'recording', label: '' }]
        : x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string'
          ? [{ id: (x as { id: string }).id, kind: (x as { kind?: unknown }).kind === 'person' ? 'person' : 'recording', label: typeof (x as { label?: unknown }).label === 'string' ? (x as { label: string }).label : '' }]
          : [],
    )
    const labels = Object.fromEntries(tags.filter((t) => t.label).map((t) => [t.id, t.label]))
    const { answer, citations, mentioned } = await askArchive({
      userEmail: email,
      question,
      history,
      agent: await briefFor(email),
      mentions: tags.filter((t) => t.kind === 'recording').map((t) => t.id),
      people: tags.filter((t) => t.kind === 'person').map((t) => t.id),
      labels,
    })
    const now = Date.now()
    const messages: ArchiveTurn[] = [
      ...history,
      { role: 'user', content: question, ...(mentioned.length ? { mentions: mentioned } : {}), ts: now },
      { role: 'assistant', content: answer, citations, ts: now + 1 },
    ]
    const saved = await setMessages(email, chat.id, messages)
    return NextResponse.json({ chat: saved })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
