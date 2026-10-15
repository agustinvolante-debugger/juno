import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { disconnectGcal } from '@/lib/pen/google-calendar'

export const dynamic = 'force-dynamic'

// Settings → Calendar → Disconnect: revoke at Google, delete the token and the calendar data Juno
// kept. Open to read-only accounts too: taking access away must always work.
export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const r = await disconnectGcal(email)
    return NextResponse.json({ ok: true, revoked: r.revoked })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
