import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { disconnect } from '@/lib/pen/granola'

export const dynamic = 'force-dynamic'

// Settings → Granola → Disconnect: deletes the stored key or token. Recordings already imported stay.
export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    await disconnect(email)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
