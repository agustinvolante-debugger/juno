// Who was in each recording: the reads and writes (22 Oct). The rules are in lib/pen/who.ts.
//
//   · linkCalendarGuests: after a recording's notes are written (unattended.ts), the guests of the
//     past calendar event it matches become people on it, source 'calendar'. Read live from the
//     calendar, nothing stored from it but the people. Once per recording (pen_sessions.cal_people_at).
//   · whoCards: Home's "Who was here?" cards and the review after a multi-file upload.
//   · confirmWho / skipWho: the card's Save and Skip (pen_sessions.who_at).
//
// Both columns come from the 2026-10-22 ALTERs in schema.sql. Until they run: the calendar step
// still runs once (it is only ever called once per recording, and skips when a 'calendar' link
// exists), Save still works (the user's links are what hide the card), and Skip answers
// stored: false so the browser hides the card on that device only.

import { supabaseAdmin } from '@/lib/supabase'
import { isMissingSchema } from './allowance'
import { getProfile } from './profile'
import { mentionsFor } from './names'
import { linkPerson, unlinkPerson, upsertByName } from './people'
import { recordingSpan, type MatchRecording } from './calendar-match'
import { confirmPlan, eventFor, guestPlan, needsWho, whoCandidates, WHO_DAYS, type Confirmed, type Contact, type GuestEvent, type WhoChip } from './who'
import type { NameMention } from './name-hints'

const HOUR = 3_600_000
const UUID = /^[0-9a-f-]{36}$/i

type LinkRow = { session_id: string; person_id: string; source: string; pen_people: { id: string; name: string; email: string | null } | null }

async function linksFor(email: string, ids: string[]): Promise<LinkRow[]> {
  if (!ids.length) return []
  const { data, error } = await supabaseAdmin
    .from('pen_session_people').select('session_id,person_id,source,pen_people(id,name,email)').eq('user_email', email).in('session_id', ids)
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as unknown as LinkRow[]
}

async function contactsOf(email: string): Promise<Contact[]> {
  const { data, error } = await supabaseAdmin.from('pen_people').select('id,name,email').eq('user_email', email)
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as Contact[]
}

/** Sets a 2026-10-22 column; false when the ALTER hasn't run yet (or the write failed). */
async function stamp(email: string, id: string, col: 'who_at' | 'cal_people_at'): Promise<boolean> {
  const { error } = await supabaseAdmin.from('pen_sessions').update({ [col]: new Date().toISOString() }).eq('user_email', email).eq('id', id)
  if (error && !isMissingSchema(error.message)) console.warn(`pen who: ${col} for ${id}: ${error.message}`)
  return !error
}

/* ------------------------------------------------------------ calendar guests */

export type GuestOutcome = { linked: number; created: number; reason?: string }

/**
 * The matching calendar event's guests → people on the recording. Best effort and never throws:
 * it runs with nobody watching, and a calendar that is down must not cost the notes or the email.
 */
/** What linkCalendarGuests reads, replaceable in tests (.pentest/who-unit.mts). */
export type GuestDeps = {
  listCalendars: (email: string) => Promise<{ key: string; address: string | null; broken?: boolean }[]>
  eventsBetween: (email: string, from: Date, to: Date) => Promise<{ events: { id: string; cal?: string | null; title: string; start: string; end: string | null; allDay: boolean; declined: boolean; others: { email: string; name: string | null }[] }[]; failed: string[] }>
  ownAddresses: (email: string) => Promise<Set<string>>
  recordingsIn: (email: string, from: Date, to: Date) => Promise<MatchRecording[]>
}

async function realDeps(): Promise<GuestDeps> {
  const c = await import('./calendars')
  const { recordingsIn } = await import('./calendar-server')
  let cals: Awaited<ReturnType<typeof c.listCalendars>> | null = null
  return {
    listCalendars: async (e) => (cals = await c.listCalendars(e)),
    eventsBetween: (e, f, t) => c.eventsBetween(e, f, t, undefined, { max: 60, ...(cals ? { cals } : {}) }),
    ownAddresses: (e) => c.ownAddressesOf(e, cals ?? undefined),
    recordingsIn,
  }
}

