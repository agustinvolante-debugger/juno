import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { isOwner } from '@/lib/pen/owner'
import { giveReward } from '@/lib/pen/referral-events'

export const dynamic = 'force-dynamic'

// Owners only: credit a referrer for a friend who paid (Customers → Referrals).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!isOwner(email)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    return NextResponse.json(await giveReward(b.id))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
