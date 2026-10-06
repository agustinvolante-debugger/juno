// A transcript that arrives as text, turned into a recording with notes, search and people.
// Shared by "Import a transcript" (pasted text or a file) and "Import from Notion" (a Notion
// AI Meeting Note's transcript). Nothing is transcribed, so an import only costs the notes.

import { after } from 'next/server'
import { createSession, getSession, updateSession } from './store'
import { parseTranscript } from './transcript-import'
import { linkPerson, ownedPeople, upsertByName, peopleOnSession, enrichPerson } from './people'
import { getProfile } from './profile'
import { isSelfName, type SpeakerMap } from './speakers'
import { writeNotes } from './pipeline'

/** Roughly eight hours of speech. A guard against a pasted book, not a budget. */
export const MAX_CHARS = 400_000

export type ImportOpts = {
  text: string
  title?: string | null
  sourceName: string
  people?: { id?: unknown; name?: unknown }[]
  /** When it was recorded, if the source knows (Notion does). Default: now. */
  recordedAt?: string | null
  /** Real length, if the source knows. Default: estimated from the words. */
  durationSec?: number | null
  /** Where it came from, e.g. 'text:notion:<block id>', which is also how a repeat is spotted. */
  storagePath?: string
  /** Runs once the notes are written (e.g. send them on to Notion). Never throws. */
  afterNotes?: (session: NonNullable<Awaited<ReturnType<typeof getSession>>>) => Promise<void>
}

export async function importText(email: string, o: ImportOpts): Promise<{ id: string; turns: number; speakers: string[] }> {
  const parsed = parseTranscript(o.text)
  if (!parsed.utterances.length) throw Object.assign(new Error('No text found in that transcript.'), { status: 400 })
  const durationSec = o.durationSec && o.durationSec > 0 ? Math.round(o.durationSec) : parsed.estSec || null

  const { session } = await createSession({
    user_email: email,
    storage_path: o.storagePath ?? 'text:import',
    source_name: o.sourceName,
    mime: 'text/plain',
    bytes: o.text.length,
    duration_sec: durationSec,
    recorded_at: o.recordedAt ?? new Date().toISOString(),
    consent: true,
    title: o.title ?? null,
    source_channel: 'import',
  })

  // People picked in the dialog, plus names the transcript itself gives its speakers.
  const picked = (o.people ?? []).slice(0, 12)
  try {
    const known = await ownedPeople(email, picked.flatMap((p) => (typeof p?.id === 'string' ? [p.id] : [])))
    for (const p of known) await linkPerson(email, session.id, p.id, 'import')
    for (const p of picked) {
      if (typeof p?.id !== 'string' && typeof p?.name === 'string' && p.name.trim()) {
        const person = await upsertByName(email, p.name)
        await linkPerson(email, session.id, person.id, 'import')
      }
    }
  } catch (e) {
    console.warn(`pen: import could not link people to ${session.id}: ${(e as Error).message}`)
  }

  // Speaker names from the text: the user, a linked contact, or just the name as written.
  const profile = await getProfile(email).catch(() => ({ name: undefined }))
  const onCall = await peopleOnSession(email, session.id).catch(() => [])
  const speakerMap: SpeakerMap = {}
  for (const [labelKey, name] of Object.entries(parsed.names)) {
    if (isSelfName(name, profile.name)) {
      speakerMap[labelKey] = { name: profile.name?.trim() || 'You', me: true, source: 'auto' }
      continue
    }
    const person = onCall.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
    speakerMap[labelKey] = { name: person?.name ?? name, person_id: person?.id ?? null, source: 'auto' }
  }

  await updateSession(session.id, {
    status: 'transcribed',
    transcript: { text: parsed.utterances.map((u) => u.text).join(' '), utterances: parsed.utterances },
    ...(Object.keys(speakerMap).length ? { speaker_map: speakerMap } : {}),
    metered_at: new Date().toISOString(),
    metered_sec: durationSec ?? parsed.estSec,
  })

  // Notes take about a minute on a long transcript: after the response.
  after(async () => {
    try {
      const fresh = await getSession(email, session.id)
      if (!fresh) return
      const r = await writeNotes({ email, session: fresh, claim: true })
      if (r === 'taken' || !r.session) return
      const people = await peopleOnSession(email, session.id).catch(() => [])
      await Promise.all(people.map((p) => enrichPerson(email, p.id).catch(() => {})))
      if (o.afterNotes) await o.afterNotes(r.session).catch(() => {})
    } catch (e) {
      console.warn(`pen: import notes failed for ${session.id}: ${(e as Error).message}`)
    }
  })

  return { id: session.id, turns: parsed.utterances.length, speakers: Object.values(parsed.names) }
}
