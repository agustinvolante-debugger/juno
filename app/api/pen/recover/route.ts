import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runUnattended } from '@/lib/pen/unattended'
import { briefBatch } from '@/lib/pen/batch'
import { sweepConsent } from '@/lib/pen/whatsapp/bot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MIN = 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

function authorized(req: Request): boolean {
  const want = process.env.PEN_HEALTH_SECRET
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!want || !got || want.length !== got.length) return false
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))
}

// Picks up recordings the pipeline dropped: notes cut off by a function timeout (left in
// 'noting'), or a transcript that arrived and was never written up. Called by the health check
// every 15 minutes (lib/pen/health.ts). Retries for a day; after that the health alert stays
// up and a person looks, so nobody gets a failure email every 15 minutes forever. Also sends
// batch emails whose last recording never reported back (lib/pen/batch.ts).
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // A 'noting' row older than any function can run was cut off mid-write: put it back.
  const { data: cut } = await supabaseAdmin.from('pen_sessions').update({ status: 'transcribed' })
    .eq('status', 'noting').lt('updated_at', ago(15 * MIN)).gt('updated_at', ago(24 * 60 * MIN)).select('id')

  const { data: todo } = await supabaseAdmin.from('pen_sessions').select('id,user_email,created_at')
    .eq('status', 'transcribed').not('transcript', 'is', null).is('notes', null)
    .lt('updated_at', ago(15 * MIN)).gt('updated_at', ago(24 * 60 * MIN))
    .order('created_at', { ascending: true }).limit(3)
  const retried: string[] = []
  for (const s of todo ?? []) {
    await runUnattended(s.id, s.user_email).catch(() => {})
    retried.push(s.id)
  }

  // Finished, never emailed, the batch went quiet: send it.
  const { data: waiting } = await supabaseAdmin.from('pen_sessions').select('id,user_email,created_at,source_channel')
    .eq('status', 'noted').is('briefing_sent_at', null).lt('updated_at', ago(30 * MIN)).gt('created_at', ago(6 * 60 * MIN)).limit(20)
  let flushed = 0
  const seen = new Set<string>()
  for (const s of waiting ?? []) {
    if (s.source_channel === 'whatsapp' || seen.has(s.user_email)) continue
    seen.add(s.user_email)
    if ((await briefBatch(s.user_email, s).catch(() => 'failed')) === 'sent') flushed++
  }
  // WhatsApp files waiting on the consent tap: a reminder, then let go (lib/pen/whatsapp/bot.ts).
  const consent = await sweepConsent().catch(() => ({ nudged: 0, expired: 0 }))
  return NextResponse.json({ ok: true, resetFromNoting: cut?.length ?? 0, retried, batchesSent: flushed, consent })
}
