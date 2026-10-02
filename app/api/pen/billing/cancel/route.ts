import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { cancel, parseFeedback } from '@/lib/pen/cancel'

export const dynamic = 'force-dynamic'

// Cancels the signed-in customer's plan at the end of the period they already have.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { reason?: string; comment?: string }
  try {
    const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 500) : ''
    return NextResponse.json({ cancelAt: await cancel(email, parseFeedback(b.reason), comment || undefined) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
