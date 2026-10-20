// Search like a person (20 Oct): when a search finds nothing, relax it step by step BEFORE asking
// the user. Pure, for tests (.pentest/search-unit.mts); the tools (whatsapp/tools/mailread.ts,
// whatsapp/tools/meetings.ts) run the rungs in order and stop at the first that finds something.
//
//   exact        what was asked, as asked
//   person       the person as every name/address Juno knows for them (person-match.ts)
//   anywhere     that person as sender OR recipient, subject/word filters dropped
//   wider_dates  the same, over a wider window
//   invites      calendar invitations with that person (an .ics, an "Invitation:" subject)

import type { SearchAsk } from './mail-thread'
import { buildQuery } from './mail-thread'
import type { PersonVariants } from './person-match'

export type MailIn = {
  from?: string
  to?: string
  subject?: string
  words?: string
  unread?: boolean
  afterEpoch?: number
  beforeEpoch?: number
  newerThanDays?: number
}

export type Rung = { step: 'exact' | 'person' | 'anywhere' | 'wider_dates' | 'invites'; ask: SearchAsk; q: string }

/** Every way to say the person in a search: addresses first (most precise), then full names, then single words. */
export function personTerms(v: PersonVariants | null | undefined, said: string): string[] {
  if (!v) return said.trim() ? [said.trim()] : []
  return [...new Set([...v.emails, ...v.names, ...v.words, ...(said.trim() ? [said.trim()] : [])])].slice(0, 12)
}

const DAY_S = 86_400

/**
 * The rungs for a mail search, deduplicated (a rung that builds the same query as an earlier one
 * is skipped). `fromV`/`toV`: the resolved person for the from/to the user named, if any.
 */
export function mailLadder(a: MailIn, fromV?: PersonVariants | null, toV?: PersonVariants | null, nowS = Math.floor(Date.now() / 1000)): Rung[] {
  const base: SearchAsk = { from: a.from, to: a.to, subject: a.subject, words: a.words, unread: a.unread, afterEpoch: a.afterEpoch, beforeEpoch: a.beforeEpoch, newerThanDays: a.newerThanDays }
  const rungs: Omit<Rung, 'q'>[] = [{ step: 'exact', ask: base }]
  const fromT = a.from?.trim() ? personTerms(fromV, a.from) : []
  const toT = a.to?.trim() ? personTerms(toV, a.to) : []
  const person = [...new Set([...fromT, ...toT])]
  const dates = { afterEpoch: a.afterEpoch, beforeEpoch: a.beforeEpoch, newerThanDays: a.newerThanDays }
  if (person.length) {
    rungs.push({ step: 'person', ask: { ...base, from: undefined, to: undefined, fromAny: fromT.length ? fromT : undefined, toAny: toT.length ? toT : undefined } })
    rungs.push({ step: 'anywhere', ask: { unread: a.unread, personAny: person, ...dates } })
  } else if (a.subject?.trim()) {
    // Only words to go on: the subject's words anywhere in the message.
    rungs.push({ step: 'anywhere', ask: { unread: a.unread, words: [a.subject, a.words].filter(Boolean).join(' '), ...dates } })
  }
  const hadDates = Boolean(a.afterEpoch || a.beforeEpoch || a.newerThanDays)
  const last = rungs[rungs.length - 1].ask
  if (hadDates) {
    const wider: SearchAsk = { ...last, beforeEpoch: undefined }
    if (a.afterEpoch) wider.afterEpoch = Math.min(a.afterEpoch, nowS) - 14 * DAY_S
    else wider.newerThanDays = Math.min(90, Math.max(30, (a.newerThanDays ?? 0) * 4))
    rungs.push({ step: 'wider_dates', ask: wider })
  }
  if (person.length || a.words?.trim() || a.subject?.trim()) {
    rungs.push({
      step: 'invites',
      ask: person.length
        ? { personAny: person, invites: true, newerThanDays: 45 }
        : { words: [a.subject, a.words].filter(Boolean).join(' '), invites: true, newerThanDays: 45 },
    })
  }
  const seen = new Set<string>()
  const out: Rung[] = []
  for (const r of rungs) {
    const q = buildQuery(r.ask)
    if (seen.has(q)) continue
    seen.add(q)
    out.push({ ...r, q })
  }
  return out
}

/** The windows a calendar search tries, in order: the day(s) asked, a day either side, the next/last two weeks. */
export function calendarWindows(from: Date, to: Date, now = new Date()): { step: 'asked' | 'around' | 'weeks'; from: Date; to: Date }[] {
  const D = 86_400_000
  const out: { step: 'asked' | 'around' | 'weeks'; from: Date; to: Date }[] = [{ step: 'asked', from, to }]
  out.push({ step: 'around', from: new Date(from.getTime() - D), to: new Date(to.getTime() + D) })
  const wFrom = new Date(Math.min(from.getTime() - D, now.getTime() - 7 * D))
  const wTo = new Date(Math.max(to.getTime() + D, now.getTime() + 21 * D))
  out.push({ step: 'weeks', from: wFrom, to: wTo })
  return out
}
