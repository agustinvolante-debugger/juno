import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { deletePerson, enrichPerson, unlinkPerson, updatePerson } from '@/lib/pen/people'

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
    const m = (e as Error).message
    // A name already in the list: 409 with a code, so the page can say it in the user's language.
    if (/already exists/i.test(m)) return NextResponse.json({ error: m, code: 'duplicate' }, { status: 409 })
    return NextResponse.json({ error: m }, { status: 400 })
  }
}

/**
 * DELETE ?session=<id> takes the person off that recording. The person stays in the list with
 * their other recordings; a wrong link is a small mistake and should cost a small undo.
 *
 * DELETE ?contact=1 deletes the contact itself, with its links to recordings (the People list's
 * "Delete", after a confirmation). Explicit, so a request missing its session can never delete
 * someone by accident.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const q = new URL(req.url).searchParams
  if (q.get('contact') === '1') {
    try {
      await deletePerson(email, id)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }
  const sessionId = q.get('session')
  if (!sessionId) return NextResponse.json({ error: 'session required' }, { status: 400 })
  try {
    await unlinkPerson(email, sessionId, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
