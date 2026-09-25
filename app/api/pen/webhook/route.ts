import { NextResponse, after } from 'next/server'
import { getSessionByAai, getSession, updateSession } from '@/lib/pen/store'
import { fetchTranscript } from '@/lib/pen/aai'
import { writeNotes, STATUS_WORKING } from '@/lib/pen/pipeline'
import { sendBriefing, sendFailureNotice, hasSomethingToSay } from '@/lib/pen/briefing'
import { autoJoin } from '@/lib/pen/merge'
import { enrichPerson, peopleOnSession } from '@/lib/pen/people'
import { sendWhatsAppBriefing, sendWhatsAppFailure } from '@/lib/pen/whatsapp/bot'
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

/** Notes, then the briefing. Runs with nobody watching, so every failure has to say so. */
async function runUnattended(sessionId: string, email: string) {
  let sourceName = 'your recording'
  let whatsapp = false
  try {
    const fresh = await getSession(email, sessionId)
    if (!fresh) return
    sourceName = fresh.source_name ?? 'your recording'
    whatsapp = fresh.source_channel === 'whatsapp'

    // Already the tail of a joined meeting: the first segment carries the notes for the whole
    // thing, so writing a second set here would describe half a meeting as if it were one.
    if (fresh.merge_group && (fresh.merge_index ?? 0) > 0) return

    // This part gets written up on its own FIRST, even when it is about to be joined to the
    // one before it.
    //
    // Those per-part notes are not throwaway — they are the coverage floor that stops the
    // tail of a long meeting being compressed out of the combined note. Measured on the real
    // 73-minute pair, going straight to a single pass over the joined transcript kept 1 of
    // part two's 5 actions and none of its 4 open questions. It costs one extra extraction
    // per part and buys back the half of the meeting that would otherwise vanish.
    const own = await writeNotes({ email, session: fresh, claim: true })
    if (own === 'taken') return

    // Did this recording just complete a meeting the pen split at its file limit? Checked
    // after the write above, so every part has its own notes to contribute.
    const joined = await autoJoin(email, sessionId).catch(() => null)
    let noted = own.session
    let parts = 1

    if (joined) {
      parts = joined.segments.length
      const primary = joined.segments[0]
      // The earlier part was written up and very likely briefed on its own before anyone knew
      // there was more of it. Reset it so the claim can be taken again and one briefing goes
      // out for the finished meeting.
      await updateSession(primary.id, { status: 'transcribed', briefing_sent_at: null })
      const re = await getSession(email, primary.id)
      if (!re) return
      const combined = await writeNotes({ email, session: re, claim: true })
      if (combined === 'taken') return
      noted = combined.session
    }

    // New notes mean something new about whoever was on the call. Refresh their cards.
    if (noted) {
      const people = await peopleOnSession(email, noted.id).catch(() => [])
      await Promise.all(people.map((p) => enrichPerson(email, p.id).catch(() => {})))
    }

    if (!noted || !hasSomethingToSay(noted)) return
    // A tail part on its own says nothing worth an email — the combined briefing covers it.
    if (joined && noted.id !== joined.segments[0].id) return

    // Belt and braces against a retry that slipped past the claim.
    if (noted.briefing_sent_at) return

    // Sent from WhatsApp: the short briefing goes back to that chat as well as the email.
    // Checked on this part OR the joined meeting's first part, since either may have come in
    // that way.
    if (whatsapp || noted.source_channel === 'whatsapp') await sendWhatsAppBriefing(noted)

    const sent = await sendBriefing({ session: noted, to: [email], replyTo: email, parts })
    if (sent.ok) {
      await updateSession(noted.id, { briefing_sent_at: new Date().toISOString() })
    } else {
      console.warn(`pen: briefing not sent for ${noted.id}: ${sent.error}`)
    }
  } catch (e) {
    await sendFailureNotice({ to: email, sourceName, reason: (e as Error).message }).catch(() => {})
    if (whatsapp) await sendWhatsAppFailure(email, sourceName)
  }
}
