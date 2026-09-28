// The unattended path, shared: transcript stored -> notes -> people cards -> the one email (and
// WhatsApp, for recordings sent that way). Run by the AssemblyAI webhook, and by the polling
// route when it's the one that finds the transcript (localhost, or a webhook that never came),
// so the notes start and the email goes out either way. The claim in writeNotes makes a race
// between the two harmless: whoever takes it does the work, the other returns.

import { getSession, updateSession } from './store'
import { writeNotes } from './pipeline'
import { sendBriefing, sendFailureNotice, sendReadyNotice, hasSomethingToSay } from './briefing'
import { autoJoin } from './merge'
import { enrichPerson, peopleOnSession } from './people'
import { sendWhatsAppBriefing, sendWhatsAppFailure } from './whatsapp/bot'

/** Notes, then the briefing. Runs with nobody watching, so every failure has to say so. */
export async function runUnattended(sessionId: string, email: string) {
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

    if (!noted) return
    // A tail part on its own says nothing worth an email — the combined briefing covers it.
    if (joined && noted.id !== joined.segments[0].id) return

    // Belt and braces against a retry that slipped past the claim.
    if (noted.briefing_sent_at) return

    // Nothing to brief (no summary, to-dos, near-misses or questions). The upload screen
    // promised an email when it's ready, so a short "it's ready" one goes instead of silence.
    if (!hasSomethingToSay(noted)) {
      const ready = await sendReadyNotice({ to: email, title: noted.title || sourceName })
      if (ready.ok) await updateSession(noted.id, { briefing_sent_at: new Date().toISOString() })
      return
    }

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
