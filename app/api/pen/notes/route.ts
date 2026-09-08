import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession, getClientProfile, upsertClientProfile } from '@/lib/pen/store'
import type { MeetingType } from '@/lib/pen/store'
import { extractNotes, updateClientProfile } from '@/lib/pen/extract'
import { toDialogue } from '@/lib/pen/aai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TYPES: MeetingType[] = ['showing', 'clinical', 'generic']

// Runs the extraction over a stored transcript. Separate from transcription so notes can be
// regenerated (e.g. after overriding the meeting type) without paying for the audio again.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string; type?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const forceType = TYPES.includes(b.type as MeetingType) ? (b.type as MeetingType) : undefined

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const dialogue = toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  if (!dialogue.trim()) return NextResponse.json({ error: 'no transcript yet' }, { status: 400 })

  try {
    const name = session.client_name || undefined
    const prior = name ? (await getClientProfile(email, name))?.profile : undefined

    const notes = await extractNotes(dialogue, { forceType, priorProfile: prior })
    const clientName = session.client_name || notes.client_name || ''

    await updateSession(session.id, {
      notes,
      meeting_type: notes.meeting_type ?? 'generic',
      status: 'noted',
      error_text: null,
      // Regenerating invalidates tick marks, since the action list itself changed.
      action_done: [],
      ...(session.client_name ? {} : clientName ? { client_name: clientName } : {}),
      ...(session.title ? {} : notes.headline ? { title: notes.headline.slice(0, 90) } : {}),
    })

    // Only meaningful once we know who the people are, and only for repeat relationships.
    if (clientName && notes.meeting_type === 'showing') {
      const merged = await updateClientProfile(prior, notes)
      await upsertClientProfile(email, clientName, merged)
    }

    return NextResponse.json({ session: await getSession(email, session.id) })
  } catch (e) {
    await updateSession(session.id, { status: 'error', error_text: (e as Error).message })
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
