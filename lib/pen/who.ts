// Who was in each recording (22 Oct). Pure, for tests (.pentest/who-unit.mts): no network, no DB.
// lib/pen/who-server.ts reads and writes; app/api/pen/who serves Home's "Who was here?" card.
//
// Three sources say who was on a recording, in order of trust:
//   1. The user: picked at upload (source 'import') or confirmed on the card (source 'user').
//      Final. Nothing below ever adds to, removes from or relabels a list the user made.
//   2. The calendar: the past meeting the recording matches (calendar-match.ts, same scoring and
//      thresholds as the Calendar page) and its guests, minus the user's own addresses. Linked
//      automatically with source 'calendar', once per recording, only when the user has linked
//      nobody, never from more than one event, never from an event with more than 12 guests
//      (a webinar or an all-hands is not "who was on this call").
//   3. The names heard (names.ts): only offered on the card, never linked on their own.
//
// The card's pre-tick rules (whoCandidates):
//   · ticked: a calendar guest; a name someone said about themself ("I'm Pedro") or was
//     introduced by ("this is Pedro"); a name spoken TO someone that is already a contact.
//   · shown, not ticked: a name spoken to someone ("thanks, Pedro") who is not a contact yet.
//   · hidden: names only talked ABOUT ("Pedro said the deal is off"). They are usually people who
//     were not there (a boss, a spouse), and a chip for each one would turn a 5-second question
//     into a list to untick, which older users read as "Juno thinks they were all here".
//   · never: the user's own name, and fillers the transcriber wrote as names (fillerNames).

import { matchRecordings, type MatchEvent, type MatchRecording } from './calendar-match'
import { displayName, namesHeard, type NameMention } from './name-hints'
import { foldName, isSelfName } from './speakers'

/** More guests than this and the event is a webinar or an all-hands: nobody is linked from it. */
export const MAX_GUESTS = 12
/** How far back Home asks. Older recordings are history; the card would only nag. */
export const WHO_DAYS = 21
/** Chips on one card at most: the rest are reachable by typing. */
export const MAX_CHIPS = 8

/** Where a recording's person link came from. 'user' and 'import' are the user's own word. */
export type LinkSource = 'user' | 'import' | 'calendar'
export const userConfirmed = (source: string | null | undefined) => source === 'user' || source === 'import'

/* ------------------------------------------------------------ calendar guests */

export type GuestEvent = Omit<MatchEvent, 'others'> & { others: { email: string; name?: string | null }[] }

/**
 * The one past calendar event this recording was, or null. `recordings` are the recordings around
 * the same time (this one included), so a meeting already better matched by another recording is
 * not claimed twice: matchRecordings pairs best-first, one meeting per recording and vice versa.
 */
export function eventFor(rec: MatchRecording, events: GuestEvent[], recordings: MatchRecording[], now = new Date()): GuestEvent | null {
  const all = recordings.some((r) => r.id === rec.id) ? recordings : [rec, ...recordings]
  const matched = matchRecordings(events, all, now)
  for (const [key, r] of matched) if (r.id === rec.id) return events.find((e) => e.key === key) ?? null
  return null
}

export type Contact = { id: string; name: string; email: string | null }

export type GuestPlan =
  | { skip: 'user-linked' | 'no-event' | 'too-many' | 'no-guests' }
  | { link: string[]; create: { name: string; email: string }[]; skipped: string[] }