export async function linkCalendarGuests(email: string, sessionId: string, now = new Date(), deps?: GuestDeps): Promise<GuestOutcome> {
  try {
    const { data: s } = await supabaseAdmin.from('pen_sessions').select('*').eq('user_email', email).eq('id', sessionId).maybeSingle()
    const row = s as (Record<string, unknown> & { id: string; title: string | null; source_name: string | null; recorded_at: string | null; duration_sec: number | null; event_mode?: boolean; cal_people_at?: string | null; source_channel?: string | null; storage_path?: string | null }) | null
    if (!row?.recorded_at) return { linked: 0, created: 0, reason: 'no time' }
    if (row.cal_people_at) return { linked: 0, created: 0, reason: 'done before' }
    if (row.event_mode || row.source_channel === 'sample' || String(row.storage_path ?? '').startsWith('sample')) return { linked: 0, created: 0, reason: 'not a meeting' }
    const links = await linksFor(email, [row.id])
    if (links.some((l) => l.source === 'calendar')) return { linked: 0, created: 0, reason: 'done before' }

    const d = deps ?? (await realDeps())
    const cals = (await d.listCalendars(email).catch(() => [])).filter((c) => !c.broken)
    if (!cals.length) return { linked: 0, created: 0, reason: 'no calendar' }

    const rec: MatchRecording = { id: row.id, title: row.title ?? row.source_name ?? '', recordedAt: row.recorded_at, durationSec: row.duration_sec, emails: links.flatMap((l) => (l.pen_people?.email ? [l.pen_people.email.toLowerCase()] : [])) }
    const span = recordingSpan(rec)
    if (!span) return { linked: 0, created: 0, reason: 'no time' }
    const from = new Date(span[0] - 3 * HOUR), to = new Date(span[1] + 3 * HOUR)
    const [read, around, own, contacts] = await Promise.all([
      d.eventsBetween(email, from, to),
      d.recordingsIn(email, from, to).catch(() => [] as MatchRecording[]),
      d.ownAddresses(email),
      contactsOf(email),
    ])
    const events: GuestEvent[] = read.events.map((e) => ({ key: `${e.id}|${e.cal ?? ''}`, title: e.title, start: e.start, end: e.end, allDay: e.allDay, declined: e.declined, others: e.others }))
    const plan = guestPlan({ event: eventFor(rec, events, around, now), own, contacts, linked: links.map((l) => ({ personId: l.person_id, source: l.source })) })
    if ('skip' in plan) {
      // The event was read and judged: don't ask again. A calendar that failed to read might
      // have had the event, so that one isn't stamped.
      if (plan.skip !== 'no-event' || !read.failed.length) await stamp(email, row.id, 'cal_people_at')
      return { linked: 0, created: 0, reason: plan.skip }
    }
    let created = 0
    for (const id of plan.link) await linkPerson(email, row.id, id, 'calendar')
    for (const g of plan.create) {
      const p = await upsertByName(email, g.name, g.email)
      await linkPerson(email, row.id, p.id, 'calendar')
      created++
    }
    await stamp(email, row.id, 'cal_people_at')
    return { linked: plan.link.length + created, created }
  } catch (e) {
    console.warn(`pen who: calendar guests for ${sessionId}: ${(e as Error).message}`)
    return { linked: 0, created: 0, reason: 'failed' }
  }
}

/* ------------------------------------------------------------ the cards */

export type WhoCard = {
  id: string
  title: string
  /** ISO, when it was recorded. */
  when: string
  durationSec: number | null
  /** Still being transcribed or written up: no names yet, people can still be added. */
  pending: boolean
  /** Already has people the user gave (the review after an upload shows it as done). */
  confirmed: boolean
  chips: WhoChip[]
}

