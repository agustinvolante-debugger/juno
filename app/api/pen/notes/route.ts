import { NextResponse } from 'next/server'
import { autoToNotion } from '@/lib/pen/notion'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { getSession } from '@/lib/pen/store'
import { writeNotes } from '@/lib/pen/pipeline'
import { briefOnce } from '@/lib/pen/briefing'

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
  // Read-only after the plan ends: nothing that adds or calls a model (lib/pen/access.ts).
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })

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
    // The upload screen promised an email when it's ready. The webhook usually sends it; this
    // covers the notes written here instead (the browser's fallback when the webhook didn't
    // arrive, or a first "Write the notes" after a failure). Already sent means nothing new.
    // Only for FIRST notes: a Redo on an old recording that predates the email must not send one.
    if (r.session && session.status !== 'noted') {
      await briefOnce({ email, session: r.session }).catch(() => {})
      await autoToNotion(email, r.session)
    }
    return NextResponse.json({ session: r.session, category: r.category })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
