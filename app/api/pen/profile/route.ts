import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getProfile, saveProfile } from '@/lib/pen/profile'
import { noteBrowserZone } from '@/lib/pen/timezone'

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

/** The browser's time zone, sent by the app at most once a day (lib/pen/timezone.ts). */
export async function PATCH(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { timeZone?: unknown }
  if (typeof b.timeZone !== 'string') return NextResponse.json({ error: 'timeZone is required' }, { status: 400 })
  try {
    return NextResponse.json({ stored: await noteBrowserZone(email, b.timeZone) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
