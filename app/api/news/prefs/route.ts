import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs, setPrefs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const patch: { lang?: string; layout?: any } = {}
  if (body.lang === 'en' || body.lang === 'es') patch.lang = body.lang
  if (body.layout !== undefined) patch.layout = { ...(await getPrefs(email)).layout, ...body.layout }
  await setPrefs(email, patch)
  return NextResponse.json({ ok: true })
}
