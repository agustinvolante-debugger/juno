import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession, deleteSession } from '@/lib/pen/store'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const session = await getSession(email, id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ session })
}

// His own typed notes and the title. The Granola move is that what HE wrote is the
// spine of the note and the transcript is supporting evidence, not the other way round.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const existing = await getSession(email, id)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (typeof b.user_notes === 'string') patch.user_notes = b.user_notes
  if (typeof b.title === 'string') patch.title = b.title
  if (typeof b.client_name === 'string') patch.client_name = b.client_name
  if (Array.isArray(b.action_done)) patch.action_done = b.action_done.filter((n) => typeof n === 'number')
  // Blocks carry provenance, so validate the shape rather than trusting the client.
  if (Array.isArray(b.note_blocks)) {
    patch.note_blocks = b.note_blocks
      .filter((x): x is { id: string; text: string; source: string } => !!x && typeof x === 'object')
      .slice(0, 400)
      .map((x) => ({
        id: String(x.id).slice(0, 40),
        text: String(x.text ?? '').slice(0, 8000),
        source: x.source === 'ai' ? 'ai' : 'user',
      }))
    // Mirror to plain text so the briefing email and anything else downstream keeps working.
    patch.user_notes = (patch.note_blocks as { text: string }[]).map((x) => x.text).filter(Boolean).join('\n\n')
  }
  // The send route already persists this; the PATCH exists so the UI can reflect it without
  // a full refetch. Validated as a real timestamp so it can't be used to store arbitrary text.
  if (typeof b.briefing_sent_at === 'string' && !Number.isNaN(Date.parse(b.briefing_sent_at))) {
    patch.briefing_sent_at = new Date(b.briefing_sent_at).toISOString()
  }
  if (b.transcript_edits && typeof b.transcript_edits === 'object' && !Array.isArray(b.transcript_edits)) {
    const src = b.transcript_edits as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const k of Object.keys(src).slice(0, 2000)) {
      if (/^\d+$/.test(k) && typeof src[k] === 'string') out[k] = (src[k] as string).slice(0, 4000)
    }
    patch.transcript_edits = out
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  await updateSession(id, patch)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const ok = await deleteSession(email, id)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
