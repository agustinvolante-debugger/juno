import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { askArchive } from '@/lib/pen/archive'
import { briefFor } from '@/lib/pen/profile'
import { createChat, getChat, listChats, setMessages, titleFromQuestion } from '@/lib/pen/chats'
import type { ArchiveTurn } from '@/lib/pen/store'
import { supabaseAdmin } from '@/lib/supabase'
import { PREVIEW_CAP, previewOf } from './preview'
import { webAgentAllowed, webAgentResponse } from '@/lib/pen/web-agent'

export const dynamic = 'force-dynamic'
// Two Opus calls (select, then answer) over a growing archive. At 60s this was returning a
// plain-text gateway timeout that the client tried to JSON.parse, which is the crash we saw.
export const maxDuration = 300

export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    // ?preview=1 (the Chats page): each thread's first question and the start of Juno's latest
    // answer, plain text, cut here so the page never ships whole threads. One query, no model.
    if (new URL(req.url).searchParams.get('preview') === '1') {
      const { data, error } = await supabaseAdmin
        .from('pen_chats')
        .select('id,title,updated_at,messages')
        .eq('user_email', email)
        .order('updated_at', { ascending: false })
        .limit(PREVIEW_CAP)
      if (error) throw new Error(error.message)
      return NextResponse.json({ chats: (data ?? []).map(previewOf) })
    }
    return NextResponse.json({ chats: await listChats(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * Ask a question. Creates the thread when `id` is absent, appends to it when present. With
 * PEN_WEB_AGENT=1 (and the user on PEN_WEB_AGENT_USERS, when set) the assistant answers with its
 * tools and the reply streams as Server-Sent Events (lib/pen/web-agent.ts, lib/pen/agent-io.ts);
 * button presses come as `action`. Otherwise: the archive answer as JSON, as before.
 */
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Read-only after the plan ends: nothing that adds or calls a model (lib/pen/access.ts).
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; question?: string; mentions?: unknown; action?: unknown }
  if (webAgentAllowed(email)) {
    try {
      return await webAgentResponse(email, b, tagsOf(b.mentions))
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }
  const question = (b.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 })
  if (question.length > 2000) {
    return NextResponse.json({ error: 'That question is too long — try trimming it.' }, { status: 400 })
  }

  try {
    const chat = b.id ? await getChat(email, b.id) : await createChat(email, titleFromQuestion(question))
    if (!chat) return NextResponse.json({ error: 'That conversation no longer exists.' }, { status: 404 })

    const history = Array.isArray(chat.messages) ? chat.messages : []
    const tags = tagsOf(b.mentions)
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

/** Tags arrive as {id, kind, label}. Plain id strings are recordings, from before people. */
function tagsOf(mentions: unknown): { id: string; kind: 'recording' | 'person'; label: string }[] {
  const raw = Array.isArray(mentions) ? mentions : []
  return raw.flatMap((x) =>
    typeof x === 'string'
      ? [{ id: x, kind: 'recording' as const, label: '' }]
      : x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string'
        ? [{ id: (x as { id: string }).id, kind: (x as { kind?: unknown }).kind === 'person' ? ('person' as const) : ('recording' as const), label: typeof (x as { label?: unknown }).label === 'string' ? (x as { label: string }).label : '' }]
        : [],
  )
}
