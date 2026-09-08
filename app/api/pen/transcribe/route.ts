import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getSession, updateSession, createReadUrl } from '@/lib/pen/store'
import { submit, hasKey } from '@/lib/pen/aai'

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
    // AssemblyAI fetches the audio itself, so it needs a URL it can reach. Short-lived.
    const audioUrl = await createReadUrl(session.storage_path)

    const secret = process.env.PEN_WEBHOOK_SECRET
    const base = process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL
    const webhookUrl = secret && base ? `${base.replace(/\/$/, '')}/api/pen/webhook?k=${secret}` : undefined

    const t = await submit({ audioUrl, webhookUrl, speakersExpected: b.speakers })
    await updateSession(session.id, { aai_id: t.id, status: 'transcribing', error: null })
    return NextResponse.json({ ok: true, aai_id: t.id, webhook: Boolean(webhookUrl) })
  } catch (e) {
    await updateSession(session.id, { status: 'error', error: (e as Error).message })
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
      })
    } else if (t.status === 'error') {
      await updateSession(session.id, { status: 'error', error: t.error ?? 'assemblyai error' })
    }
    return NextResponse.json({ session: await getSession(email, id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
