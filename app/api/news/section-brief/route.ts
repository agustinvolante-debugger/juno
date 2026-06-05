import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { brief } from '@/lib/news/ai'
import { getFeedCache, getPrefs } from '@/lib/news/store'
import { SECTIONS } from '@/lib/news/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// On-demand: generate a short rundown for one standard section from its cached items.
// Cost only happens when the signed-in user clicks "brief this section".
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { section } = await req.json().catch(() => ({}))
  const cache = await getFeedCache()
  const items = cache[section] || []
  if (!items.length) return NextResponse.json({ error: 'no items' }, { status: 400 })
  const label = SECTIONS.find((s) => s.key === section)?.label || section
  const lang = (await getPrefs(email)).lang
  const text = await brief(label, items, lang)
  return NextResponse.json({ brief: text })
}
