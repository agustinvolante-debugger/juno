import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs } from '@/lib/news/store'
import { translateTitles } from '@/lib/news/ai'
import { PLACE_BY_ID } from '@/lib/news/places'
import { fetchPlaceNews } from '@/lib/news/geo'
import type { Item } from '@/lib/news/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET ?id=<place id> — fan out the per-category searches for a place and return the categorized
// buckets, with headlines translated into the user's set language (EN/ES). Signed-in only.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const place = PLACE_BY_ID[id]
  if (!place) return NextResponse.json({ error: 'unknown place' }, { status: 404 })

  const [buckets, prefs] = await Promise.all([fetchPlaceNews(place), getPrefs(email)])
  const lang = prefs.lang === 'es' ? 'es' : 'en'

  // Translate headlines into the user's language. Skip when the place's own language already matches
  // (e.g. an EN user on the US, or an ES user on Chile) so same-language clicks cost nothing.
  if (place.lang !== lang) {
    const items = (Object.values(buckets) as Item[][]).flat()
    const out = await translateTitles(items.map((it) => it.t), lang)
    items.forEach((it, i) => { if (out[i]) it.t = out[i] }) // mutates the bucket items in place
  }

  return NextResponse.json({ place: { id: place.id, name: place.name, flag: place.flag }, buckets })
}
