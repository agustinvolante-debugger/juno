import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { enrichPerson, unlinkPerson, updatePerson } from '@/lib/pen/people'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Explicit params type, not RouteContext<'...'>; see app/api/pen/chats/[id]/route.ts.
type Ctx = { params: Promise<{ id: string }> }

/** Edit a person's name or email. */
export async function PATCH(req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; email?: unknown; about?: unknown }
  try {
    const person = await updatePerson(email, id, b)
    // A new description changes what the card should say; rewrite it after responding.
    if (b.about !== undefined) after(() => enrichPerson(email, id).catch(() => {}))
    return NextResponse.json({ person })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

/**
 * DELETE ?session=<id> takes the person off that recording. The person stays in the list with
 * their other recordings; a wrong link is a small mistake and should cost a small undo.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const sessionId = new URL(req.url).searchParams.get('session')
  if (!sessionId) return NextResponse.json({ error: 'session required' }, { status: 400 })
  try {
    await unlinkPerson(email, sessionId, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