type SessRow = {
  id: string; title: string | null; source_name: string | null; status: string; recorded_at: string | null; created_at: string
  duration_sec: number | null; event_mode?: boolean | null; merge_group: string | null; merge_index: number | null
  source_channel?: string | null; storage_path?: string | null; who_at?: string | null
  transcript?: { utterances?: { speaker: string }[] } | null
}

/** The most cards Home is sent. It shows five, and "Review all" the rest. */
const MAX_CARDS = 12

/**
 * Cards for Home (no ids: recent recordings that need asking, newest first) or for the review
 * after an upload (ids: those recordings, whatever their state, in the order given).
 */
export async function whoCards(email: string, ids?: string[], now = new Date()): Promise<{ cards: WhoCard[]; total: number }> {
  const want = ids ? Array.from(new Set(ids.filter((x) => UUID.test(x)))).slice(0, 40) : null
  // Light first: the transcripts are read below only for the few that make it onto a card.
  let q = supabaseAdmin.from('pen_sessions').select('id,title,source_name,status,recorded_at,created_at,duration_sec,merge_group,merge_index,source_channel,storage_path').eq('user_email', email)
  q = want ? q.in('id', want) : q.eq('status', 'noted').gte('created_at', new Date(now.getTime() - WHO_DAYS * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(60)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  let rows = (data ?? []) as SessRow[]
  if (!rows.length) return { cards: [], total: 0 }
  // The optional columns, tolerant of the 2026-10-22 ALTER not having run yet.
  const rid = rows.map((r) => r.id)
  let opt: { data: unknown[] | null; error: unknown } = await supabaseAdmin.from('pen_sessions').select('id,event_mode,who_at').eq('user_email', email).in('id', rid)
  if (opt.error) opt = await supabaseAdmin.from('pen_sessions').select('id,event_mode').eq('user_email', email).in('id', rid)
  const optBy = new Map(((opt.data ?? []) as Partial<SessRow>[]).map((r) => [r.id, r]))
  rows = rows.map((r) => ({ ...r, ...(optBy.get(r.id) ?? {}) }))

  const links = await linksFor(email, rows.map((r) => r.id))
  const linksOf = (id: string) => links.filter((l) => l.session_id === id)
  let chosen = want
    ? want.flatMap((id) => rows.filter((r) => r.id === id && (r.merge_index ?? 0) === 0))
    : rows.filter((r) => needsWho(r, linksOf(r.id), now))
  const total = chosen.length
  chosen = chosen.slice(0, MAX_CARDS)
  if (!chosen.length) return { cards: [], total }
  // The transcripts (speaker labels) only for the few on a card.
  const { data: tx } = await supabaseAdmin.from('pen_sessions').select('id,transcript').eq('user_email', email).in('id', chosen.map((r) => r.id))
  const txBy = new Map(((tx ?? []) as { id: string; transcript: SessRow['transcript'] }[]).map((r) => [r.id, r.transcript]))
  chosen = chosen.map((r) => ({ ...r, transcript: txBy.get(r.id) ?? null }))

  // A joined meeting's names are in every part.
  const groups = chosen.filter((r) => r.merge_group).map((r) => r.merge_group!)
  const parts = new Map<string, string[]>()
  if (groups.length) {
    const { data: ps } = await supabaseAdmin.from('pen_sessions').select('id,merge_group').eq('user_email', email).in('merge_group', groups)
    for (const p of (ps ?? []) as { id: string; merge_group: string }[]) parts.set(p.merge_group, [...(parts.get(p.merge_group) ?? []), p.id])
  }
  const idsOf = (r: SessRow) => (r.merge_group ? parts.get(r.merge_group) ?? [r.id] : [r.id])
  const [mentions, contacts, profile] = await Promise.all([
    mentionsFor(email, chosen.flatMap(idsOf)),
    contactsOf(email),
    getProfile(email).catch(() => ({ name: undefined })),
  ])
  const me = profile.name ?? null

  const cards: WhoCard[] = []
  for (const r of chosen) {
    const own = linksOf(r.id)
    const confirmed = own.some((l) => l.source === 'user' || l.source === 'import')
    const ms: NameMention[] = idsOf(r).flatMap((id) => mentions[id] ?? [])
    const labels = r.merge_group ? undefined : (r.transcript?.utterances ?? []).map((u) => u.speaker)
    const chips = whoCandidates({
      mentions: ms,
      me,
      labels,
      contacts,
      linked: own.flatMap((l) => (l.pen_people ? [{ personId: l.person_id, name: l.pen_people.name, source: l.source }] : [])),
    })
    const voices = new Set((r.transcript?.utterances ?? []).map((u) => u.speaker)).size
    // Home asks only when there is something to go on: a name, a guest, or a second voice.
    if (!want && !chips.length && voices < 2) continue
    cards.push({
      id: r.id,
      title: r.title || r.source_name || '',
      when: r.recorded_at ?? r.created_at,
      durationSec: r.duration_sec,
      pending: r.status !== 'noted',
      confirmed,
      chips,
    })
  }
  // Cards dropped for having nothing to go on don't count towards "Review all".
  return { cards, total: want ? cards.length : total - (chosen.length - cards.length) }
}

/* ------------------------------------------------------------ save / skip */

/** Save on the card: the ticked and typed people are who was there. Idempotent. The route
 *  refreshes their contact cards (enrichPerson) after answering. */
export async function confirmWho(email: string, sessionId: string, picked: Confirmed[]): Promise<{ people: { id: string; name: string }[]; stored: boolean } | null> {
  const { data: s } = await supabaseAdmin.from('pen_sessions').select('id').eq('user_email', email).eq('id', sessionId).maybeSingle()
  if (!s) return null
  const list = picked.slice(0, 24)
  const askedIds = list.flatMap((p) => (p.personId && UUID.test(p.personId) ? [p.personId] : []))
  const [links, owned] = await Promise.all([
    linksFor(email, [sessionId]),
    askedIds.length ? supabaseAdmin.from('pen_people').select('id,name').eq('user_email', email).in('id', askedIds).then((r) => (r.data ?? []) as { id: string; name: string }[]) : Promise.resolve([] as { id: string; name: string }[]),
  ])
  const plan = confirmPlan(list, links.map((l) => ({ personId: l.person_id, source: l.source })), new Set(owned.map((p) => p.id)))
  const people: { id: string; name: string }[] = owned.filter((p) => plan.link.includes(p.id))
  for (const n of plan.create) {
    const p = await upsertByName(email, n)
    if (!people.some((x) => x.id === p.id)) people.push({ id: p.id, name: p.name })
  }
  for (const p of people) await linkPerson(email, sessionId, p.id, 'user', true)
  // A calendar guest left unticked wasn't there. Typed names resolved to that guest stay.
  for (const id of plan.unlink) if (!people.some((p) => p.id === id)) await unlinkPerson(email, sessionId, id)
  const stored = await stamp(email, sessionId, 'who_at')
  return { people, stored }
}

/** Skip on the card: don't ask about this recording again. */
export async function skipWho(email: string, sessionId: string): Promise<{ stored: boolean } | null> {
  const { data: s } = await supabaseAdmin.from('pen_sessions').select('id').eq('user_email', email).eq('id', sessionId).maybeSingle()
  if (!s) return null
  return { stored: await stamp(email, sessionId, 'who_at') }
}

/** For the briefing emails: of these recordings, the ones nobody has said who was on. */
export async function unconfirmed(email: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const links = await linksFor(email, ids).catch(() => [] as LinkRow[])
  return ids.filter((id) => !links.some((l) => l.session_id === id && (l.source === 'user' || l.source === 'import')))
}
