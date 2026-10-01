// /api/vc/news-funding — Daily Brief funding news → vc_funding_events ("reported by press").
// GET|POST ?dry=1&days=14 runs the pipeline (lib/vc/news-funding.ts). Normally chained from
// the end of /api/news/cron (no extra Vercel cron); callable by hand for backfills.
// POST { id, status: 'hidden' | 'reported' } is the undo (admin key only).
// Guard: Authorization: Bearer CRON_SECRET, or x-admin-key = VC_ADMIN_KEY (falls back to CRON_SECRET).
import { NextRequest, NextResponse } from 'next/server'
import { runNewsFunding, setFundingEventStatus } from '@/lib/vc/news-funding'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function auth(req: NextRequest): { cron: boolean; admin: boolean } {
  const secret = process.env.CRON_SECRET
  const adminKey = process.env.VC_ADMIN_KEY || secret
  const cron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const admin = !!adminKey && req.headers.get('x-admin-key') === adminKey
  // local dev without CRON_SECRET: open, like the other crons
  const dev = !secret && process.env.NODE_ENV !== 'production'
  return { cron: cron || dev, admin: admin || dev }
}

async function run(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const dry = p.get('dry') === '1' || p.get('dry') === 'true'
  const days = Number(p.get('days')) || 14
  try {
    const r = await runNewsFunding({ dry, days, reprocess: p.get('reprocess') === '1' })
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const a = auth(req)
  if (!a.cron && !a.admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return run(req)
}

export async function POST(req: NextRequest) {
  const a = auth(req)
  const body = await req.clone().json().catch(() => null)
  if (body && body.id) {
    if (!a.admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const status = body.status === 'reported' ? 'reported' : 'hidden'
    const r = await setFundingEventStatus(String(body.id), status)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  if (!a.cron && !a.admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return run(req)
}
