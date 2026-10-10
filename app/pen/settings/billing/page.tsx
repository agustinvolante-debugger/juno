import { authedEmail } from '@/lib/news/auth'
import { getAccount, isPaused, isTrialing } from '@/lib/pen/accounts'
import { clockFor } from '@/lib/pen/access'
import { canCancel } from '@/lib/pen/cancel'
import { canPause } from '@/lib/pen/pause'
import { getSubscription } from '@/lib/pen/stripe'
import { penFeeDue, PEN_USD } from '@/lib/pen/plan'
import BillingPanel from './BillingPanel'

export const dynamic = 'force-dynamic'

// Billing: where the plan stands (with the countdown), pause, Stripe's portal for the card and
// invoices, and cancelling in-app (lib/pen/cancel.ts).
export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  const account = await getAccount(email).catch(() => null)
  const sp = await searchParams
  const trial = isTrialing(account)
  const clock = clockFor(account, email)
  // The free pen's minimum lives on the Stripe subscription (lib/pen/checkout.ts); only those
  // accounts are asked.
  const endsAt = (trial ? account?.trial_ends_at : account?.current_period_end) ?? null
  const sub = account?.offer === 'free-pen' && account.stripe_subscription_id ? await getSubscription(account.stripe_subscription_id).catch(() => null) : null
  const penFee = sub && penFeeDue(sub.metadata, endsAt) ? `US$${PEN_USD}` : null
  return (
    <BillingPanel
      pausedUntil={isPaused(account) ? account!.paused_until! : null}
      pausable={canPause(account) && !account?.cancel_at}
      hasStripe={Boolean(account?.stripe_customer_id)}
      clock={clock}
      renewsAt={!clock && account?.status === 'active' ? account.current_period_end : null}
      cancelable={canCancel(account)}
      endsAt={(trial ? account?.trial_ends_at : account?.current_period_end) ?? null}
      trial={trial}
      keepsPen={account?.offer !== 'own-recorder'}
      penFee={penFee}
      back={sp.back === '1'}
    />
  )
}
