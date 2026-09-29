import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { fireDue } from '@/lib/pen/reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Called by Supabase pg_cron when a reminder is due (schema.sql, "reminders"), with
// PEN_HEALTH_SECRET as a Bearer token. Sends each due reminder to its WhatsApp once.
function authorized(req: Request): boolean {
  const want = process.env.PEN_HEALTH_SECRET
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!want || !got || want.length !== got.length) return false
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await fireDue())
}
