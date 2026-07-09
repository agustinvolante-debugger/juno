// GET /api/vc/edgar-sync  (daily Vercel Cron; guarded by CRON_SECRET)
// Pulls the EDGAR daily index for a date, parses new Form D / D-A filings, matches
// related persons to known VC partners, upserts inferred board seats, logs the run.
// ?date=YYYY-MM-DD overrides; ?key=<CRON_SECRET> auth for manual calls.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { dailyFormD, fetchFilingDoc, looksLikeSpv, matchPartners, normName, upsertUniverse } from '@/lib/vc/edgar.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const CAP = 500 // bound per-run fetches

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authed = !secret || req.headers.get('authorization') === `Bearer ${secret}` || req.nextUrl.searchParams.get('key') === secret
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = supabaseAdmin

  // date selection: explicit ?date=… processes that one day; otherwise walk a
  // cursor (formd_synced_through) from where we left off up to yesterday, max 4
  // days per run — so missed cron runs self-heal instead of leaving gaps.
  const explicit = req.nextUrl.searchParams.get('date')
  let dates: string[] = []
  if (explicit) dates = [explicit]
  else {
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
    const { data: meta } = await sb.from('vc_ingest_meta').select('value').eq('key', 'formd_synced_through').maybeSingle()
    let cur = meta?.value || new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10)
    while (dates.length < 4) {
      const next = new Date(new Date(cur + 'T00:00:00Z').getTime() + 86400_000).toISOString().slice(0, 10)
      if (next > yesterday) break
      dates.push(next)
      cur = next
    }
    if (!dates.length) return NextResponse.json({ note: 'already synced through yesterday' })
  }

  const dayResults: any[] = []
  for (const date of dates) {
    dayResults.push(await syncDay(sb, date))
    if (!explicit) await sb.from('vc_ingest_meta').upsert({ key: 'formd_synced_through', value: date, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }
  return NextResponse.json({ days: dayResults })
}

async function syncDay(sb: any, date: string) {
  const filings = await dailyFormD(date)
  if (!filings.length) {
    await sb.from('vc_sync_log').insert({ source: 'daily', filings_processed: 0, notes: `${date}: no filings` })
    return { date, filings: 0, note: 'no Form D filings in daily index (weekend/holiday?)' }
  }

  // dedupe against already-ingested accessions
  const accs = filings.map((f: any) => f.accession)
  const { data: existing } = await sb.from('vc_filings').select('accession').in('accession', accs)
  const seen = new Set((existing || []).map((r: any) => r.accession))
  const todo = filings.filter((f: any) => !seen.has(f.accession)).slice(0, CAP)

  // known partners
  const { data: firms } = await sb.from('vc_firms').select('id,slug')
  const firmById = new Map((firms || []).map((f: any) => [f.id, f]))
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
    // keep the Form D universe fresh (SPVs included — the universe is the raw record)
    await upsertUniverse(sb, f.cik, doc, date)
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
  if (processed) await sb.from('vc_ingest_meta').upsert({ key: 'formd_as_of', value: date, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  await sb.from('vc_sync_log').insert({ source: 'daily', filings_processed: processed, new_companies: newCos, new_board_seats: newSeats, notes: `${date}: ${todo.length} new of ${filings.length}` })
  return { date, filingsInIndex: filings.length, processed, newCompanies: newCos, newBoardSeats: newSeats }
}