/** "chris.park@acme.com" → "Chris Park": a guest the calendar gives no name for. */
export function guestName(g: { email: string; name?: string | null }): string {
  const n = (g.name ?? '').replace(/\s+/g, ' ').trim()
  if (n && !n.includes('@')) return n.slice(0, 120)
  return g.email.split('@')[0].split(/[._+-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 120)
}

/**
 * Which contacts the calendar guests become. By email first (a contact with that address is that
 * person); else by name when the contact with that name has no email yet (it gets this one);
 * else a new contact. A same-name contact with a DIFFERENT email is someone else: that guest is
 * skipped rather than linked to the wrong person or saved as a confusing twin.
 */
export function guestPlan(o: {
  event: GuestEvent | null
  own: Set<string>
  contacts: Contact[]
  /** Sources of the links already on the recording. */
  linked: { personId: string; source: string }[]
}): GuestPlan {
  if (o.linked.some((l) => userConfirmed(l.source))) return { skip: 'user-linked' }
  if (!o.event) return { skip: 'no-event' }
  const seen = new Set<string>()
  const guests = o.event.others
    .map((g) => ({ email: g.email.trim().toLowerCase(), name: g.name ?? null }))
    .filter((g) => g.email.includes('@') && !o.own.has(g.email) && !seen.has(g.email) && seen.add(g.email))
  if (guests.length > MAX_GUESTS) return { skip: 'too-many' }
  if (!guests.length) return { skip: 'no-guests' }
  const byEmail = new Map(o.contacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]))
  const byName = new Map(o.contacts.map((c) => [c.name.trim().toLowerCase(), c]))
  const have = new Set(o.linked.map((l) => l.personId))
  const link: string[] = []
  const create: { name: string; email: string }[] = []
  const skipped: string[] = []
  for (const g of guests) {
    const c = byEmail.get(g.email)
    if (c) { if (!have.has(c.id) && !link.includes(c.id)) link.push(c.id); continue }
    const name = guestName(g)
    if (!name) { skipped.push(g.email); continue }
    const same = byName.get(name.toLowerCase())
    if (same && same.email && same.email.toLowerCase() !== g.email) { skipped.push(g.email); continue }
    if (same) { if (!have.has(same.id) && !link.includes(same.id)) link.push(same.id); continue }
    if (!create.some((x) => x.name.toLowerCase() === name.toLowerCase())) create.push({ name, email: g.email })
  }
  return { link, create, skipped }
}

/* ------------------------------------------------------------ the card */

export type WhoChip = {
  /** Shown as is. */
  name: string
  /** An existing contact, when the chip is one. */
  personId: string | null
  ticked: boolean
  /** Why it is offered: 'calendar' guest, said by 'self', 'introduced', 'called' (spoken to), 'linked' already. */
  why: 'calendar' | 'self' | 'introduced' | 'called' | 'linked'
}

/** Whether Home should ask about this recording. */
export function needsWho(s: {
  status: string
  event_mode?: boolean | null
  merge_index?: number | null
  source_channel?: string | null
  storage_path?: string | null
  recorded_at?: string | null
  created_at: string
  who_at?: string | null
}, links: { source: string }[], now = new Date()): boolean {
  if (s.status !== 'noted' || s.who_at) return false
  if (s.event_mode) return false // an event names its conversations one by one (conference.ts)
  if ((s.merge_index ?? 0) > 0) return false
  if (s.source_channel === 'sample' || String(s.storage_path ?? '').startsWith('sample')) return false
  if (String(s.storage_path ?? '').startsWith('text:')) return false // an imported transcript (Granola, Notion) came with its people
  const when = Date.parse(s.recorded_at ?? s.created_at)
  if (Number.isNaN(when) || now.getTime() - when > WHO_DAYS * 86_400_000) return false
  return !links.some((l) => userConfirmed(l.source))
}

const firstOf = (s: string) => foldName(s).split(/\s+/)[0] ?? ''

/**
 * The chips for one recording. `linked` = the people already on it (calendar guests and any
 * other non-user link), shown ticked under their contact name. A heard name that is a linked
 * person's first name ("Chris" for Chris Park) is that person, not a second chip.
 */
