import Link from 'next/link'
import { authedEmail } from '@/lib/news/auth'
import { isOwner } from '@/lib/pen/owner'
import { listCustomers } from '@/lib/pen/customers'
import CustomersTable from './CustomersTable'

export const dynamic = 'force-dynamic'

// Owner only. Everyone who has signed up, paid or recorded, one row each.
export default async function CustomersPage() {
  const email = await authedEmail()
  if (!isOwner(email)) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="pen-display text-[26px]">Not for you</h1>
        <p className="mt-3 text-[16.5px]" style={{ color: 'var(--soft)' }}>This page is only visible to the account that runs Juno Pen.</p>
        <Link href="/pen" className="pen-btn mt-6 inline-block">Back to Juno Pen</Link>
      </main>
    )
  }

  let data: Awaited<ReturnType<typeof listCustomers>> | null = null
  let error: string | null = null
  try {
    data = await listCustomers()
  } catch (e) {
    error = (e as Error).message
  }
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  const stripeBase = key.startsWith('sk_live_') ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test'

  return (
    <main className="pen-cust">
      <header className="pen-cust-head">
        <div>
          <h1 className="pen-display pen-cust-title">Customers</h1>
          <p className="pen-cust-sub">Everyone who has signed up, paid or recorded. Owner only.</p>
        </div>
        <nav className="pen-cust-nav">
          <Link href="/pen/usage" className="pen-btn">Recording activity</Link>
          <Link href="/pen" className="pen-btn">Back to Juno Pen</Link>
        </nav>
      </header>
      {error && <p className="pen-su-err" style={{ marginTop: 20 }}>{error}</p>}
      {data && <CustomersTable customers={data.customers} summary={data.summary} stripeBase={stripeBase} />}
    </main>
  )
}
