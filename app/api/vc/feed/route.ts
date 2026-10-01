// GET /api/vc/feed — "New board seats" feed for the VC Constellation home page.
// Latest firm-attributed board seats (by as_of, then created_at) + the latest Form D
// filings by companies already in the curated graph. Gated like /graph.
// Query: ?limit=80 (max 200)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { vcCors, vcSessionEmail } from '@/lib/vc/vc-auth'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: vcCors(req) })
}

export async function GET(req: NextRequest) {
  const CORS = vcCors(req)
  if (!(await vcSessionEmail())) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401, headers: CORS })
  }
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 80))
  const sb = supabaseAdmin

  const [seatsR, metaR] = await Promise.all([
    sb.from('vc_board_seats')
      .select('person_name,as_of,created_at,source_kind,source_url,confidence,vc_companies(slug,name,cik),vc_firms(slug,name)')
      .eq('is_published', true)
      .not('firm_id', 'is', null)
      .order('as_of', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit),
    sb.from('vc_ingest_meta').select('key,value').in('key', ['formd_as_of', 'formd_synced_through']),
  ])
  if (seatsR.error) return NextResponse.json({ error: seatsR.error.message }, { status: 500, headers: CORS })

  const seats = (seatsR.data || []).map((s: any) => ({
    person: s.person_name,
    firm: s.vc_firms?.slug || null,
    firmName: s.vc_firms?.name || null,
    company: s.vc_companies?.slug || null,
    companyName: s.vc_companies?.name || null,
    date: s.as_of || String(s.created_at).slice(0, 10),
    addedAt: s.created_at,
    kind: s.source_kind,
    url: s.source_url,
    confidence: s.confidence,
  }))

  // latest Form D filings by curated companies (companies that carry a CIK)
  const { data: cos } = await sb.from('vc_companies').select('slug,name,cik').not('cik', 'is', null).limit(10000)
  const byCik = new Map<string, any>()
  for (const c of cos || []) byCik.set(String(c.cik).replace(/^0+/, ''), c)
  let filings: any[] = []
  if (byCik.size) {
    const { data: fl } = await sb.from('vc_filings')
      .select('accession,form_type,cik,issuer_name,filing_date,offering_amount,url')
      .in('cik', [...new Set([...(cos || []).map((c: any) => String(c.cik))])].slice(0, 900))
      .order('filing_date', { ascending: false })
      .limit(40)
    filings = (fl || []).map((f: any) => {
      const c = byCik.get(String(f.cik).replace(/^0+/, ''))
      return { company: c?.slug || null, companyName: c?.name || f.issuer_name, date: f.filing_date, form: f.form_type, amount: f.offering_amount, url: f.url }
    })
  }

  const meta = Object.fromEntries((metaR.data || []).map((m: any) => [m.key, m.value]))
  return NextResponse.json({ seats, filings, asOf: meta.formd_as_of || meta.formd_synced_through || null }, { headers: CORS })
}
