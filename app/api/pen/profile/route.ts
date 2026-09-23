import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getProfile, saveProfile } from '@/lib/pen/profile'

export const dynamic = 'force-dynamic'

export async function GET() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ profile: await getProfile(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { profile?: unknown }
  try {
    return NextResponse.json({ profile: await saveProfile(email, b.profile) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
