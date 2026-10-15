import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { disconnectGoogle } from '@/lib/pen/google-calendar'

export const dynamic = 'force-dynamic'

// Settings → Google → Disconnect, for Calendar ({what:'gcal'}, the default), Docs & Sheets
// ({what:'drive'}) or both ({what:'all'}). The last ability off revokes at Google and deletes the
// token (lib/pen/google-calendar.ts disconnectGoogle). Open to read-only accounts too: taking
// access away must always work.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { what?: string }
  const what = b.what === 'drive' || b.what === 'all' ? b.what : 'gcal'
  try {
    const r = await disconnectGoogle(email, what)
    return NextResponse.json({ ok: true, revoked: r.revoked, partial: r.partial })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
