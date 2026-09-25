// What the transcriber is told before it listens.
//
// AssemblyAI's model is already its best one; what it lacks is context. The names of the
// people on the call, the user's own vocabulary, which languages to expect and roughly what
// the conversation is. Measured cost on top of transcription: keyterms $0.05/h, prompt
// $0.05/h, speaker identification $0.02/h (AssemblyAI pricing, 24 Sep 2026).

import type { SubmitHints } from './aai'
import { getProfile } from './profile'
import { roleOf } from './profile-fields'
import { listPeople, peopleOnSession } from './people'

/** AssemblyAI's cap is 1,000 terms of at most 6 words; far fewer keeps each one weighty. */
const MAX_TERMS = 150
const MAX_WORDS = 6

function terms(list: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const t = (raw ?? '').replace(/\s+/g, ' ').trim()
    if (!t || t.split(' ').length > MAX_WORDS || t.length > 60) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= MAX_TERMS) break
  }
  return out
}

export async function hintsFor(email: string, sessionId: string): Promise<SubmitHints> {
  const [profile, onCall, contacts] = await Promise.all([
    getProfile(email).catch(() => ({}) as Awaited<ReturnType<typeof getProfile>>),
    peopleOnSession(email, sessionId).catch(() => []),
    listPeople(email).catch(() => []),
  ])
  const role = roleOf(profile.role)
  const me = profile.name?.trim() || null

  // People on this call first, so the cap never drops them; then the user's own vocabulary,
  // then everyone they have recorded before.
  const vocab = (profile.vocabulary ?? '').split(/\n|,/)
  const keyterms = terms([me, profile.org, ...onCall.map((p) => p.name), ...vocab, ...contacts.map((c) => c.name)])

  // One or two plain sentences about the audio. AssemblyAI ignores instructions here, so it
  // describes the conversation rather than telling the model what to do.
  const parts: string[] = []
  const who = [me, ...onCall.map((p) => p.name)].filter(Boolean)
  if (role && role.value !== 'other') parts.push(`A recorded conversation involving someone who works in ${role.title.toLowerCase()}${profile.org ? ` at ${profile.org}` : ''}.`)
  if (who.length > 1) parts.push(`Speakers include ${who.join(', ')}.`)
  const context = parts.join(' ') || undefined

  // Who was there, when the user said. They plus the people they tagged; one extra allowed,
  // because people forget to tag someone. Nothing tagged means nothing is assumed.
  const speakers = onCall.length ? { min: onCall.length + 1, max: onCall.length + 2 } : undefined

  // Speaker identification needs names for everyone it is to tell apart, the user included.
  const names = onCall.length
    ? [
        { name: me || 'The user', description: `The person recording${role && role.value !== 'other' ? `, who works in ${role.title.toLowerCase()}` : ''}.` },
        ...onCall.map((p) => ({
          name: p.name,
          ...(p.about || p.role ? { description: [p.about, p.role].filter(Boolean).join('. ').slice(0, 200) } : {}),
        })),
      ]
    : undefined

  return {
    keyterms: keyterms.length ? keyterms : undefined,
    context,
    languages: profile.languages?.length ? profile.languages : undefined,
    speakers,
    names,
  }
}
