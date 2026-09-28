import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { resume } from '@/lib/pen/pause'
import { resumeHeld } from '@/lib/pen/transcribe'

export const dynamic = 'force-dynamic'
// Releasing held recordings can include stitching a pieced upload into AssemblyAI.
export const maxDuration = 300

// Ends a pause early. Charging restarts on Stripe's normal cycle, and anything recorded during
// the pause is sent for transcription straight away.
export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    await resume(email)
    const held = await resumeHeld(email).catch(() => null)
    return NextResponse.json({ ok: true, started: held?.started ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
