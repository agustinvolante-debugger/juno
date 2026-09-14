import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { deleteChat, getChat, renameChat } from '@/lib/pen/chats'

export const dynamic = 'force-dynamic'

// Explicit params type, not RouteContext<'...'> — that helper reads generated route types
// which don't exist before the first build of a new route.
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const chat = await getChat(email, id)
    if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ chat })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as { title?: string }
  const title = (b.title ?? '').trim().slice(0, 140)
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  try {
    await renameChat(email, id, title)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deleteChat(email, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
