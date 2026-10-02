import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { keep } from '@/lib/pen/cancel'

export const dynamic = 'force-dynamic'

// Takes a scheduled cancellation back, before its date.
export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    await keep(email)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
