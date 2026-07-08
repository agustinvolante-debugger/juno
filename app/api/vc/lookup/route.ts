// POST /api/vc/lookup  { name }
// On-demand: search SEC EDGAR full-text for a company's Form D, parse it, match
// related persons to known VC partners, upsert company/filing/board-seats live,
// and return the result ("fresh from EDGAR"). Powers the search-miss flow.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { searchFormD, fetchFilingDoc, looksLikeSpv, matchPartners, normName } from '@/lib/vc/edgar.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}))
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name required' }, { status: 400, headers: CORS })
  const sb = supabaseAdmin

  const hits = await searchFormD(name, { limit: 8 })
  const nq = normName(name)
  let doc: any = null, hit: any = null
  for (const h of hits) {
    const d = await fetchFilingDoc(h.accession, h.primaryDoc, h.cik)
    if (!d) continue
    const ni = normName(d.issuerName || '')
    // only accept a filing whose issuer name actually matches the query (not an SPV that just names it)
    const aligned = ni && (ni === nq || ni.startsWith(nq) || nq.startsWith(ni))
    if (aligned && !looksLikeSpv(d)) { doc = d; hit = h; break }
  }
  if (!doc) return NextResponse.json({ found: false }, { headers: CORS })

  // known partners
  const { data: firms } = await sb.from('vc_firms').select('id,slug,name')
  const firmById = new Map((firms || []).map((f) => [f.id, f]))
  const { data: ppl } = await sb.from('vc_people').select('id,full_name,firm_id').eq('kind', 'partner')
  const known = new Map<string, any[]>()
  for (const p of ppl || []) {
    if (!p.firm_id) continue
    const k = normName(p.full_name)
    if (!known.has(k)) known.set(k, [])
    known.get(k)!.push({ person_id: p.id, firm_id: p.firm_id, firmSlug: (firmById.get(p.firm_id) as any)?.slug, name: p.full_name })
  }

  const slug = hit.cik ? `cik-${hit.cik}` : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  const { data: co } = await sb.from('vc_companies').upsert({ slug, name: doc.issuerName || name, cik: hit.cik || null }, { onConflict: 'slug' }).select('id,slug,name').single()
  const { data: fil } = await sb.from('vc_filings').upsert({ accession: hit.accession, form_type: 'D', cik: hit.cik, issuer_name: doc.issuerName, filing_date: hit.date, offering_amount: doc.offeringAmount, industry_group: doc.industryGroup, url: doc.url }, { onConflict: 'accession' }).select('id').single()

  const matches = matchPartners(doc.relatedPersons, known).filter((m: any) => m.isDirector)
  let seats = 0
  for (const m of matches) {
    const { error } = await sb.from('vc_board_seats').upsert({
      person_id: m.person_id, company_id: (co as any).id, firm_id: m.firm_id, person_name: m.name,
      role: 'Director', as_of: hit.date, confidence: 'medium', source_kind: 'formd',
      source_text: `SEC Form D ${hit.accession}`, source_url: doc.url, filing_id: (fil as any)?.id || null, is_published: true,
    }, { onConflict: 'person_name,company_id,firm_id' })
    if (!error) seats++
  }
  await sb.from('vc_sync_log').insert({ source: 'ondemand', filings_processed: 1, new_board_seats: seats, notes: `lookup: ${name} -> ${doc.issuerName}` })

  return NextResponse.json({ found: true, fresh: true, company: { slug: (co as any).slug, name: (co as any).name }, boardSeats: seats, offering: doc.offeringAmount, industry: doc.industryGroup, filingUrl: doc.url }, { headers: CORS })
}
