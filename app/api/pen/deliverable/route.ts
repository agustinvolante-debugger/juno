import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { getSession, updateSession } from '@/lib/pen/store'
import type { Deliverable } from '@/lib/pen/store'
import { draftDeliverable, type DeliverableKind } from '@/lib/pen/deliverables'
import { segmentsFor } from '@/lib/pen/conference'
import { clock, eventName, type Segment } from '@/lib/pen/name-hints'
import { namedDialogue, type SpeakerMap } from '@/lib/pen/speakers'
import type { PenSession } from '@/lib/pen/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const KINDS: DeliverableKind[] = ['email', 'memo', 'tracker', 'linkedin']

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Read-only after the plan ends: nothing that adds or calls a model (lib/pen/access.ts).
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; kind?: string; item?: string; conversation?: { pieces?: { session?: string; segment?: string }[] } }
  if (!b.id || !b.item?.trim()) return NextResponse.json({ error: 'id and item required' }, { status: 400 })
  if (!KINDS.includes(b.kind as DeliverableKind)) {
    return NextResponse.json({ error: 'kind must be email, memo, tracker or linkedin' }, { status: 400 })
  }

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    const conversation = b.conversation?.pieces?.length ? await conversationContext(email, b.conversation.pieces) : undefined
    const drafted = await draftDeliverable({
      conversation,
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

/**
 * One conversation of an event, for a follow-up: its topic, the name the user confirmed, and
 * what was said in its stretch of each file it spans. Only the user's own segments and recordings.
 */
async function conversationContext(email: string, pieces: { session?: string; segment?: string }[]) {
  const UUID = /^[0-9a-f-]{36}$/i
  const clean = pieces.filter((p) => UUID.test(p.session ?? '') && UUID.test(p.segment ?? '')).slice(0, 4) as { session: string; segment: string }[]
  if (!clean.length) return undefined
  const segs = await segmentsFor(email, Array.from(new Set(clean.map((p) => p.session))))
  const lines: string[] = []
  let head: Segment | null = null
  let first: PenSession | null = null
  for (const p of clean) {
    const seg = (segs[p.session] ?? []).find((g) => g.id === p.segment)
    const s = seg ? await getSession(email, p.session) : null
    if (!seg || !s) continue
    head ??= seg
    first ??= s
    const u = s.transcript?.utterances ?? []
    for (let i = seg.first_utt; i <= seg.last_utt && i < u.length; i++) {
      lines.push(namedDialogue([u[i]], s.speaker_map as SpeakerMap | null, s.transcript_edits?.[String(i)] !== undefined ? { '0': s.transcript_edits[String(i)] } : null))
    }
  }
  if (!head || !first) return undefined
  const named = clean.map((p) => (segs[p.session] ?? []).find((g) => g.id === p.segment)?.confirmed_name).find(Boolean) ?? null
  return {
    name: named,
    event: eventName(first.title || first.source_name) || 'an event',
    when: `${clock(head.start_sec)} into the recording`,
    topic: head.topic,
    gist: head.gist,
    transcript: lines.join('\n').slice(0, 30000),
  }
}
