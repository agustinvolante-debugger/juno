import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession } from '@/lib/pen/store'
import { writeNotes } from '@/lib/pen/pipeline'

export const dynamic = 'force-dynamic'
// Two model calls over the whole transcript — categorise, then extract. A 75-minute recording
// is ~13k tokens in and a full structured note out, measured at 81s, which is why 60 failed.
export const maxDuration = 300

// The manual path: "Write the notes", "Redo notes", or picking a category. The unattended path
// lives in the AssemblyAI webhook; both share lib/pen/pipeline so there is one implementation
// of what a note is.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; type?: string; auto?: boolean }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const forceType = typeof b.type === 'string' && b.type.trim() ? b.type.trim().slice(0, 40) : undefined

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    // A person pressing the button skips the claim — they asked for this and should not be
    // refused because a webhook happens to be mid-flight. The browser's automatic fallback
    // sets `auto` and does take the claim, so it cannot duplicate the webhook's work.
    const r = await writeNotes({ email, session, forceType, claim: Boolean(b.auto) })
    if (r === 'taken') return NextResponse.json({ error: 'already being written' }, { status: 409 })
    return NextResponse.json({ session: r.session, category: r.category })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