export function whoCandidates(o: {
  mentions: NameMention[]
  me?: string | null
  /** Speaker label per utterance, for filler detection. Omit for a joined meeting. */
  labels?: (string | null)[]
  contacts: Contact[]
  linked: { personId: string; name: string; source: string }[]
}): WhoChip[] {
  const out: WhoChip[] = []
  const taken = new Set<string>()
  for (const l of o.linked) {
    if (taken.has(l.personId)) continue
    taken.add(l.personId)
    out.push({ name: l.name, personId: l.personId, ticked: true, why: l.source === 'calendar' ? 'calendar' : 'linked' })
  }
  const linkedFolds = o.linked.map((l) => ({ full: foldName(l.name), first: firstOf(l.name) }))
  const contactBy = (name: string): Contact | null => {
    const f = foldName(name)
    const exact = o.contacts.find((c) => foldName(c.name) === f)
    if (exact) return exact
    // A first name heard that is exactly one contact's first name: that contact.
    if (f.includes(' ')) return null
    const firsts = o.contacts.filter((c) => firstOf(c.name) === f)
    return firsts.length === 1 ? firsts[0] : null
  }
  for (const h of namesHeard(o.mentions, o.me, o.labels)) {
    if (h.me || isSelfName(h.name, o.me)) continue
    const kinds = new Set(h.moments.map((m) => m.kind))
    const self = kinds.has('self'), intro = kinds.has('introduced'), called = kinds.has('addressed')
    if (!self && !intro && !called) continue // talked about only: hidden (see the top of the file)
    const f = foldName(h.name)
    if (linkedFolds.some((l) => l.full === f || l.first === f)) continue
    const c = contactBy(h.name)
    if (c && taken.has(c.id)) continue
    if (c) taken.add(c.id)
    out.push({
      name: c?.name ?? displayName(h.name),
      personId: c?.id ?? null,
      ticked: self || intro || Boolean(c),
      why: self ? 'self' : intro ? 'introduced' : 'called',
    })
    if (out.length >= MAX_CHIPS) break
  }
  return out.slice(0, MAX_CHIPS)
}

/* ------------------------------------------------------------ saving */

export type Confirmed = { personId?: string | null; name?: string | null }

/**
 * What Save does. Ticked contacts are linked as the user's ('user', replacing a 'calendar' or
 * 'import' label); new names become contacts first. A calendar guest left unticked was not
 * there: that link goes. Links the user made are never removed here: the card only shows while
 * there are none, and a second Save (a double tap, a retry) changes nothing.
 */
export function confirmPlan(picked: Confirmed[], linked: { personId: string; source: string }[], ownedIds: Set<string>): { link: string[]; create: string[]; unlink: string[] } {
  const link: string[] = []
  const create: string[] = []
  for (const p of picked) {
    if (p.personId) {
      if (ownedIds.has(p.personId) && !link.includes(p.personId)) link.push(p.personId)
      continue
    }
    const n = (p.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (n && !create.some((x) => x.toLowerCase() === n.toLowerCase())) create.push(n)
  }
  const unlink = linked.filter((l) => l.source === 'calendar' && !link.includes(l.personId)).map((l) => l.personId)
  return { link, create, unlink }
}

/* ------------------------------------------------------------ at upload */

/**
 * Who each selected file is tagged with (the upload tray, 22 Oct). One file: the "Who was on this
 * call" box. Two or more: each file's own "+ Who", never the box, so one person picked for one
 * recording is not put on all of them.
 */
export function peopleForUploads<P>(picked: { people?: P[] }[], box: P[]): P[][] {
  return picked.length > 1 ? picked.map((p) => p.people ?? []) : picked.map(() => box)
}

/**
 * The tray switching between one file and several. To several: people already in the box go onto
 * every selected file that has none yet (visible there, removable per file) and the box empties.
 * Back to one: that file's people fill an empty box.
 */
export function carryBox<P, F extends { picked: boolean; people?: P[] }>(files: F[], box: P[], wasMulti: boolean): { files: F[]; box: P[] } {
  const multi = files.filter((f) => f.picked).length > 1
  if (multi && !wasMulti && box.length) return { files: files.map((f) => (f.picked && !f.people?.length ? { ...f, people: box } : f)), box: [] }
  if (!multi && wasMulti && !box.length) {
    const one = files.find((f) => f.picked)
    if (one?.people?.length) return { files, box: one.people }
  }
  return { files, box }
}
