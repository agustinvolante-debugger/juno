import { authedEmail } from '@/lib/news/auth'
import { getAllowance, type Allowance } from '@/lib/pen/allowance'
import { listPurchases, type HourPurchase } from '@/lib/pen/hours'
import { stripeConfigured } from '@/lib/pen/stripe'
import { Suspense } from 'react'
import BuyHours from './BuyHours'

export const dynamic = 'force-dynamic'

export default async function HoursPage() {
  const email = (await authedEmail())!
  let allowance: Allowance | null = null
  let purchases: HourPurchase[] = []
  let loadError: string | null = null
  try {
    ;[allowance, purchases] = await Promise.all([getAllowance(email), listPurchases(email)])
  } catch (e) {
    loadError = (e as Error).message
  }
  // Suspense because BuyHours reads the query string (Stripe's return), which Next requires a
  // boundary around.
  return (
    <Suspense>
      <BuyHours initialAllowance={allowance} purchases={purchases} checkoutReady={stripeConfigured()} loadError={loadError} />
    </Suspense>
  )
}
