import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs, setPrefs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'

// GET: the VAPID public key the client needs to subscribe (public by design).
export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY || null })
}

// POST: save this device's PushSubscription in prefs.layout.push (dedupe by endpoint, cap 5).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sub = await req.json().catch(() => null)
  if (!sub?.endpoint || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys) {
    return NextResponse.json({ error: 'bad subscription' }, { status: 400 })
  }
  const cur = await getPrefs(email)
  const push = (((cur.layout?.push as any[]) || []).filter((s) => s.endpoint !== sub.endpoint))
  push.push({ endpoint: sub.endpoint, keys: sub.keys, expirationTime: sub.expirationTime ?? null, added: new Date().toISOString() })
  await setPrefs(email, { lang: cur.lang, layout: { ...(cur.layout || {}), push: push.slice(-5) } })
  return NextResponse.json({ ok: true })
}

// DELETE ?endpoint=… : forget this device.
export async function DELETE(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const endpoint = new URL(req.url).searchParams.get('endpoint') || ''
  const cur = await getPrefs(email)
  const push = ((cur.layout?.push as any[]) || []).filter((s) => s.endpoint !== endpoint)
  await setPrefs(email, { lang: cur.lang, layout: { ...(cur.layout || {}), push } })
  return NextResponse.json({ ok: true })
}
