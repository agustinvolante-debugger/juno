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
import { namedDialogue, type SpeakerMap } from './speakers'
import { groupSessions, combinedDialogue } from './merge'
import { briefFor, getProfile } from './profile'
import { languageName } from './profile-fields'
import { peopleOnSession } from './people'
import { hintsFor } from './hints'
import { cleanupTranscript } from './cleanup'

/**
 * The language to write in and who was on the call.
 *
 * Language: the profile's fixed choice if set, otherwise the language AssemblyAI heard.
 * Attendees: the user plus the people they tagged, which the notes treat as the full list.
 */
async function notesContext(email: string, session: PenSession): Promise<{ language: string | null; attendees?: { name: string; me?: boolean }[] }> {
  const [profile, onCall] = await Promise.all([
    getProfile(email).catch(() => ({}) as Awaited<ReturnType<typeof getProfile>>),
    peopleOnSession(email, session.id).catch(() => []),
  ])
  const language = languageName(profile.notesLanguage) ?? languageName(session.language) ?? null
  if (!onCall.length) return { language }
  return {
    language,
    attendees: [{ name: profile.name?.trim() || 'The user', me: true }, ...onCall.map((p) => ({ name: p.name }))],
  }
}

/** Held while extraction runs, so a second caller sees the row is taken. */
export const STATUS_WORKING = 'noting'

export type NotesResult = {
  session: PenSession | null
  category: { value: string | null; confidence: number | null; alternatives: string[] }
}

/**
 * The transcript as the model reads it: names instead of "Speaker A" where known, and the
 * user's corrections (and the clean-up pass's) applied. Before this the notes were written
 * from the raw transcript, so a fixed name stayed wrong in the notes.
 */
export function dialogueOf(session: PenSession): string {
  const u = session.transcript?.utterances ?? []
  if (!u.length) return toDialogue({ id: session.aai_id ?? '', status: 'completed', ...session.transcript })
  return namedDialogue(u, session.speaker_map as SpeakerMap | null, session.transcript_edits).slice(0, 400000)
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
  const { email, forceType } = opts
  let session = opts.session

  if (opts.claim) {
    const won = await claimStatus(session.id, 'transcribed', STATUS_WORKING)
    if (!won) return 'taken'
  }

  // The clean-up pass, once per recording, before the first notes: fixes plain mishearings
  // into the edit overlay. Skipped when anything is already in the overlay (the user has been
  // correcting it) and on manual re-runs. Never blocks the notes if it fails.
  // Imported text is someone else's transcript, not ours to second-guess, and skipping the
  // pass keeps an import at the cost of the notes alone.
  if (opts.claim && session.source_channel !== 'import' && !Object.keys(session.transcript_edits ?? {}).length && session.transcript?.utterances?.length) {
    try {
      const h = await hintsFor(email, session.id)
      const edits = await cleanupTranscript(session.transcript.utterances, { vocabulary: h.keyterms ?? [], context: h.context })
      if (Object.keys(edits).length) {
        await updateSession(session.id, { transcript_edits: edits })
        session = { ...session, transcript_edits: edits }
      }
    } catch (e) {
      console.warn(`pen: clean-up skipped for ${session.id}: ${(e as Error).message}`)
    }
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

    // A joined meeting hands the model what each part's own notes already found, so the tail
    // of a 73-minute transcript cannot be quietly compressed away. See extract.ts.
    const partNotes = session.merge_group
      ? (await groupSessions(email, session.merge_group)).map((x) => x.notes).filter((x) => x && Object.keys(x).length)
      : undefined

    const { language, attendees } = await notesContext(email, session)
    const notes = await extractNotes(dialogue, {
      category: category || null,
      priorProfile: prior,
      agent: await briefFor(email),
      language,
      attendees,
      ...(partNotes && partNotes.length > 1 ? { partNotes } : {}),
    })
    // The transcript marks the user as "Name (the user)" for the model; keep that out of the notes.
    for (const p of notes.people ?? []) if (p.speaker) p.speaker = p.speaker.replace(/\s*\(the user\)\s*$/i, '')
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
