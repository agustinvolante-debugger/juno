import { NextResponse } from 'next/server'
import { runRetention, deleteEnabled } from '@/lib/pen/audio-retention'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Daily (vercel.json): deletes recordings' audio 90 days after upload (lib/pen/audio-retention.ts).
// A DRY RUN unless the env has PEN_AUDIO_DELETE=1: it reports what it would delete and touches
// nothing. Vercel Cron sends Bearer CRON_SECRET; without the secret configured, nothing runs.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const r = await runRetention({ dry: !deleteEnabled(), budgetMs: 90_000 })
    const { dry, candidates, bytes, deleted, kept, skipped, ...rest } = r
    return NextResponse.json({ dry, candidates, bytes, deleted, kept, skipped, ...rest })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
