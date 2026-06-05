import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs, setPrefs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const cur = await getPrefs(email)
  const layout: any = { ...(cur.layout || {}) }
  if (body.layout) Object.assign(layout, body.layout)
  if (body.hide) layout.hidden = Array.from(new Set([...(layout.hidden || []), body.hide]))
  if (body.unhide) layout.hidden = (layout.hidden || []).filter((x: string) => x !== body.unhide)
  if (body.unhideAll) layout.hidden = []
  const patch: { lang?: string; layout?: any } = { layout }
  if (body.lang === 'en' || body.lang === 'es') patch.lang = body.lang
  await setPrefs(email, patch)
  return NextResponse.json({ ok: true })
}
