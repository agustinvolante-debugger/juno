import { NextResponse } from 'next/server'
import { creditDue } from '@/lib/pen/referral-events'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Daily (vercel.json): credits referrers whose friend paid at least 14 days ago with no refund.
// Vercel Cron sends Bearer CRON_SECRET; without the secret configured, nothing runs.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await creditDue())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
