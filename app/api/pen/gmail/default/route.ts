import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { setDefault } from '@/lib/pen/gmail'

export const dynamic = 'force-dynamic'

// Settings → Email → "Make default": the address drafts go out from unless the chat names another.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { address?: unknown }
  if (typeof b.address !== 'string' || !b.address.includes('@')) return NextResponse.json({ error: 'address required' }, { status: 400 })
  try {
    return (await setDefault(email, b.address)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not connected' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
