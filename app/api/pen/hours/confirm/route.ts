import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getCheckoutSession, stripeConfigured } from '@/lib/pen/stripe'
import { settleHoursCheckout } from '@/lib/pen/hours'
import { getAllowance } from '@/lib/pen/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The success page calls this with the Checkout Session id Stripe put in the return URL.
//
// It asks Stripe directly rather than trusting the URL, so pasting someone else's session id
// does nothing, and it records the purchase without waiting on the webhook — which on
// localhost never arrives at all.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!stripeConfigured()) return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not set.' }, { status: 503 })

  const b = (await req.json().catch(() => ({}))) as { sessionId?: string }
  if (!b.sessionId || !/^cs_[A-Za-z0-9_]+$/.test(b.sessionId)) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  try {
    const cs = await getCheckoutSession(b.sessionId)
    if (cs.metadata?.kind !== 'hours' || (cs.metadata?.email ?? '').toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'That payment is not for this account.' }, { status: 403 })
    }
    if (cs.payment_status !== 'paid') {
      return NextResponse.json({ pending: true, allowance: await getAllowance(email) })
    }
    const settled = await settleHoursCheckout(cs)
    return NextResponse.json({ ok: true, hours: settled?.hours ?? 0, resumed: settled?.resumed ?? 0, allowance: await getAllowance(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
