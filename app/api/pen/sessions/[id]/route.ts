import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession } from '@/lib/pen/store'

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
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  await updateSession(id, patch)
  return NextResponse.json({ ok: true })
}
