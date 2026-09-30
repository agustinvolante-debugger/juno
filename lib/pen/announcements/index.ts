// "What's new" emails, one file per announcement, registered below.
//
// Sent only by hand (scripts/pen-announce.mts): a test to the founder first, then everyone, and
// only for a batch of features worth an email. The point is not to spam; most releases get none.
//
// To add one: copy the shape below into a new file (e.g. 2026-10-14-today.ts), write all three
// languages, add it to ANNOUNCEMENTS, then run the script with --test.
//
//   export default {
//     slug: '2026-10-14-today',
//     subject: { en: '...', es: '...', pt: '...' },
//     intro: { en: '...', es: '...', pt: '...' },
//     items: [{ title: { en, es, pt }, body: { en, es, pt } }],
//   } satisfies Announcement

import type { Lang } from '../currency'

type L = Record<Lang, string>
export type Announcement = {
  /** Unique and permanent: the send log is keyed by it, so reusing a slug skips everyone. */
  slug: string
  subject: L
  intro: L
  items: { title: L; body: L }[]
  /** Optional button; defaults to opening the app. */
  cta?: { label: L; path?: string }
}

export const ANNOUNCEMENTS: Announcement[] = []

export function findAnnouncement(slug: string): Announcement | undefined {
  return ANNOUNCEMENTS.find((a) => a.slug === slug)
}
