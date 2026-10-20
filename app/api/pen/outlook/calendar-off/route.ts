import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { outlookCalendarOff } from '@/lib/pen/outlook'

export const dynamic = 'force-dynamic'

// Settings → Outlook → "Turn off calendar": Juno stops reading and adding events there; the address
// keeps sending. A calendar-only address is disconnected outright.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { address?: unknown }
  if (typeof b.address !== 'string' || !b.address.includes('@')) return NextResponse.json({ error: 'address required' }, { status: 400 })
  try {
    const r = await outlookCalendarOff(email, b.address)
    return r.removed ? NextResponse.json({ ok: true, ...r }) : NextResponse.json({ error: 'not connected' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
