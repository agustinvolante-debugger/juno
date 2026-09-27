import { authedEmail } from '@/lib/news/auth'
import { getAccount, isPaused } from '@/lib/pen/accounts'
import { canPause } from '@/lib/pen/pause'
import BillingPanel from './BillingPanel'

export const dynamic = 'force-dynamic'

// Billing: pause first (a break instead of a cancellation), then Stripe's portal for the card,
// invoices and cancelling.
export default async function BillingPage() {
  const email = (await authedEmail())!
  const account = await getAccount(email).catch(() => null)
  return (
    <BillingPanel
      pausedUntil={isPaused(account) ? account!.paused_until! : null}
      pausable={canPause(account)}
      hasStripe={Boolean(account?.stripe_customer_id)}
    />
  )
}
