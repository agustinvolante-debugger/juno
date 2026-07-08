// POST /api/vc/lookup-person  { name }
// On-demand investor lookup: EDGAR full-text search for a person's name across
// Form Ds, parse related persons, upsert into the investor index (same pattern
// as the company /lookup). Powers the person-search-miss flow.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { searchFormD, fetchFilingDoc, normName, padCik } from '@/lib/vc/edgar.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}))
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name required' }, { status: 400, headers: CORS })
  const sb = supabaseAdmin
  const nq = normName(name)

  const hits = await searchFormD(name, { limit: 8 })
  const issuers: any[] = []
  const roles = new Set<string>()
  let filings = 0, first: string | null = null, last: string | null = null, display = name

  for (const h of hits) {
    if (!h.cik) continue
    const doc: any = await fetchFilingDoc(h.accession, h.primaryDoc, h.cik)
    if (!doc) continue
    const match = (doc.relatedPersons || []).find((p: any) => {
      const pk = normName(p.name)
      return pk === nq || pk.includes(nq) || nq.includes(pk)
    })
    if (!match) continue
    filings++
    display = match.name
    ;(match.relationships || []).forEach((r: string) => roles.add(r))
    if (h.date) { if (!first || h.date < first) first = h.date; if (!last || h.date > last) last = h.date }
    issuers.push({ cik: padCik(h.cik), name: doc.issuerName, date: h.date || null, roles: match.relationships || [] })
  }
  if (!filings) return NextResponse.json({ found: false }, { headers: CORS })

  const key = normName(display)
  const { data: ex } = await sb.from('vc_formd_persons').select('*').eq('person_key', key).maybeSingle()
  await sb.from('vc_formd_persons').upsert({
    person_key: key, name: display,
    filing_count: Math.max(ex?.filing_count || 0, filings),
    issuer_count: Math.max(ex?.issuer_count || 0, new Set(issuers.map((i) => i.cik)).size),
    roles: [...new Set([...(ex?.roles || []), ...roles])].slice(0, 8),
    first_seen: ex?.first_seen && (!first || ex.first_seen < first) ? ex.first_seen : first,
    last_seen: ex?.last_seen && (!last || ex.last_seen > last) ? ex.last_seen : last,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'person_key' })
  for (const i of issuers) {
    await sb.from('vc_formd_person_issuers').upsert({
      person_key: key, cik: i.cik, issuer_name: i.name, roles: i.roles,
      first_date: i.date, last_date: i.date, filing_count: 1,
    }, { onConflict: 'person_key,cik', ignoreDuplicates: true })
  }
  await sb.from('vc_sync_log').insert({ source: 'ondemand', filings_processed: filings, notes: `lookup-person: ${name} -> ${display}` })

  return NextResponse.json({
    found: true, fresh: true,
    person: { personKey: key, name: display, filingCount: filings, issuerCount: new Set(issuers.map((i) => i.cik)).size, roles: [...roles], firstSeen: first, lastSeen: last },
    issuers,
  }, { headers: CORS })
}
