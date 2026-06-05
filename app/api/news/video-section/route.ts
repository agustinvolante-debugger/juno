import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { buildVideoSection } from '@/lib/news/ai'
import { getUserVideos, setUserVideos } from '@/lib/news/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { desc } = await req.json().catch(() => ({}))
  if (!desc || !String(desc).trim()) return NextResponse.json({ error: 'missing desc' }, { status: 400 })
  const vs = await buildVideoSection(String(desc).trim())
  if (!vs.channels.length) return NextResponse.json({ error: 'no channels resolved' }, { status: 422 })
  const videos = (await getUserVideos(email)).filter((v) => v.key !== vs.key)
  videos.unshift(vs)
  await setUserVideos(email, videos.slice(0, 6))
  return NextResponse.json({ ok: true, label: vs.label, channels: vs.channels.map((c) => c.name) })
}

export async function DELETE(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const key = new URL(req.url).searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 })
  await setUserVideos(email, (await getUserVideos(email)).filter((v) => v.key !== key))
  return NextResponse.json({ ok: true })
}
