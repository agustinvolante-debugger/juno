// /api/vc/override — the funding truth layer.
// GET: public list of verified-raise overrides (frontend merges them over Form D figures).
// POST: upsert an override; guarded by x-admin-key = VC_ADMIN_KEY (falls back to
// CRON_SECRET so it works without new env). A verifiedTotalRaised of null deletes.
// Designed so a future automated news-enrichment job can write to the same endpoint.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type,x-admin-key' }
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function GET() {
  const { data, error } = await supabaseAdmin.from('vc_funding_overrides').select('*').order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ overrides: data || [] }, { headers: CORS })
}

export async function POST(req: NextRequest) {
  const secret = process.env.VC_ADMIN_KEY || process.env.CRON_SECRET
  if (!secret || req.headers.get('x-admin-key') !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS })
  const b = await req.json().catch(() => ({}))
  const slug = (b.companySlug || '').trim()
  if (!slug) return NextResponse.json({ error: 'companySlug required' }, { status: 400, headers: CORS })

  if (b.verifiedTotalRaised == null) {
    const { error } = await supabaseAdmin.from('vc_funding_overrides').delete().eq('company_slug', slug)
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
    return NextResponse.json({ deleted: slug }, { headers: CORS })
  }
  const row = {
    company_slug: slug, cik: b.cik || null,
    verified_total_raised: Number(b.verifiedTotalRaised),
    last_round: b.lastRound || null, source_url: b.sourceUrl || null, note: b.note || null,
    updated_at: new Date().toISOString(),
  }
  if (!Number.isFinite(row.verified_total_raised) || row.verified_total_raised <= 0) return NextResponse.json({ error: 'verifiedTotalRaised must be a positive number' }, { status: 400, headers: CORS })
  const { data, error } = await supabaseAdmin.from('vc_funding_overrides').upsert(row, { onConflict: 'company_slug' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ override: data }, { headers: CORS })
}
