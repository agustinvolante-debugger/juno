import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { getSession, updateSession } from '@/lib/pen/store'
import type { ChatTurn } from '@/lib/pen/store'
import { askTranscript } from '@/lib/pen/chat'
import { briefFor } from '@/lib/pen/profile'
import { toDialogue } from '@/lib/pen/aai'
import { groupSessions } from '@/lib/pen/merge'
import { timedDialogue } from '@/lib/pen/merge-detect'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Read-only after the plan ends: nothing that adds or calls a model (lib/pen/access.ts).
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })

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

  // Every part of a joined meeting, not just the first file: on a 7-hour event the page opens
  // part 1, and asking it about hour 6 used to find nothing. Lines carry their time from the
  // start of the meeting, so an answer can say "at 6:33".
  const parts = session.merge_group ? await groupSessions(email, session.merge_group).catch(() => [session]) : [session]
  const markers = await conversationMarkers(email, session)
  const dialogue = parts.some((p) => p.transcript?.utterances?.length)
    ? timedDialogue(parts.length ? parts : [session], markers)
    : toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  if (!dialogue.trim()) return NextResponse.json({ error: 'no transcript to ask about yet' }, { status: 400 })

  const history: ChatTurn[] = Array.isArray(session.chat) ? session.chat : []

  try {
    const answer = await askTranscript({ dialogue, notes: session.notes ?? {}, history, question, agent: await briefFor(email), conversations: await conversationLines(email, session) })
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

/** An event's conversations for the chat, one line each, times from the start. '' otherwise. */
async function conversationLines(email: string, session: import('@/lib/pen/store').PenSession): Promise<string> {
  try {
    const { conversationsOf } = await import('@/lib/pen/conference')
    const { clock, reasonEn } = await import('@/lib/pen/name-hints')
    const list = await conversationsOf(email, session)
    return list.map((c) => `${clock(c.start_sec)}–${clock(c.end_sec)} · ${c.topic} · ${c.gist ?? ''} · ` +
      (c.confirmed_name ? `with ${c.confirmed_name} (confirmed)` : c.likely.length ? `name options: ${c.likely.map((o) => `${o.name} (${reasonEn(o)})`).join(', ')}` : 'name not said')).join('\n')
  } catch {
    return ''
  }
}

/** Where each of an event's conversations starts, by file and line, with who it was with. */
async function conversationMarkers(email: string, session: import('@/lib/pen/store').PenSession): Promise<Map<string, Map<number, string>>> {
  const out = new Map<string, Map<number, string>>()
  try {
    const { conversationsOf } = await import('@/lib/pen/conference')
    const { clock, reasonEn } = await import('@/lib/pen/name-hints')
    for (const c of await conversationsOf(email, session)) {
      const head = c.pieces[0]
      const who = c.confirmed_name
        ? `the user confirmed this conversation was with ${c.confirmed_name}`
        : c.likely.length ? `name not confirmed; options: ${c.likely.map((o) => `${o.name} (${reasonEn(o)})`).join(', ')}` : 'name not said'
      const m = out.get(head.partId) ?? new Map<number, string>()
      m.set(head.seg.first_utt, `conversation ${clock(c.start_sec)}–${clock(c.end_sec)} · ${c.topic} · ${who}`)
      out.set(head.partId, m)
    }
  } catch { /* plain transcript */ }
  return out
}
