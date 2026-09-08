import { NextResponse } from 'next/server'
import { getSessionByAai, updateSession } from '@/lib/pen/store'
import { fetchTranscript } from '@/lib/pen/aai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// AssemblyAI calls this when a transcript finishes. It cannot authenticate, so the URL
// carries a shared secret. This only stores the transcript — extraction is a separate
// call so neither function risks the 60s ceiling.
export async function POST(req: Request) {
  const secret = process.env.PEN_WEBHOOK_SECRET
  const k = new URL(req.url).searchParams.get('k')
  if (!secret || k !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as { transcript_id?: string; status?: string }
  if (!b.transcript_id) return NextResponse.json({ error: 'transcript_id required' }, { status: 400 })

  const session = await getSessionByAai(b.transcript_id)
  if (!session) return NextResponse.json({ ok: true, note: 'no matching session' })

  try {
    const t = await fetchTranscript(b.transcript_id)
    if (t.status === 'completed') {
      await updateSession(session.id, {
        status: 'transcribed',
        transcript: { text: t.text ?? '', utterances: t.utterances ?? [] },
        duration_sec: t.audio_duration ?? session.duration_sec,
        error_text: null,
      })
    } else {
      await updateSession(session.id, { status: 'error', error_text: t.error ?? `assemblyai status ${t.status}` })
    }
  } catch (e) {
    await updateSession(session.id, { status: 'error', error_text: (e as Error).message })
  }
  return NextResponse.json({ ok: true })
}
