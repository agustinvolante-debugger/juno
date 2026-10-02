import { headers } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { summaryFor } from '@/lib/pen/referrals'
import InvitePanel from './InvitePanel'

export const dynamic = 'force-dynamic'

// Invite friends: the customer's referral link, and how many friends have paid (lib/pen/referrals.ts).
export default async function InvitePage() {
  const email = (await authedEmail())!
  const h = await headers()
  const host = h.get('host') ?? 'www.tryjunoapp.com'
  const origin = host.startsWith('localhost') || host.startsWith('127.') ? `http://${host}` : 'https://www.tryjunoapp.com'
  let summary: Awaited<ReturnType<typeof summaryFor>> | null = null
  let error: string | null = null
  try {
    summary = await summaryFor(email)
  } catch (e) {
    error = (e as Error).message
  }
  return <InvitePanel summary={summary} link={summary ? `${origin}/r/${summary.code}` : null} error={error} />
}
