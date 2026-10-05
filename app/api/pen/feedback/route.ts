import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { DISAPPOINTED, saveFeedback, type Disappointed } from '@/lib/pen/feedback'

export const dynamic = 'force-dynamic'

// The feedback pop-up's answers (PenApp FeedbackAsk). Saved, emailed to the owners, and the
// account marked so it isn't asked again.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { disappointed?: string; fix?: string; tell?: string }
  if (!DISAPPOINTED.includes(b.disappointed as Disappointed)) return NextResponse.json({ error: 'Pick an answer to the first question.' }, { status: 400 })
  try {
    await saveFeedback(email, { disappointed: b.disappointed as Disappointed, fix: typeof b.fix === 'string' ? b.fix : undefined, tell: typeof b.tell === 'string' ? b.tell : undefined })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
