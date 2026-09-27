import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getAccount } from '@/lib/pen/accounts'
import { createPortalSession, portalLoginUrl, stripeConfigured } from '@/lib/pen/stripe'
import { appLangFor } from '@/app/pen/app-lang'

export const dynamic = 'force-dynamic'

const LOCALE = { en: 'en', es: 'es-419', pt: 'pt-BR' } as const

// "Manage billing": straight into Stripe's portal for the signed-in customer. Anyone Stripe
// doesn't know (owners, hand-granted accounts) or anyone signed out gets the portal's own
// sign-in page, and failing that, back to Settings with a note.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const fallback = portalLoginUrl() ?? `${origin}/pen/settings?billing=none`
  const email = await authedEmail()
  if (!email || !stripeConfigured()) return NextResponse.redirect(fallback, 303)
  try {
    const account = await getAccount(email)
    if (!account?.stripe_customer_id) return NextResponse.redirect(`${origin}/pen/settings?billing=none`, 303)
    const lang = await appLangFor(email)
    const session = await createPortalSession({
      customerId: account.stripe_customer_id,
      returnUrl: `${origin}/pen/settings/billing`,
      locale: LOCALE[lang],
    })
    return NextResponse.redirect(session.url, 303)
  } catch {
    return NextResponse.redirect(fallback, 303)
  }
}
