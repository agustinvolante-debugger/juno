import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { getSession, getSessionStatus, updateSession } from '@/lib/pen/store'
import { hasKey } from '@/lib/pen/aai'
import { startTranscription } from '@/lib/pen/transcribe'

export const dynamic = 'force-dynamic'
// A pieced upload is stitched into AssemblyAI here (up to a few hundred MB), so give it room.
export const maxDuration = 300

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Read-only after the plan ends: nothing that adds or calls a model (lib/pen/access.ts).
  const ended = await readOnlyRefusal(email)
  if (ended) return NextResponse.json({ error: ended }, { status: 403 })
  if (!hasKey()) {
    return NextResponse.json(
      { error: 'ASSEMBLYAI_API_KEY is not set. Add it to .env.local and to the Vercel project env.' },
      { status: 503 },
    )
  }

  const b = (await req.json().catch(() => ({}))) as { id?: string; speakers?: number }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const session = await getSession(email, b.id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!session.consent) return NextResponse.json({ error: 'consent not confirmed' }, { status: 400 })
  if (session.status === 'transcribing') return NextResponse.json({ session })
  // A part of a split recording is a slice of a longer file: transcribing it again would bring
  // back the whole file (lib/pen/split-server.ts).
  if (session.transcript?.split) {
    return NextResponse.json({ error: 'This recording was split from a longer one, so it can\'t be transcribed again on its own.' }, { status: 409 })
  }
  // The 90-day rule removed the audio (lib/pen/audio-retention.ts): there is nothing to send.
  if (session.audio_deleted_at) {
    return NextResponse.json({ error: 'The audio of this recording was removed after 90 days, so it cannot be transcribed again. The transcript and notes are kept.' }, { status: 410 })
  }

  try {
    const r = await startTranscription(email, session)
    if (!r.ok) {
      // 402 Payment Required is the honest code: the recording is saved, it is waiting on time.
      return NextResponse.json(
        { error: 'Out of recording hours. This one is saved and will go through when you add hours or the month resets.', held: true, allowance: r.allowance, session: await getSession(email, session.id) },
        { status: 402 },
      )
    }
    return NextResponse.json({ ok: true, aai_id: r.aaiId, webhook: r.webhook })
  } catch (e) {
    await updateSession(session.id, { status: 'error', error_text: (e as Error).message })
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// The UI polls this. It also actively checks AssemblyAI, so the whole thing still works
// if the webhook is not configured (local dev) or never arrives.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // The browser polls this every 6 s per recording on its way (PenApp), so it reads the status
  // columns only (23 Oct): the whole row, once a two-hour transcript had landed, was megabytes
  // per poll per recording. `session` here is that light row; the list merges it in.
  const session = await getSessionStatus(email, id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { has_summary, ...light } = session
  // Transcript saved but the notes never started (the request that saved it was cut off, as a
  // phone does when it sleeps): start them now. Any later check heals it; the claim inside keeps
  // this from running twice alongside the webhook.
  //
  // Not on every poll (22 Oct): the browser asks every 6 s per recording, and a 14-file batch
  // waiting its turn (lib/pen/notes-queue.ts) would start 14 runs every 6 s that each find the
  // queue full. Once the row has sat a minute untouched; the queue itself is what starts it
  // normally. Nor for a row booked for a retry or holding another error: those are the queue's.
  if (session.status === 'transcribed' && !has_summary) {
    const idle = Date.now() - Date.parse(session.updated_at ?? session.created_at)
    if (idle > 60_000 && !session.error_text && !(session.notes_attempts && session.notes_retry_at && Date.parse(session.notes_retry_at) > Date.now())) {
      const { runUnattended } = await import('@/lib/pen/unattended')
      after(() => runUnattended(session.id, email).then(() => {}))
    }
    return NextResponse.json({ session: light })
  }
  if (session.status !== 'transcribing' || !session.aai_id) return NextResponse.json({ session: light })

  try {
    const { fetchTranscript } = await import('@/lib/pen/aai')
    const t = await fetchTranscript(session.aai_id)
    if (t.status === 'completed') {
      // The one time the whole row is needed: storing the transcript.
      const full = await getSession(email, id)
      if (!full) return NextResponse.json({ error: 'not found' }, { status: 404 })
      const { storeTranscript } = await import('@/lib/pen/store-transcript')
      await storeTranscript(full, t)
      // This poll found the transcript first (localhost, or a webhook that hasn't come): start
      // the notes and the email now rather than waiting on either. The claim inside makes it a
      // no-op if the webhook is already doing it.
      const { runUnattended } = await import('@/lib/pen/unattended')
      after(() => runUnattended(session.id, email))
    } else if (t.status === 'error') {
      // A recording that could not be transcribed costs the user nothing.
      await updateSession(session.id, { status: 'error', error_text: t.error ?? 'assemblyai error', metered_sec: 0 })
    }
    const now = await getSessionStatus(email, id)
    if (!now) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const { has_summary: _h, ...after2 } = now
    void _h
    return NextResponse.json({ session: after2 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
