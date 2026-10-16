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
/** An image in the email. `src` is a path under public/ (e.g. /email/x.png), one per language
 *  or shared; width/height are the displayed size (the file itself is 2x). */
export type AnnounceImage = { src: string | L; alt: L; width: number; height: number | Record<Lang, number> }
export type Announcement = {
  /** Unique and permanent: the send log is keyed by it, so reusing a slug skips everyone. */
  slug: string
  subject: L
  intro: L
  items: { title: L; body: L; image?: AnnounceImage }[]
  /** Optional button; defaults to opening the app. Ignored when `ctaByLink` is set. */
  cta?: { label: L; path?: string }
  /** "Hi Carlos," above the intro, from the person's name (profile, then signup, then account).
   *  'inline' puts it at the start of the intro sentence instead of on its own line. */
  greet?: boolean | 'inline'
  /** The logo at the top (a hosted image, since email can't load the landing's web font). */
  brand?: AnnounceImage
  /** The big line at the top; defaults to the subject. */
  headline?: L
  /** Appended to the intro for people with no WhatsApp or iMessage linked. */
  introUnlinked?: L
  /** One button, picked per person: open the chat they use (WhatsApp, or iMessage when that's
   *  where they last wrote), or link WhatsApp first. Replaces `cta`. */
  ctaByLink?: { whatsapp: L; imessage: L; unlinked: L; unlinkedPath: string }
  /** A short footer line before Unsubscribe (replaces the "why you're getting this" line). */
  footer?: L
  /** A personal closing after the items, e.g. "Reply with anything… — Agustin". */
  signoff?: L
  /** Sender shown in the inbox, at the sending domain (Reply-To stays the support inbox). */
  from?: string
}

import smarter from './2026-10-16-smarter'
import followUp from './2026-10-16-follow-up'

export const ANNOUNCEMENTS: Announcement[] = [smarter, followUp]

export function findAnnouncement(slug: string): Announcement | undefined {
  return ANNOUNCEMENTS.find((a) => a.slug === slug)
}
