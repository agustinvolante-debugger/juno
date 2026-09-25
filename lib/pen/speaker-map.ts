// Turns AssemblyAI's label -> name mapping into a SpeakerMap tied to real contacts.

import { getProfile } from './profile'
import { peopleOnSession } from './people'
import type { SpeakerMap } from './speakers'

export async function autoSpeakerMap(email: string, sessionId: string, names: Record<string, string>): Promise<SpeakerMap | null> {
  if (!Object.keys(names).length) return null
  const [profile, onCall] = await Promise.all([
    getProfile(email).catch(() => ({ name: undefined })),
    peopleOnSession(email, sessionId).catch(() => []),
  ])
  const me = (profile.name ?? '').trim().toLowerCase()
  const map: SpeakerMap = {}
  for (const [label, name] of Object.entries(names)) {
    const n = name.trim().toLowerCase()
    // 'The user' is what hints.ts sends when the profile has no name.
    if (n === 'the user' || (me && n === me)) {
      map[label] = { name: profile.name?.trim() || 'You', me: true, source: 'auto' }
      continue
    }
    const person = onCall.find((p) => p.name.trim().toLowerCase() === n)
    map[label] = { name: person?.name ?? name, person_id: person?.id ?? null, source: 'auto' }
  }
  return map
}
