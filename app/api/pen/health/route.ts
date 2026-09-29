import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { runHealth } from '@/lib/pen/health'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Called every 15 minutes by Supabase pg_cron (schema.sql, "health"), with the shared secret as
// a Bearer token. Emails the owner when a check goes down or comes back; see lib/pen/health.ts.
function authorized(req: Request): boolean {
  const want = process.env.PEN_HEALTH_SECRET
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!want || !got || want.length !== got.length) return false
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { results, alerted } = await runHealth()
  return NextResponse.json({ ok: results.every((r) => r.ok), results, alerted })
}
