// GET /api/vc/enrich-cron  (nightly Vercel Cron; CRON_SECRET-guarded)
// The automated enrichment loop, feed (a): recent Form D filers that aren't in
// the curated graph yet get the full MatX treatment — EDGAR ingest (filed fact,
// live) + web-sourced investors/totals (staged to vc_enrich_queue for review).
// Caps: VC_ENRICH_NIGHTLY_CAP companies/run (default 8),
//       VC_ENRICH_DAILY_CAP USD/day (default 3, separate from the chat cap).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { enrichCompany } from '@/lib/vc/enrich'
import { getFeedCache, getVcEnrichRequests, setVcEnrichRequests } from '@/lib/news/store'
import { extractFundingCompanies } from '@/lib/news/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authed = !secret || req.headers.get('authorization') === `Bearer ${secret}` || req.nextUrl.searchParams.get('key') === secret
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sb = supabaseAdmin

  const nightlyCap = Math.min(Number(req.nextUrl.searchParams.get('cap')) || Number(process.env.VC_ENRICH_NIGHTLY_CAP) || 8, 25)
  const dailyBudget = Number(process.env.VC_ENRICH_DAILY_CAP) || 3

  // budget check: enrichment runs are the conversation_id-null rows in the cost log
  const dayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'
  const { data: runs } = await sb.from('vc_chat_runs').select('cost_usd').is('conversation_id', null).gte('created_at', dayStart)
  const spent = (runs || []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0)
  if (spent >= dailyBudget) {
    return NextResponse.json({ skipped: true, reason: `enrichment budget reached ($${spent.toFixed(2)} of $${dailyBudget})` })
  }

  // feed (a): fresh operating-company filers, meaningful raises, not yet curated
  const since = new Date(Date.now() - 4 * 86400_000).toISOString().slice(0, 10)
  const { data: fresh } = await sb.from('vc_formd_issuers')
    .select('cik,name,industry_group,state,last_offering_amount,first_filing_date')
    .gte('first_filing_date', since)
    .eq('entity_type', 'operating_company')
    .gte('last_offering_amount', 3_000_000)
    .or('industry_group.neq.Pooled Investment Fund,industry_group.is.null')
    .order('last_offering_amount', { ascending: false })
    .limit(60)
  const { data: curated } = await sb.from('vc_companies').select('cik')
  const curatedCiks = new Set((curated || []).map((c: any) => c.cik).filter(Boolean))
  // skip companies already proposed recently (don't re-enrich every night)
  const { data: queued } = await sb.from('vc_enrich_queue').select('company_slug').gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString())
  const recentSlugs = new Set((queued || []).map((q: any) => q.company_slug))

  const formd = (fresh || []).filter((f: any) => !curatedCiks.has(f.cik) && !recentSlugs.has(`cik-${f.cik}`))

  // Name-level dedupe across all feeds (curated graph + anything queued recently).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const { data: curatedNames } = await sb.from('vc_companies').select('name')
  const { data: queuedNames } = await sb.from('vc_enrich_queue').select('company_name').gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString()).limit(1000)
  const seen = new Set<string>([
    ...(curatedNames || []).map((c: any) => norm(c.name || '')),
    ...(queuedNames || []).map((q: any) => norm(q.company_name || '')).filter(Boolean),
  ])

  type Cand = { name: string; hint: string; via: 'request' | 'formd' | 'news' }
  const candidates: Cand[] = []

  // feed (r): explicit ◆-map requests from the Daily Brief — first in line
  const requests = await getVcEnrichRequests()
  for (const r of requests) {
    if (seen.has(norm(r.company))) continue
    seen.add(norm(r.company))
    candidates.push({ name: r.company, hint: [r.round, 'requested via Daily Brief ◆ map'].filter(Boolean).join(' · '), via: 'request' })
  }

  // feed (a): fresh Form D filers
  for (const c of formd) {
    if (seen.has(norm(c.name))) continue
    seen.add(norm(c.name))
    candidates.push({
      name: c.name,
      hint: [c.industry_group, c.state, c.last_offering_amount ? `last offering ~$${Math.round(c.last_offering_amount / 1e6)}M` : null, `CIK ${c.cik}`].filter(Boolean).join(' · '),
      via: 'formd',
    })
  }

  // feed (b): companies extracted from the cached Daily Brief funding headlines (one Haiku call)
  try {
    const funding = (await getFeedCache())['funding'] || []
    const newsCands = await extractFundingCompanies(funding.slice(0, 25).map((it) => it.t))
    for (const c of newsCands) {
      if (seen.has(norm(c.company))) continue
      seen.add(norm(c.company))
      candidates.push({ name: c.company, hint: [c.round, 'from Daily Brief funding headlines'].filter(Boolean).join(' · '), via: 'news' })
    }
  } catch { /* funding feed extraction is best-effort */ }

  const batch = candidates.slice(0, nightlyCap)
  const runNote = `nightly ${new Date().toISOString().slice(0, 10)}`
  const results: any[] = []
  let totalCost = spent
  const done = new Set<string>() // requests either enriched or deduped-out get cleared below
  for (const c of batch) {
    if (totalCost >= dailyBudget) { results.push({ name: c.name, via: c.via, skipped: 'budget' }); continue }
    const r = await enrichCompany(c.name, c.hint, runNote)
    totalCost += r.costUsd
    done.add(norm(c.name))
    results.push({ name: c.name, via: c.via, ok: r.ok, costUsd: +r.costUsd.toFixed(3), summary: r.summary.slice(0, 140) })
  }
  if (requests.length) {
    // keep only requests that are still waiting (skipped for cap/budget); drop enriched + already-known
    await setVcEnrichRequests(requests.filter((r) => !done.has(norm(r.company)) && candidates.some((c) => c.via === 'request' && norm(c.name) === norm(r.company))))
  }

  const { count: pending } = await sb.from('vc_enrich_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  const viaCounts = batch.reduce((m: Record<string, number>, c) => ((m[c.via] = (m[c.via] || 0) + 1), m), {})
  await sb.from('vc_sync_log').insert({ source: 'enrich', filings_processed: batch.length, notes: `${runNote}: ${results.filter((r) => r.ok).length}/${batch.length} enriched (${Object.entries(viaCounts).map(([k, v]) => `${v} ${k}`).join(', ')}), $${(totalCost - spent).toFixed(2)}, ${pending || 0} pending review` })
  return NextResponse.json({ candidates: batch.length, via: viaCounts, results, spentTonight: +(totalCost - spent).toFixed(3), pendingReview: pending || 0 })
}
