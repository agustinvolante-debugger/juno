// GET /api/vc/company-news?name=…  — recent news for one company on its profile.
// Reuses the Daily Brief's Google News search engine (lib/news/feeds) server-side:
// free RSS, no AI. Session-gated like the other interactive VC surfaces.
import { NextRequest, NextResponse } from 'next/server'
import { searchTopic } from '@/lib/news/feeds'
import { filterRelevant } from '@/lib/news/ai'
import { vcCors, vcSessionEmail } from '@/lib/vc/vc-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: vcCors(req) })
}

export async function GET(req: NextRequest) {
  const cors = vcCors(req)
  if (!(await vcSessionEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors })
  const name = (req.nextUrl.searchParams.get('name') || '').trim().slice(0, 120)
  const site = (req.nextUrl.searchParams.get('site') || '').trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400, headers: cors })
  // quoted name keeps Google News from matching loose word fragments; for common-word
  // brands the website anchors it further ('"Rain" (rain.xyz OR funding OR raised)')
  const desc = (req.nextUrl.searchParams.get('desc') || '').trim().slice(0, 200)
  const base = `"${name.replace(/"/g, '')}"`
  const q = site ? `${base} (${site.replace(/[()"]/g, '')} OR funding OR raised)` : base
  // common-word brands (Rain, Clay, Slash…) drown in homonyms — the same cheap relevance
  // gate the topic sections use keeps only headlines about THIS company
  const topic = `the company "${name}"${site ? ` (${site})` : ''}${desc ? ` — ${desc}` : ''}`
  try {
    let items = await filterRelevant(topic, await searchTopic(q, {}, { when: '90d', maxAgeDays: 92, limit: 12 }))
    if (items.length < 3) items = await filterRelevant(topic, await searchTopic(q, {}, { when: '365d', maxAgeDays: 366, limit: 12 }))
    return NextResponse.json(
      { items: items.slice(0, 8).map((it) => ({ t: it.t, l: it.l, s: it.s, d: it.d })) },
      { headers: { ...cors, 'Cache-Control': 'private, max-age=900' } },
    )
  } catch (e: any) {
    return NextResponse.json({ items: [], error: String(e?.message || e).slice(0, 120) }, { headers: cors })
  }
}
