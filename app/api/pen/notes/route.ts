import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession, getClientProfile, upsertClientProfile } from '@/lib/pen/store'
import type { MeetingType } from '@/lib/pen/store'
import { extractNotes, isViewing, updateClientProfile } from '@/lib/pen/extract'
import { categorize, CONFIDENCE_FLOOR } from '@/lib/pen/categorize'
import { toDialogue } from '@/lib/pen/aai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


// Runs the extraction over a stored transcript. Separate from transcription so notes can be
// regenerated (e.g. after overriding the meeting type) without paying for the audio again.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; type?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Any string is a valid category now; the picker is a convenience, not a constraint.
  const forceType = typeof b.type === 'string' && b.type.trim() ? b.type.trim().slice(0, 40) : undefined

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const dialogue = toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  if (!dialogue.trim()) return NextResponse.json({ error: 'no transcript yet' }, { status: 400 })

  try {
    const name = session.client_name || undefined
    const prior = name ? (await getClientProfile(email, name))?.profile : undefined

    // Category first: it is a fast Haiku call, it decides whether the showing block gets
    // filled, and it is what the left nav needs. An explicit override skips it entirely.
    let category = forceType ?? session.meeting_type ?? ''
    let categoryConfidence: number | null = null
    let categoryAlternatives: string[] = []
    if (!forceType && !category) {
      const c = await categorize(dialogue)
      categoryConfidence = c.confidence
      categoryAlternatives = c.alternatives
      if (c.category && c.confidence >= CONFIDENCE_FLOOR) category = c.category
    }

    const notes = await extractNotes(dialogue, { category: category || null, priorProfile: prior })
    const clientName = session.client_name || notes.client_name || ''

    await updateSession(session.id, {
      // Keep it on the notes blob too, so everything downstream that reads notes.meeting_type
      // (chat starters, the landing examples) keeps working without a migration.
      notes: { ...notes, meeting_type: category || undefined },
      meeting_type: category || null,
      status: 'noted',
      error_text: null,
      // Regenerating invalidates tick marks, since the action list itself changed.
      action_done: [],
      ...(session.client_name ? {} : clientName ? { client_name: clientName } : {}),
      ...(session.title ? {} : notes.headline ? { title: notes.headline.slice(0, 90) } : {}),
    })

    // Only meaningful once we know who the people are, and only for repeat relationships.
    if (clientName && isViewing(category)) {
      const merged = await updateClientProfile(prior, notes)
      await upsertClientProfile(email, clientName, merged)
    }

    return NextResponse.json({
      session: await getSession(email, session.id),
      // Surfaced so the UI can ask when the categoriser was not sure enough to commit.
      category: { value: category || null, confidence: categoryConfidence, alternatives: categoryAlternatives },
    })
  } catch (e) {
    await updateSession(session.id, { status: 'error', error_text: (e as Error).message })
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
