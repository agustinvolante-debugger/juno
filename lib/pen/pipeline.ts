// What happens to a recording once its transcript exists.
//
// This used to live in the browser: a polling loop noticed the transcript was ready and
// called the notes route. That is fine while someone is watching the tab and useless the
// moment they close it — which is exactly what we are now asking people to do ("we'll email
// you"). So the work moved here, where the webhook can run it with nobody watching.
//
// Both callers go through claimNotes, which is a compare-and-set on the row. The browser and
// the webhook can reach the same transcript simultaneously; without the claim they would both
// run an Opus extraction and both send a briefing, and a duplicate briefing is worse than a
// late one.

import { claimStatus, getSession, updateSession, getClientProfile, upsertClientProfile } from './store'
import type { PenSession, MeetingType } from './store'
import { extractNotes, isViewing, updateClientProfile } from './extract'
import { categorize, CONFIDENCE_FLOOR } from './categorize'
import { toDialogue } from './aai'
import { groupSessions, combinedDialogue } from './merge'

/** Held while extraction runs, so a second caller sees the row is taken. */
export const STATUS_WORKING = 'noting'

export type NotesResult = {
  session: PenSession | null
  category: { value: string | null; confidence: number | null; alternatives: string[] }
}

export function dialogueOf(session: PenSession): string {
  return toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
}

/**
 * The dialogue the notes are written from.
 *
 * Normally that is just this recording. When the pen split a meeting across several files it
 * is all of them, in order, with the seams marked — one set of notes for one meeting, rather
 * than two halves that each read as if the other never happened.
 */
export async function dialogueFor(email: string, session: PenSession): Promise<string> {
  if (!session.merge_group) return dialogueOf(session)
  const segments = await groupSessions(email, session.merge_group)
  if (segments.length < 2) return dialogueOf(session)
  return combinedDialogue(segments)
}

/**
 * Writes the notes for a session.
 *
 * `force` is the manual path — the user pressed "Redo notes" or picked a category — and skips
 * the claim, because they are explicitly asking for the work to happen again.
 */
export async function writeNotes(opts: {
  email: string
  session: PenSession
  forceType?: MeetingType
  /** Manual regeneration bypasses the claim; automatic runs must take it. */
  claim: boolean
}): Promise<NotesResult | 'taken'> {
  const { email, session, forceType } = opts

  if (opts.claim) {
    const won = await claimStatus(session.id, 'transcribed', STATUS_WORKING)
    if (!won) return 'taken'
  }

  const dialogue = await dialogueFor(email, session)
  if (!dialogue.trim()) {
    if (opts.claim) await updateSession(session.id, { status: 'transcribed' })
    throw new Error('no transcript yet')
  }

  try {
    const name = session.client_name || undefined
    const prior = name ? (await getClientProfile(email, name))?.profile : undefined

    let category = forceType ?? session.meeting_type ?? ''
    let confidence: number | null = null
    let alternatives: string[] = []
    if (!forceType && !category) {
      const c = await categorize(dialogue)
      confidence = c.confidence
      alternatives = c.alternatives
      if (c.category && c.confidence >= CONFIDENCE_FLOOR) category = c.category
    }

    const notes = await extractNotes(dialogue, { category: category || null, priorProfile: prior })
    const clientName = session.client_name || notes.client_name || ''

    await updateSession(session.id, {
      notes: { ...notes, meeting_type: category || undefined },
      meeting_type: category || null,
      status: 'noted',
      error_text: null,
      action_done: [],
      ...(session.client_name ? {} : clientName ? { client_name: clientName } : {}),
      ...(session.title ? {} : notes.headline ? { title: notes.headline.slice(0, 90) } : {}),
    })

    if (clientName && isViewing(category)) {
      const merged = await updateClientProfile(prior, notes)
      await upsertClientProfile(email, clientName, merged)
    }

    return {
      session: await getSession(email, session.id),
      category: { value: category || null, confidence, alternatives },
    }
  } catch (e) {
    // Leave the row in a state that says what happened rather than stuck on `noting`.
    await updateSession(session.id, { status: 'error', error_text: (e as Error).message })
    throw e
  }
}
