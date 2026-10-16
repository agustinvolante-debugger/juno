import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { listForPicker } from '@/lib/pen/granola-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// "Import from Granola": the meetings of the last `days` (default 30), newest first, the ones
// already in Juno marked.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 30, 1), 365)
  try {
    return NextResponse.json({ meetings: await listForPicker(email, { since: new Date(Date.now() - days * 86_400_000) }) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}
