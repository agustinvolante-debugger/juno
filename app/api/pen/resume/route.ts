import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { resumeHeld } from '@/lib/pen/transcribe'
import { getAllowance } from '@/lib/pen/allowance'

export const dynamic = 'force-dynamic'
// Held recordings may be pieced uploads, stitched into AssemblyAI on the way out.
export const maxDuration = 300

// Sends recordings that were held for lack of time, if there is time now. The app calls this
// when it opens with anything held, which is what releases them after the monthly reset.
export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const r = await resumeHeld(email)
    return NextResponse.json({ ...r, allowance: await getAllowance(email) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
