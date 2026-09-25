import { NextResponse, after } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { createSession, getSession, updateSession } from '@/lib/pen/store'
import { getAllowance } from '@/lib/pen/allowance'
import { parseTranscript } from '@/lib/pen/transcript-import'
import { linkPerson, ownedPeople, upsertByName, peopleOnSession, enrichPerson } from '@/lib/pen/people'
import { getProfile } from '@/lib/pen/profile'
import { isSelfName, type SpeakerMap } from '@/lib/pen/speakers'
import { writeNotes } from '@/lib/pen/pipeline'

export const dynamic = 'force-dynamic'
// Notes are written in after(): about a minute on a long transcript.
export const maxDuration = 300

/** Roughly eight hours of speech. A guard against a pasted book, not a budget. */
const MAX_CHARS = 400_000

// "Import a transcript": text from another recorder (Pocket's free plan exports text only,
// Otter, Plaud) or a subtitle file, turned into a recording with notes, search and people.
// Nothing is transcribed, so an import costs only the notes.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const text = typeof b.text === 'string' ? b.text : ''
  if (!text.trim()) return NextResponse.json({ error: 'Paste a transcript or choose a file.' }, { status: 400 })
  if (text.length > MAX_CHARS) return NextResponse.json({ error: 'That transcript is too long to import in one go. Split it into parts.' }, { status: 400 })
  // Same rule as a recording: the people in it agreed to being recorded.
  if (b.consent !== true) return NextResponse.json({ error: 'Confirm that everyone agreed to be recorded.' }, { status: 400 })

  const parsed = parseTranscript(text)
  if (!parsed.utterances.length) return NextResponse.json({ error: 'No text found in that transcript.' }, { status: 400 })

  const allowance = await getAllowance(email)
  if (!allowance.canProcess) return NextResponse.json({ error: 'You have no recording hours left this month.' }, { status: 402 })

  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 90) : null
  const sourceName = typeof b.source_name === 'string' && b.source_name.trim() ? b.source_name.trim().slice(0, 200) : `Imported transcript ${new Date().toISOString().slice(0, 10)}`

  const { session } = await createSession({
    user_email: email,
    storage_path: 'text:import',
    source_name: sourceName,
    mime: 'text/plain',
    bytes: text.length,
    duration_sec: parsed.estSec || null,
    recorded_at: new Date().toISOString(),
    consent: true,
    title,
    source_channel: 'import',
  })

  // People picked in the dialog, plus names the transcript itself gives its speakers.
  const picked = Array.isArray(b.people) ? (b.people as { id?: unknown; name?: unknown }[]).slice(0, 12) : []
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
    metered_sec: parsed.estSec,
  })

  after(async () => {
    try {
      const fresh = await getSession(email, session.id)
      if (!fresh) return
      const r = await writeNotes({ email, session: fresh, claim: true })
      if (r === 'taken' || !r.session) return
      const people = await peopleOnSession(email, session.id).catch(() => [])
      await Promise.all(people.map((p) => enrichPerson(email, p.id).catch(() => {})))
    } catch (e) {
      console.warn(`pen: import notes failed for ${session.id}: ${(e as Error).message}`)
    }
  })

  return NextResponse.json({ id: session.id, turns: parsed.utterances.length, speakers: Object.values(parsed.names) })
}
