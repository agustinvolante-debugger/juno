import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { disconnectGmail } from '@/lib/pen/gmail'

export const dynamic = 'force-dynamic'

// Settings → Email → Disconnect one address. Revokes at Google unless that Google account is also
// connected for Calendar/Docs (lib/pen/gmail.ts). Open to read-only accounts: taking access away
// must always work.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { address?: unknown }
  if (typeof b.address !== 'string' || !b.address.includes('@')) return NextResponse.json({ error: 'address required' }, { status: 400 })
  try {
    const r = await disconnectGmail(email, b.address)
    return r.removed ? NextResponse.json({ ok: true, revoked: r.revoked }) : NextResponse.json({ error: 'not connected' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
