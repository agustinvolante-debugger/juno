import { parsePlan, parseOffer } from '@/lib/pen/plan'
import { NextResponse } from 'next/server'
import { startPlanCheckout } from '@/lib/pen/checkout'
import type { Offer, Plan } from '@/lib/pen/plan'
import { createPending } from '@/lib/pen/accounts'

export const dynamic = 'force-dynamic'

// Starts the trial. Takes a card, charges nothing for two or three weeks, then charges.
//
// The card is the whole mechanic. Posting a recorder to anyone who replies to an email
// selects for people who accept free hardware; asking for a card selects for people who mean
// to use it, and that is the difference between the offer paying for itself and not.


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

  const plan: Plan = parsePlan(b.plan)
  const offer: Offer = parseOffer(b.offer)

  try {
    // The row exists before the card does, so a customer who abandons checkout is still
    // someone we know signed up rather than someone who never happened.
    await createPending(email, `checkout:${plan}:${offer}`).catch(() => {})
    // Back to wherever checkout started: localhost while testing, the subdomain in production.
    const r = await startPlanCheckout({ email, plan, offer, origin: new URL(req.url).origin, reference: b.reference })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 503 })
    return NextResponse.json({ url: r.url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
