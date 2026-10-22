import crypto from 'node:crypto'
import { NextResponse, after } from 'next/server'
import { runProactive } from '@/lib/pen/proactive'
import { sweepQueued } from '@/lib/pen/notes-queue'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Every 15 minutes: the messages Juno sends first (lib/pen/proactive.ts). Called by Supabase
// pg_cron with PEN_HEALTH_SECRET (schema.sql, "proactive"), like /api/pen/reminders, or by a
// Vercel cron with CRON_SECRET. Either Bearer token works; without one configured, nothing runs.
function authorized(req: Request): boolean {
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!got) return false
  return [process.env.CRON_SECRET, process.env.PEN_HEALTH_SECRET].some(
    (want) => !!want && want.length === got.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got)),
  )
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // The same 15 minutes also starts write-ups left waiting (the per-user cap) or due another try
  // after a busy database (lib/pen/notes-queue.ts), in case the recovery route's kick didn't run.
  // After the response; the claim and the cap make a second sweeper harmless.
  after(() => sweepQueued().then(() => {}, (e) => console.warn(`pen proactive: queue: ${(e as Error).message}`)))
  try {
    const r = await runProactive()
    // Counts and statuses only: no message text in the cron's response.
    return NextResponse.json({ users: r.users, sent: r.sent, statuses: r.runs.map((x) => x.result?.status ?? 'nothing') })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
