import { NextResponse, after } from 'next/server'
import { getSessionByAai, getSession, updateSession } from '@/lib/pen/store'
import { fetchTranscript } from '@/lib/pen/aai'
import { STATUS_WORKING } from '@/lib/pen/pipeline'
import { runUnattended } from '@/lib/pen/unattended'
import { sendFailureNotice } from '@/lib/pen/briefing'
import { sendWhatsAppFailure } from '@/lib/pen/whatsapp/bot'
import { storeTranscript } from '@/lib/pen/store-transcript'

export const dynamic = 'force-dynamic'
// The response goes back immediately; `after()` keeps the function alive for the slow part.
// Extraction measured 81s on a 75-minute recording, so 60 was never going to be enough.
export const maxDuration = 300

// AssemblyAI calls this when a transcript finishes. It cannot authenticate, so the URL carries
// a shared secret.
//
// This is now the whole unattended path: transcript → notes → briefing in the inbox. It used
// to stop at storing the transcript, with the browser's polling loop writing the notes, which
// meant closing the tab silently abandoned the recording — unacceptable once the product's
// promise is "close the app, we'll email you".
export async function POST(req: Request) {
  const secret = process.env.PEN_WEBHOOK_SECRET
  const k = new URL(req.url).searchParams.get('k')
  if (!secret || k !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as { transcript_id?: string; status?: string }
  if (!b.transcript_id) return NextResponse.json({ error: 'transcript_id required' }, { status: 400 })

  const session = await getSessionByAai(b.transcript_id)
  if (!session) return NextResponse.json({ ok: true, note: 'no matching session' })

  // AssemblyAI retries a webhook it thinks failed. Without this the retry would overwrite a
  // finished session back to `transcribed` and pay for a second extraction — the briefing was
  // already guarded, the model call was not.
  if (session.status === 'noted' || session.status === STATUS_WORKING) {
    return NextResponse.json({ ok: true, note: 'already processed' })
  }

  try {
    const t = await fetchTranscript(b.transcript_id)
    if (t.status !== 'completed') {
      // A recording that could not be transcribed costs the user nothing.
      await updateSession(session.id, { status: 'error', error_text: t.error ?? `assemblyai status ${t.status}`, metered_sec: 0 })
      await sendFailureNotice({
        to: session.user_email,
        sourceName: session.source_name ?? 'your recording',
        reason: t.error ?? 'The transcription service could not process this recording.',
      }).catch(() => {})
      if (session.source_channel === 'whatsapp') await sendWhatsAppFailure(session.user_email, session.source_name ?? 'your recording')
      return NextResponse.json({ ok: true })
    }

    await storeTranscript(session, t)

    // Answer AssemblyAI now. Holding the connection for the ~80s that extraction takes would
    // look like a failed delivery and earn a retry, which is how you get two briefings.
    after(async () => {
      await runUnattended(session.id, session.user_email)
    })

    return NextResponse.json({ ok: true, queued: true })
  } catch (e) {
    await updateSession(session.id, { status: 'error', error_text: (e as Error).message })
    return NextResponse.json({ ok: true, error: (e as Error).message })
  }
}
