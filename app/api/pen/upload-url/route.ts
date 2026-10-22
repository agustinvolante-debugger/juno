import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { pausedRefusal } from '@/lib/pen/pause'
import { createUploadUrl, createUploadParts, MAX_PARTS } from '@/lib/pen/store'
import { withDbRetry, isTransientError } from '@/lib/pen/db-retry'

export const dynamic = 'force-dynamic'

// Hands the browser a signed URL so it can PUT the audio straight into Supabase Storage.
// Audio must never pass through this function: Vercel caps request bodies at 4.5MB and a
// showing is far bigger even after Opus compression.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Paused: the service is off. Reading stays open; adding doesn't.
  // Every step here retries while the database or storage is busy (22 Oct: some files of a
  // 14-file batch never got this far). A busy answer that outlasts the retries is a 503, which
  // the upload tray retries in turn; anything else is a real refusal.
  const paused = await withDbRetry(() => pausedRefusal(email))
  if (paused) return NextResponse.json({ error: paused }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { name?: string; parts?: number }
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // A big file from a phone, uploaded as it is in pieces (see createUploadParts).
  if (body.parts !== undefined) {
    const n = Math.floor(Number(body.parts))
    if (!Number.isFinite(n) || n < 1 || n > MAX_PARTS) return NextResponse.json({ error: 'That file is too big to upload.' }, { status: 400 })
    try {
      return NextResponse.json(await withDbRetry(() => createUploadParts(email, body.name!, n)))
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: isTransientError(e) ? 503 : 500 })
    }
  }

  try {
    const name = body.name
    const out = await withDbRetry(() => createUploadUrl(email, name))
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: isTransientError(e) ? 503 : 500 })
  }
}
