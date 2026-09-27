import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { pause, PAUSE_DAYS, type PauseDays } from '@/lib/pen/pause'

export const dynamic = 'force-dynamic'

// Pauses the signed-in customer's monthly subscription for 30, 60 or 90 days.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { days?: number }
  if (!PAUSE_DAYS.includes(b.days as PauseDays)) return NextResponse.json({ error: 'Choose 30, 60 or 90 days.' }, { status: 400 })
  try {
    return NextResponse.json({ pausedUntil: await pause(email, b.days as PauseDays) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
