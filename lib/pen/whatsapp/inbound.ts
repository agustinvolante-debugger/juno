// What the bot does with a message that isn't text, a file, a photo or a button (18 Oct: a ❤️ on
// one of Juno's messages got "I can read recordings, voice notes, photos and text messages…").
// Pure, for tests (.pentest/inbound-test.mts); bot.ts does the talking.
//
//   reaction     silent. Except 👍 (any skin tone), ✅, ☑️, ✔️ or 👌 on the very message that asked
//                the question waiting for a yes (confirm.ts Pending: an askConfirm question or
//                "still in Santiago?"): that is the yes, and runs exactly like typing "yes".
//   location     the time zone where the pin is (tz-lookup, offline), as if the user had said it.
//   contacts     Juno offers to save the card(s); one yes saves them all.
//   other        silent (stickers, system notices, edits, deletions, unknown types), except media
//                the user clearly meant Juno to read but it can't (a video note, a view-once
//                photo, a file that came without its contents): "I can read…", once a day at most.

import tzLookup from '@photostructure/tz-lookup'
import type { ContactCard, Inbound } from './vonage'
import type { Pending } from './confirm'
import { validZone } from '../timezone'

export type Route = 'yes' | 'silent' | 'location' | 'contacts' | 'cant_read' | 'normal'

/** A reaction that means yes. Skin tones and the text-style variation selector are allowed. */
const YES_EMOJI = /^(?:👍|👌)[\u{1F3FB}-\u{1F3FF}]?️?$|^(?:✅|☑️?|✔️?)$/u

export function isYesEmoji(emoji: string): boolean {
  return YES_EMOJI.test(emoji.trim())
}

const squash = (s: string) => s.normalize('NFC').replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Whether a reaction is on the message that asked. By id when the provider gives one (Meta always
 * does); else (an iMessage tapback that came as 'Liked “…”') by the quoted text, which Apple may
 * cut short with "…": it must be at least 12 characters and appear in what Juno sent.
 */
export function onAskingMessage(r: NonNullable<Inbound['reaction']>, p: Pick<Pending, 'outIds' | 'outText'> | null): boolean {
  if (!p) return false
  if (r.to) return (p.outIds ?? []).includes(r.to)
  const q = squash((r.quoted ?? '').replace(/(…|\.\.\.)$/, ''))
  return q.length >= 12 && !!p.outText && squash(p.outText).includes(q)
}

/** Media sent to be read that Juno can't: the one kind of 'other' that gets an answer. */
const CANT_READ = /^(video|audio|voice|document|image|gif|unsupported:(video_note|ptv|view_once|gif|animated|media|video|audio|image|document))$/

export function route(msg: Pick<Inbound, 'kind' | 'reaction' | 'otherType'>, pending: Pick<Pending, 'outIds' | 'outText'> | null): Route {
  switch (msg.kind) {
    case 'reaction':
      return msg.reaction && isYesEmoji(msg.reaction.emoji) && onAskingMessage(msg.reaction, pending) ? 'yes' : 'silent'
    case 'location':
      return 'location'
    case 'contacts':
      return 'contacts'
    case 'other':
      return CANT_READ.test(msg.otherType ?? '') ? 'cant_read' : 'silent'
    default:
      return 'normal'
  }
}

/** The IANA zone at a point, or null (an invalid point, or a zone the app can't name). */
export function zoneAt(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  try {
    const tz = tzLookup(lat, lng)
    return validZone(tz) ? tz : null
  } catch {
    return null
  }
}

/** "Ana Pérez (+56 9 1234 5678, ana@x.com)": the details the user will see saved. */
export function cardLine(c: ContactCard): string {
  const details = [c.phones[0], c.emails[0], c.company].filter(Boolean)
  return details.length ? `${c.name} (${details.join(', ')})` : c.name
}
