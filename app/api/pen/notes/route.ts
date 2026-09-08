import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession, getClientProfile, upsertClientProfile } from '@/lib/pen/store'
import { extractShowing, updateClientProfile } from '@/lib/pen/extract'
import { toDialogue } from '@/lib/pen/aai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Runs the realtor extraction over a stored transcript, then folds the result into the
// running picture of that buyer. Separate from transcription so each stays inside the
// function time limit and so notes can be regenerated without paying for audio again.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { id?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const dialogue = toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  if (!dialogue.trim()) return NextResponse.json({ error: 'no transcript yet' }, { status: 400 })

  try {
    const name = session.client_name || undefined
    const prior = name ? (await getClientProfile(email, name))?.profile : undefined

    const notes = await extractShowing(dialogue, prior)
    const clientName = session.client_name || notes.client_name || ''

    await updateSession(session.id, {
      notes,
      status: 'noted',
      error: null,
      ...(session.client_name ? {} : clientName ? { client_name: clientName } : {}),
      ...(session.title ? {} : notes.summary ? { title: notes.summary.split(/[.!?]/)[0].slice(0, 80) } : {}),
    })

    // The compounding piece. Only meaningful once we know who the buyer is.
    if (clientName) {
      const merged = await updateClientProfile(prior, notes)
      await upsertClientProfile(email, clientName, merged)
    }

    return NextResponse.json({ session: await getSession(email, session.id) })
  } catch (e) {
    await updateSession(session.id, { status: 'error', error: (e as Error).message })
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
