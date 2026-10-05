import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { markOnboarding } from '@/lib/pen/profile'

export const dynamic = 'force-dynamic'

// The tour was finished or skipped: remember it on the account so it doesn't replay on every
// device. "Take the tour" in the menu still replays it on demand.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { step?: string }
  // 'referral': the "give a month, get a month" pop-up was seen (PenApp ReferralPromo).
  // 'feedback': the feedback pop-up was answered or dismissed (PenApp FeedbackAsk).
  if (b.step !== 'tour' && b.step !== 'referral' && b.step !== 'feedback') return NextResponse.json({ error: 'unknown step' }, { status: 400 })
  try {
    await markOnboarding(email, b.step)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
