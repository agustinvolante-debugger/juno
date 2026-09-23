import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession } from '@/lib/pen/store'
import { hasKey } from '@/lib/pen/aai'
import { startTranscription } from '@/lib/pen/transcribe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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

  try {
    const r = await startTranscription(email, session, b.speakers)
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

  const session = await getSession(email, id)
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (session.status !== 'transcribing' || !session.aai_id) return NextResponse.json({ session })

  try {
    const { fetchTranscript } = await import('@/lib/pen/aai')
    const t = await fetchTranscript(session.aai_id)
    if (t.status === 'completed') {
      await updateSession(session.id, {
        status: 'transcribed',
        transcript: { text: t.text ?? '', utterances: t.utterances ?? [] },
        duration_sec: t.audio_duration ?? session.duration_sec,
        ...(t.audio_duration ? { metered_sec: Math.round(t.audio_duration) } : {}),
      })
    } else if (t.status === 'error') {
      // A recording that could not be transcribed costs the user nothing.
      await updateSession(session.id, { status: 'error', error_text: t.error ?? 'assemblyai error', metered_sec: 0 })
    }
    return NextResponse.json({ session: await getSession(email, id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
