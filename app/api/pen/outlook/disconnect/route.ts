import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { disconnectOutlook } from '@/lib/pen/outlook'

export const dynamic = 'force-dynamic'

// Settings → Connections → Outlook → Disconnect one address. Deletes the token (Microsoft has no
// per-app revoke an app can call; Settings links to where the user removes Juno Pen at Microsoft).
// Open to read-only accounts: taking access away must always work.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { address?: unknown }
  if (typeof b.address !== 'string' || !b.address.includes('@')) return NextResponse.json({ error: 'address required' }, { status: 400 })
  try {
    const r = await disconnectOutlook(email, b.address)
    return r.removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not connected' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
