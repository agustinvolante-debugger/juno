import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { connectKey, granolaAvailable } from '@/lib/pen/granola'

export const dynamic = 'force-dynamic'

// Settings → Granola → paste an API key (Business / Enterprise plans). Checked with one call to
// Granola before it is kept, sealed. Never accepted from the chat.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })
  if (!(await granolaAvailable())) return NextResponse.json({ error: 'Granola isn’t available yet. Try again soon.' }, { status: 503 })
  const b = (await req.json().catch(() => ({}))) as { key?: unknown }
  if (typeof b.key !== 'string' || !b.key.trim()) return NextResponse.json({ error: 'Paste your Granola API key.' }, { status: 400 })
  try {
    const c = await connectKey(email, b.key)
    return NextResponse.json({ ok: true, connection: c })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}
