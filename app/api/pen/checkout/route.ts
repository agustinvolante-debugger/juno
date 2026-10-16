import { parseOffer, checkoutPlan } from '@/lib/pen/plan'
import { cleanPhone, saveSignup } from '@/lib/pen/signup'
import { NextResponse } from 'next/server'
import { startPlanCheckout } from '@/lib/pen/checkout'
import type { Offer, Plan } from '@/lib/pen/plan'
import { createPending } from '@/lib/pen/accounts'
import { cookies } from 'next/headers'
import { REF_COOKIE, cleanCode, eligibleReferral, recordSignup } from '@/lib/pen/referrals'

export const dynamic = 'force-dynamic'

// Starts a plan checkout without the signup form: { name, email, phone, plan, pen } (or the
// older { offer }). Same rules as the form since 15 Oct: name, email and phone are required and
// saved on our side; the pen's address is taken by Stripe at checkout.


export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    name?: string
    email?: string
    phone?: string
    plan?: string
    pen?: string | boolean
    offer?: string
    reference?: string
  }

  const email = (b.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
  }
  const name = (b.name ?? '').trim().slice(0, 120)
  if (name.length < 2) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })
  const phone = cleanPhone(b.phone)
  if (!phone) return NextResponse.json({ error: 'A phone number (WhatsApp, with the country code) is required.' }, { status: 400 })

  const linkOffer = parseOffer(b.offer)
  const offer: Offer = linkOffer === 'free-pen' || linkOffer === 'given-pen' ? linkOffer : b.pen === '1' || b.pen === true || (b.pen === undefined && linkOffer === 'posted-pen') ? 'posted-pen' : 'own-recorder'
  const plan: Plan = offer === 'free-pen' || offer === 'given-pen' ? 'monthly' : checkoutPlan(b.plan)
  // The free pen is posted from the signup form's address; this route has none.
  if (offer === 'free-pen') return NextResponse.json({ error: 'The free pen starts from the signup page.' }, { status: 400 })

  try {
    // The row exists before the card does, so a customer who abandons checkout is still
    // someone we know signed up rather than someone who never happened.
    await saveSignup({ name, email, phone, source: 'checkout' })
    await createPending(email, `checkout:${plan}:${offer}`).catch(() => {})
    // Back to wherever checkout started: localhost while testing, the subdomain in production.
    // Same referral handling as the signup form (app/api/pen/signup/route.ts).
    const code = cleanCode((await cookies()).get(REF_COOKIE)?.value)
    const referrer = await eligibleReferral(code, email, offer).catch(() => null)
    if (code && referrer) await recordSignup({ code, referrerEmail: referrer, refereeEmail: email, refereeName: name, plan, offer }).catch(() => {})
    const r = await startPlanCheckout({ email, plan, offer, origin: new URL(req.url).origin, reference: b.reference, referral: code && referrer ? code : null })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 503 })
    return NextResponse.json({ url: r.url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
