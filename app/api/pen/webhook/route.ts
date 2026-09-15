import { NextResponse, after } from 'next/server'
import { getSessionByAai, getSession, updateSession } from '@/lib/pen/store'
import { fetchTranscript } from '@/lib/pen/aai'
import { writeNotes, STATUS_WORKING } from '@/lib/pen/pipeline'
import { sendBriefing, sendFailureNotice, hasSomethingToSay } from '@/lib/pen/briefing'

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
      await updateSession(session.id, { status: 'error', error_text: t.error ?? `assemblyai status ${t.status}` })
      await sendFailureNotice({
        to: session.user_email,
        sourceName: session.source_name ?? 'your recording',
        reason: t.error ?? 'The transcription service could not process this recording.',
      }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    await updateSession(session.id, {
      status: 'transcribed',
      transcript: { text: t.text ?? '', utterances: t.utterances ?? [] },
      duration_sec: t.audio_duration ?? session.duration_sec,
      error_text: null,
    })

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

/** Notes, then the briefing. Runs with nobody watching, so every failure has to say so. */
async function runUnattended(sessionId: string, email: string) {
  let sourceName = 'your recording'
  try {
    const fresh = await getSession(email, sessionId)
    if (!fresh) return
    sourceName = fresh.source_name ?? 'your recording'

    // Takes the claim; returns 'taken' if a browser tab got there first, in which case that
    // tab owns the notes and sending from here would duplicate the email.
    const r = await writeNotes({ email, session: fresh, claim: true })
    if (r === 'taken') return

    const noted = r.session
    if (!noted || !hasSomethingToSay(noted)) return

    // Belt and braces against a retry that slipped past the claim.
    if (noted.briefing_sent_at) return

    const sent = await sendBriefing({ session: noted, to: [email], replyTo: email })
    if (sent.ok) {
      await updateSession(sessionId, { briefing_sent_at: new Date().toISOString() })
    } else {
      console.warn(`pen: briefing not sent for ${sessionId}: ${sent.error}`)
    }
  } catch (e) {
    await sendFailureNotice({ to: email, sourceName, reason: (e as Error).message }).catch(() => {})
  }
}
