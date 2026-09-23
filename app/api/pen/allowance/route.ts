import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getAllowance } from '@/lib/pen/allowance'

export const dynamic = 'force-dynamic'

// What the usage bar reads. Recomputed on every call; see lib/pen/allowance.ts.
export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ allowance: await getAllowance(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
