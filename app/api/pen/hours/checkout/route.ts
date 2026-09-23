import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { createHoursCheckout, stripeConfigured } from '@/lib/pen/stripe'
import { getAccount } from '@/lib/pen/accounts'
import { HOUR_USD, MAX_HOURS_PER_PURCHASE } from '@/lib/pen/plan'

export const dynamic = 'force-dynamic'

// Starts a Stripe Checkout for extra recording hours, sold in whole hours at HOUR_USD each.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!stripeConfigured()) {
    // Named precisely, because the failure otherwise looks like a Stripe outage.
    return NextResponse.json({ error: "Buying hours isn't switched on yet. STRIPE_SECRET_KEY is not set." }, { status: 503 })
  }

  const b = (await req.json().catch(() => ({}))) as { hours?: number }
  const hours = Math.floor(Number(b.hours))
  if (!Number.isFinite(hours) || hours < 1 || hours > MAX_HOURS_PER_PURCHASE) {
    return NextResponse.json({ error: `Choose between 1 and ${MAX_HOURS_PER_PURCHASE} hours.` }, { status: 400 })
  }

  // Back to whichever host they came from, so localhost returns to localhost and the
  // subdomain to the subdomain. /pen/settings/hours is a real route on both.
  const origin = new URL(req.url).origin
  try {
    const account = await getAccount(email)
    const session = await createHoursCheckout({
      email: email.toLowerCase(),
      hours,
      unitCents: Math.round(HOUR_USD * 100),
      customerId: account?.stripe_customer_id ?? null,
      successUrl: `${origin}/pen/settings/hours?paid={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pen/settings/hours?cancelled=1`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
