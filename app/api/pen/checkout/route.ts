import { NextResponse } from 'next/server'
import { createCheckoutSession } from '@/lib/pen/stripe'
import { trialDaysFor, type Offer } from '@/lib/pen/plan'
import { createPending } from '@/lib/pen/accounts'

export const dynamic = 'force-dynamic'

// Starts the trial. Takes a card, charges nothing for two or three weeks, then charges.
//
// The card is the whole mechanic. Posting a recorder to anyone who replies to an email
// selects for people who accept free hardware; asking for a card selects for people who mean
// to use it, and that is the difference between the offer paying for itself and not.

const PRICE: Record<string, string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    email?: string
    plan?: string
    offer?: string
    reference?: string
  }

  const email = (b.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
  }

  const plan = b.plan === 'annual' ? 'annual' : 'monthly'
  const priceId = PRICE[plan]
  if (!priceId) {
    // Named precisely, because the failure otherwise looks like a Stripe outage.
    return NextResponse.json(
      { error: `Checkout isn't configured yet — STRIPE_PRICE_${plan.toUpperCase()} is not set.` },
      { status: 503 },
    )
  }

  const offer: Offer = b.offer === 'own-recorder' ? 'own-recorder' : 'posted-pen'
  const base = (process.env.PEN_PUBLIC_URL || 'https://pen.tryjunoapp.com').replace(/\/$/, '')

  try {
    // The row exists before the card does, so a customer who abandons checkout is still
    // someone we know signed up rather than someone who never happened.
    await createPending(email, `checkout:${plan}:${offer}`).catch(() => {})

    const session = await createCheckoutSession({
      priceId,
      email,
      trialDays: trialDaysFor(offer),
      successUrl: `${base}/pen?welcome=1`,
      cancelUrl: `${base}/pen/signup?cancelled=1`,
      reference: b.reference,
      metadata: { plan, offer },
    })

    return NextResponse.json({ url: session.url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
