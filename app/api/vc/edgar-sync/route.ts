// GET /api/vc/edgar-sync  (daily Vercel Cron; guarded by CRON_SECRET)
// Pulls the EDGAR daily index for a date, parses new Form D / D-A filings, matches
// related persons to known VC partners, upserts inferred board seats, logs the run.
// ?date=YYYY-MM-DD overrides; ?key=<CRON_SECRET> auth for manual calls.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { dailyFormD, fetchFilingDoc, looksLikeSpv, matchPartners, normName, upsertUniverse } from '@/lib/vc/edgar.mjs'
import { sendWebPush } from '@/lib/news/push'

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
  const freshFilings: any[] = [] // for watchlist alerts, across all days this run
  for (const date of dates) {
    dayResults.push(await syncDay(sb, date, freshFilings))
    if (!explicit) await sb.from('vc_ingest_meta').upsert({ key: 'formd_synced_through', value: date, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }
  let alerts: any = null
  try { alerts = await alertWatchers(sb, freshFilings) } catch (e: any) { alerts = { error: String(e?.message || e).slice(0, 120) } }
  return NextResponse.json({ days: dayResults, alerts })
}

async function syncDay(sb: any, date: string, freshFilings: any[] = []) {
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
    freshFilings.push({ cik: f.cik, name: doc.issuerName, amount: doc.offeringAmount, url: doc.url, formType: f.formType, date })
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

// Watchlist alerts (pitchbook Phase 3): diff this run's fresh filings against every
// user's watchlist (vc_user_state, migration 013) and push through the news app's
// device subscriptions for the same account — one notification per watched company
// per run, deep-linked to the VC page.
async function alertWatchers(sb: any, filings: any[]): Promise<any> {
  if (!filings.length) return { pushed: 0 }
  const states: any = await sb.from('vc_user_state').select('user_email,watchlist')
  if (states.error) return { skipped: 'vc_user_state missing (migration 013)' }
  const users = (states.data || []).filter((u: any) => Array.isArray(u.watchlist) && u.watchlist.length)
  if (!users.length) return { pushed: 0 }

  const allSlugs = [...new Set(users.flatMap((u: any) => u.watchlist.map((w: any) => w.slug)))]
  const { data: cos } = await sb.from('vc_companies').select('slug,name,cik').in('slug', allSlugs)
  const bySlug = new Map((cos || []).map((c: any) => [c.slug, c]))
  const fByCik = new Map(filings.filter((f) => f.cik).map((f) => [String(f.cik), f]))
  const fByName = new Map(filings.filter((f) => f.name).map((f) => [normName(f.name), f]))

  let pushed = 0, matched = 0
  for (const u of users) {
    const hits: any[] = []
    for (const w of u.watchlist) {
      const c: any = bySlug.get(w.slug)
      const f = (c?.cik && fByCik.get(String(c.cik))) || fByName.get(normName(c?.name || w.name || ''))
      if (f) hits.push({ w, f })
    }
    if (!hits.length) continue
    matched += hits.length
    const { data: prefs } = await sb.from('news_prefs').select('layout').eq('user_email', u.user_email).maybeSingle()
    const subs: any[] = (prefs?.layout as any)?.push || []
    if (!subs.length) continue
    for (const { w, f } of hits.slice(0, 5)) {
      const payload = JSON.stringify({
        title: `Form ${f.formType || 'D'} filed · ${w.name || f.name}`,
        body: f.amount ? `New SEC filing — offering ~$${Math.round(Number(f.amount) / 1e6)}M (${f.date})` : `New SEC Form D filing (${f.date})`,
        url: 'https://vc.tryjunoapp.com',
        tag: `formd-${w.slug}`,
      })
      for (const s of subs) {
        try { await sendWebPush(s, payload); pushed++ } catch { /* dead device — news cron prunes these */ }
      }
    }
  }
  return { matched, pushed, users: users.length }
}
