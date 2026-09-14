import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getChat } from '@/lib/pen/chats'
import { createDoc, listDocs, type DocKind } from '@/lib/pen/docs'
import { ACTIONS, writeArtifact } from '@/lib/pen/artifact'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ docs: await listDocs(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Generate a page from a chat thread. The kind picks which brief the model is given. */
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { chat_id?: string; kind?: string }
  const kind = (b.kind ?? 'summary') as DocKind
  if (!ACTIONS[kind]) return NextResponse.json({ error: 'unknown document type' }, { status: 400 })
  if (!b.chat_id) return NextResponse.json({ error: 'chat_id required' }, { status: 400 })

  try {
    const chat = await getChat(email, b.chat_id)
    if (!chat) return NextResponse.json({ error: 'That conversation no longer exists.' }, { status: 404 })
    const messages = Array.isArray(chat.messages) ? chat.messages : []
    if (!messages.some((m) => m.role === 'assistant')) {
      return NextResponse.json({ error: 'Ask something first — there is nothing to write up yet.' }, { status: 400 })
    }

    const { title, body } = await writeArtifact({ kind, messages })

    // Sources come from what the thread already cited, so a page can be traced back to
    // recordings without a second retrieval pass.
    const sourceIds = Array.from(
      new Set(messages.flatMap((m) => (m.citations ?? []).map((c) => c.session_id))),
    )

    const doc = await createDoc(email, { chat_id: chat.id, kind, title, body, source_ids: sourceIds })
    return NextResponse.json({ doc })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
