// GET /api/vc/search — criteria search over the full Form D universe (vc_formd_issuers).
// Curated scope stays client-side in the frontend (only ~172 rows); this serves the
// broad universe path: name / industry / geography(state) / offering-amount / date.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normName } from '@/lib/vc/edgar.mjs'

export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function GET(req: NextRequest) {
  const sb = supabaseAdmin
  const p = req.nextUrl.searchParams
  const q = p.get('q')?.trim()
  const industry = p.get('industry')?.trim()
  const state = p.get('state')?.trim()
  const minLast = p.get('minLast') ? Number(p.get('minLast')) : null
  const minTotal = p.get('minTotal') ? Number(p.get('minTotal')) : null
  const from = p.get('from')?.trim()
  const to = p.get('to')?.trim()
  const noFunds = p.get('noFunds') === '1'
  const type = p.get('type')?.trim() || null   // operating_company | vc_firm | person
  const sort = p.get('sort') || 'last'
  const limit = Math.min(Number(p.get('limit')) || 200, 500)
  const offset = Number(p.get('offset')) || 0

  // person search runs against the investor index, not the issuer universe
  if (type === 'person') {
    let pq = sb.from('vc_formd_persons').select('person_key,name,filing_count,issuer_count,roles,first_seen,last_seen', { count: 'estimated' })
    if (q) pq = pq.ilike('name', `%${q}%`)
    if (from) pq = pq.gte('last_seen', from)
    if (to) pq = pq.lte('last_seen', to)
    const pSort = { date: 'last_seen', name: 'name' }[sort] || 'filing_count'
    pq = pq.order(pSort, { ascending: sort === 'name', nullsFirst: false }).range(offset, offset + limit - 1)
    const { data: pd, count: pc, error: pe } = await pq
    if (pe) return NextResponse.json({ error: pe.message }, { status: 500, headers: CORS })
    const { data: pmeta } = await sb.from('vc_ingest_meta').select('value').eq('key', 'persons_as_of').maybeSingle()
    const rows = (pd || []).map((r) => ({
      personKey: r.person_key, name: r.name, filingCount: r.filing_count, issuerCount: r.issuer_count,
      roles: r.roles || [], firstSeen: r.first_seen, lastSeen: r.last_seen, source: 'formd', kind: 'person',
    }))
    return NextResponse.json({ rows, total: pc || 0, asOf: pmeta?.value || null, kind: 'person' }, { headers: CORS })
  }

  // 'estimated' count: exact counting scans ~200k rows per request and is brutally slow
  // through PostgREST; the planner estimate is instant and close enough for a result count.
  let query = sb.from('vc_formd_issuers').select('cik,name,norm_name,industry_group,state,entity_type,type_confidence,last_offering_amount,total_offering_amount,filing_count,last_filing_date', { count: 'estimated' })
  if (type) query = query.eq('entity_type', type)
  if (q) query = query.ilike('name', `%${q}%`)
  if (industry) query = query.ilike('industry_group', `%${industry}%`)
  if (state) query = query.ilike('state', state)
  if (minLast != null) query = query.gte('last_offering_amount', minLast)
  if (minTotal != null) query = query.gte('total_offering_amount', minTotal)
  if (from) query = query.gte('last_filing_date', from)
  if (to) query = query.lte('last_filing_date', to)
  // exact-value filter (SEC taxonomy string), so the industry index stays usable
  if (noFunds) query = query.or('industry_group.neq.Pooled Investment Fund,industry_group.is.null')
  const sortCol = { last: 'last_offering_amount', total: 'total_offering_amount', date: 'last_filing_date', name: 'name' }[sort] || 'last_offering_amount'
  query = query.order(sortCol, { ascending: sort === 'name', nullsFirst: false }).range(offset, offset + limit - 1)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })

  // tag rows that are also in the curated graph -> show "Curated" + a slug to open in network.
  // Link by CIK when the curated row has one, else by normalized name (most seeded rows lack CIKs).
  const coName = (s: string) => {
    let t = normName(s || '').replace(/,/g, '')
    let prev
    do { prev = t; t = t.replace(/\s+(incorporated|inc|corp|corporation|company|llc|co|ltd|pbc|plc)$/, '').trim() } while (t !== prev)
    return t
  }
  const { data: cur } = await sb.from('vc_companies').select('cik,slug,name')
  const curByCik = new Map<string, any>(), curByName = new Map<string, any>()
  for (const c of cur || []) {
    if (c.cik) curByCik.set(c.cik, c)
    curByName.set(coName(c.name), c)
  }
  const rows = (data || []).map((d) => {
    const hit = curByCik.get(d.cik) || curByName.get(coName(d.name))
    return {
      cik: d.cik, name: d.name, industry: d.industry_group, state: d.state,
      entityType: d.entity_type, typeConfidence: d.type_confidence,
      lastOffering: d.last_offering_amount, totalOffering: d.total_offering_amount,
      filingCount: d.filing_count, lastFiled: d.last_filing_date,
      source: hit ? 'curated' : 'formd',
      slug: hit?.slug || null,
    }
  })

  const { data: meta } = await sb.from('vc_ingest_meta').select('value').eq('key', 'formd_as_of').maybeSingle()
  return NextResponse.json({ rows, total: count || 0, asOf: meta?.value || null }, { headers: CORS })
}
