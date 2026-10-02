import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { reactivateCheckout } from '@/lib/pen/cancel'

export const dynamic = 'force-dynamic'

// A read-only account coming back: the Stripe checkout to send them to.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ url: await reactivateCheckout(email, new URL(req.url).origin) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
