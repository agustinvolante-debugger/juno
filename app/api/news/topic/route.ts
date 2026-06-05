import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { buildTopic } from '@/lib/news/ai'
import { upsertUserTopic, deleteUserTopic, getPrefs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { query } = await req.json().catch(() => ({}))
  if (!query || !String(query).trim()) return NextResponse.json({ error: 'missing query' }, { status: 400 })
  const lang = (await getPrefs(email)).lang
  const topic = await buildTopic(String(query).trim(), lang)
  await upsertUserTopic(email, topic)
  return NextResponse.json({ ok: true, topic })
}

export async function DELETE(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const query = new URL(req.url).searchParams.get('query')
  if (!query) return NextResponse.json({ error: 'missing query' }, { status: 400 })
  await deleteUserTopic(email, query)
  return NextResponse.json({ ok: true })
}
