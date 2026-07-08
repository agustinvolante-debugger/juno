// GET /api/vc/edgar-sync  (daily Vercel Cron; guarded by CRON_SECRET)
// Pulls the EDGAR daily index for a date, parses new Form D / D-A filings, matches
// related persons to known VC partners, upserts inferred board seats, logs the run.
// ?date=YYYY-MM-DD overrides; ?key=<CRON_SECRET> auth for manual calls.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { dailyFormD, fetchFilingDoc, looksLikeSpv, matchPartners, normName } from '@/lib/vc/edgar.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const CAP = 500 // bound per-run fetches

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authed = !secret || req.headers.get('authorization') === `Bearer ${secret}` || req.nextUrl.searchParams.get('key') === secret
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = supabaseAdmin

  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const filings = await dailyFormD(date)
  if (!filings.length) {
    await sb.from('vc_sync_log').insert({ source: 'daily', filings_processed: 0, notes: `${date}: no filings` })
    return NextResponse.json({ date, filings: 0, note: 'no Form D filings in daily index (weekend/holiday?)' })
  }

  // dedupe against already-ingested accessions
  const accs = filings.map((f) => f.accession)
  const { data: existing } = await sb.from('vc_filings').select('accession').in('accession', accs)
  const seen = new Set((existing || []).map((r) => r.accession))
  const todo = filings.filter((f) => !seen.has(f.accession)).slice(0, CAP)

  // known partners
  const { data: firms } = await sb.from('vc_firms').select('id,slug')
  const firmById = new Map((firms || []).map((f) => [f.id, f]))
  const { data: ppl } = await sb.from('vc_people').select('id,full_name,firm_id').eq('kind', 'partner')
  const known = new Map<string, any[]>()
  for (const p of ppl || []) {
    if (!p.firm_id) continue
    const k = normName(p.full_name)
    if (!known.has(k)) known.set(k, [])
    known.get(k)!.push({ person_id: p.id, firm_id: p.firm_id, firmSlug: (firmById.get(p.firm_id) as any)?.slug, name: p.full_name })
  }

  let processed = 0, newSeats = 0, newCos = 0
  for (const f of todo) {
    const doc: any = await fetchFilingDoc(f.accession, null, f.cik)
    processed++
    if (!doc) continue
    // always record the filing so we don't re-fetch it
    const { data: fil } = await sb.from('vc_filings').upsert({ accession: f.accession, form_type: f.formType, cik: f.cik, issuer_name: doc.issuerName, filing_date: date, offering_amount: doc.offeringAmount, industry_group: doc.industryGroup, url: doc.url }, { onConflict: 'accession' }).select('id').single()
    if (looksLikeSpv(doc)) continue
    const matches = matchPartners(doc.relatedPersons, known).filter((m: any) => m.isDirector)
    if (!matches.length) continue
    const slug = f.cik ? `cik-${f.cik}` : (doc.issuerName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    const { data: co } = await sb.from('vc_companies').upsert({ slug, name: doc.issuerName, cik: f.cik || null }, { onConflict: 'slug' }).select('id').single()
    if (!co) continue
    newCos++
    for (const m of matches) {
      const { error } = await sb.from('vc_board_seats').upsert({
        person_id: m.person_id, company_id: (co as any).id, firm_id: m.firm_id, person_name: m.name,
        role: 'Director', as_of: date, confidence: 'medium', source_kind: 'formd',
        source_text: `SEC Form ${f.formType} ${f.accession}`, source_url: doc.url, filing_id: (fil as any)?.id || null, is_published: true,
      }, { onConflict: 'person_name,company_id,firm_id' })
      if (!error) newSeats++
    }
  }
  await sb.from('vc_sync_log').insert({ source: 'daily', filings_processed: processed, new_companies: newCos, new_board_seats: newSeats, notes: `${date}: ${todo.length} new of ${filings.length}` })
  return NextResponse.json({ date, filingsInIndex: filings.length, processed, newCompanies: newCos, newBoardSeats: newSeats })
}
