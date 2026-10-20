import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { setDefaultCalendar } from '@/lib/pen/calendars'

export const dynamic = 'force-dynamic'

// Settings → Google / Email → "Use for new events": which connected calendar new events go on
// (lib/pen/calendars.ts). key = the calendar's address, or 'gcal'.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { key?: unknown }
  if (typeof b.key !== 'string' || !b.key.trim()) return NextResponse.json({ error: 'key required' }, { status: 400 })
  try {
    return (await setDefaultCalendar(email, b.key)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not connected' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
