import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { isOwner } from '@/lib/pen/owner'
import { setPenShipped } from '@/lib/pen/customers'

export const dynamic = 'force-dynamic'

// Owner only: mark a customer's pen as posted, or undo it.
export async function POST(req: Request) {
  const me = await authedEmail()
  if (!isOwner(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { email?: string; shipped?: boolean }
  if (!b.email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  try {
    await setPenShipped(b.email, b.shipped !== false)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
