// GET /api/vc/enrich-cron  (nightly Vercel Cron; CRON_SECRET-guarded)
// The automated enrichment loop, feed (a): recent Form D filers that aren't in
// the curated graph yet get the full MatX treatment — EDGAR ingest (filed fact,
// live) + web-sourced investors/totals (staged to vc_enrich_queue for review).
// Caps: VC_ENRICH_NIGHTLY_CAP companies/run (default 8),
//       VC_ENRICH_DAILY_CAP USD/day (default 3, separate from the chat cap).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { enrichCompany } from '@/lib/vc/enrich'

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

  const candidates = (fresh || [])
    .filter((f: any) => !curatedCiks.has(f.cik) && !recentSlugs.has(`cik-${f.cik}`))
    .slice(0, nightlyCap)

  const runNote = `nightly ${new Date().toISOString().slice(0, 10)}`
  const results: any[] = []
  let totalCost = spent
  for (const c of candidates) {
    if (totalCost >= dailyBudget) { results.push({ name: c.name, skipped: 'budget' }); continue }
    const hint = [c.industry_group, c.state, c.last_offering_amount ? `last offering ~$${Math.round(c.last_offering_amount / 1e6)}M` : null, `CIK ${c.cik}`].filter(Boolean).join(' · ')
    const r = await enrichCompany(c.name, hint, runNote)
    totalCost += r.costUsd
    results.push({ name: c.name, ok: r.ok, costUsd: +r.costUsd.toFixed(3), summary: r.summary.slice(0, 140) })
  }

  const { count: pending } = await sb.from('vc_enrich_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  await sb.from('vc_sync_log').insert({ source: 'enrich', filings_processed: candidates.length, notes: `${runNote}: ${results.filter((r) => r.ok).length}/${candidates.length} enriched, $${(totalCost - spent).toFixed(2)}, ${pending || 0} pending review` })
  return NextResponse.json({ candidates: candidates.length, results, spentTonight: +(totalCost - spent).toFixed(3), pendingReview: pending || 0 })
}
