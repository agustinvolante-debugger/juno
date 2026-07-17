// POST /api/vc/enrich-request  { headline } | { company }
// News → VC Constellation bridge: the ◆ map button on Daily Brief funding headlines.
// Extracts the company from the headline (one cheap Haiku call), dedupes against the
// curated graph / review queue / pending requests, and queues it for the nightly
// enrich-cron. Writes stay STAGED (vc_enrich_queue) — nothing goes live from here.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { vcSessionEmail } from '@/lib/vc/vc-auth'
import { extractFundingCompanies } from '@/lib/news/ai'
import { getVcEnrichRequests, setVcEnrichRequests } from '@/lib/news/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export async function POST(req: NextRequest) {
  const email = await vcSessionEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const headline = (body.headline || '').toString().trim().slice(0, 300)
  let company = (body.company || '').toString().trim().slice(0, 80)
  let round: string | undefined

  if (!company) {
    if (!headline) return NextResponse.json({ error: 'empty' }, { status: 400 })
    const [hit] = await extractFundingCompanies([headline])
    if (!hit) return NextResponse.json({ error: 'no company found in that headline' }, { status: 422 })
    company = hit.company
    round = hit.round
  }

  const sb = supabaseAdmin
  const { data: curated } = await sb.from('vc_companies').select('slug,name').ilike('name', `%${company}%`).limit(3)
  const exact = (curated || []).find((c: any) => norm(c.name) === norm(company))
  if (exact) return NextResponse.json({ ok: true, company, already: 'on the map', slug: exact.slug })

  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  const { data: queued } = await sb.from('vc_enrich_queue').select('company_name').gte('created_at', since).limit(500)
  if ((queued || []).some((q: any) => q.company_name && norm(q.company_name) === norm(company))) {
    return NextResponse.json({ ok: true, company, already: 'awaiting review' })
  }

  const requests = await getVcEnrichRequests()
  if (requests.some((r) => norm(r.company) === norm(company))) {
    return NextResponse.json({ ok: true, company, already: 'requested' })
  }
  await setVcEnrichRequests([...requests, { company, round, headline: headline || undefined, by: email, at: new Date().toISOString() }])
  return NextResponse.json({ ok: true, company, queued: true })
}
