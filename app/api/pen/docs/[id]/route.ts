import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { deleteDoc, getDoc, updateDoc } from '@/lib/pen/docs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const doc = await getDoc(email, id)
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ doc })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as { title?: string; body?: string }
  const patch: { title?: string; body?: string } = {}
  if (typeof b.title === 'string') patch.title = b.title.slice(0, 200)
  if (typeof b.body === 'string') patch.body = b.body
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  try {
    return NextResponse.json({ doc: await updateDoc(email, id, patch) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deleteDoc(email, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
