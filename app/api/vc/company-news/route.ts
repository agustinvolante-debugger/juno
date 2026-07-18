// GET /api/vc/company-news?name=…  — recent news for one company on its profile.
// Reuses the Daily Brief's Google News search engine (lib/news/feeds) server-side:
// free RSS, no AI. Session-gated like the other interactive VC surfaces.
import { NextRequest, NextResponse } from 'next/server'
import { searchTopic } from '@/lib/news/feeds'
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
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400, headers: cors })
  // quoted name keeps Google News from matching loose word fragments
  const q = `"${name.replace(/"/g, '')}"`
  try {
    let items = await searchTopic(q, {}, { when: '90d', maxAgeDays: 92, limit: 10 })
    if (items.length < 3) items = await searchTopic(q, {}, { when: '365d', maxAgeDays: 366, limit: 10 })
    return NextResponse.json(
      { items: items.slice(0, 8).map((it) => ({ t: it.t, l: it.l, s: it.s, d: it.d })) },
      { headers: { ...cors, 'Cache-Control': 'private, max-age=900' } },
    )
  } catch (e: any) {
    return NextResponse.json({ items: [], error: String(e?.message || e).slice(0, 120) }, { headers: cors })
  }
}
