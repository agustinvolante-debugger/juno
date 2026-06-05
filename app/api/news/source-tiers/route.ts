import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { setSourceTiers } from '@/lib/news/store'

export const dynamic = 'force-dynamic'

const clean = (a: any): string[] =>
  Array.isArray(a) ? Array.from(new Set(a.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()))).slice(0, 300) : []

// Save the global source tiers (trusted → top, muted → hidden).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  await setSourceTiers({ top: clean(body.top), muted: clean(body.muted) })
  return NextResponse.json({ ok: true })
}
