// Who "Chris" is (20 Oct): every name and address Juno already knows for the person the user named,
// so a search for them works the way a person would search. Matching is lib/pen/person-match.ts
// (pure); this gathers the candidates, all scoped to the user:
//
//   · contacts (pen_people: name, email, nicknames in brackets or "aka …" in their own note)
//   · names heard on recordings (pen_name_mentions) and speakers named on them (speaker_map)
//   · people emailed from Juno (pen_mail_from, pen_sent_emails)
//   · guests on calendar events the caller already read (optional), and email senders/recipients
//     the caller already saw (optional, e.g. the headers of a broad search)
//
// Nothing is stored; nothing leaves the account.

import { supabaseAdmin } from '@/lib/supabase'
import { personVariants, type PersonCand, type PersonVariants } from './person-match'
import type { UpcomingEvent } from './google-calendar'

/** "Christian Dyas <chris@x.com>" → name + address. */
export function splitAddress(h: string): { name: string | null; email: string | null } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(h)
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() }
  const e = /[^\s<>,;"]+@[^\s<>,;"]+/.exec(h)?.[0]?.toLowerCase() ?? null
  return { name: e ? null : h.trim() || null, email: e }
}

async function rows<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  try {
    const r = await p
    return r.error ? [] : ((r.data ?? []) as T[])
  } catch {
    return []
  }
}

/** Every candidate Juno has for this user (bounded), from the database. */
export async function knownPeople(userEmail: string): Promise<PersonCand[]> {
  const lower = userEmail.toLowerCase()
  const [people, heard, sessions, mailFrom, sent] = await Promise.all([
    rows<{ name: string; email: string | null; about?: string | null }>(supabaseAdmin.from('pen_people').select('name,email,about').eq('user_email', lower).limit(2000)),
    rows<{ name: string }>(supabaseAdmin.from('pen_name_mentions').select('name').eq('user_email', lower).order('created_at', { ascending: false }).limit(1500)),
    rows<{ speaker_map: Record<string, { name?: string; me?: boolean }> | null }>(supabaseAdmin.from('pen_sessions').select('speaker_map').eq('user_email', lower).not('speaker_map', 'is', null).order('created_at', { ascending: false }).limit(200)),
    rows<{ to_email: string }>(supabaseAdmin.from('pen_mail_from').select('to_email').eq('user_email', lower).limit(500)),
    rows<{ to_email: string }>(supabaseAdmin.from('pen_sent_emails').select('to_email').eq('user_email', lower).order('created_at', { ascending: false }).limit(500)),
  ])
  const out: PersonCand[] = []
  for (const p of people) {
    out.push({ name: p.name, email: p.email, source: 'contact' })
    // "aka Titi", "also called Chris", "le dicen Pancho" in the user's own note on them.
    const aka = /\b(?:aka|a\.k\.a\.|also called|goes by|le dicen|apodo|apelido|chamado de)\s+["“]?([\p{L}' -]{2,30})/iu.exec(p.about ?? '')?.[1]
    if (aka) out.push({ name: `${p.name} (${aka.trim()})`, email: p.email, source: 'contact' })
  }
  const seen = new Set<string>()
  for (const h of heard) {
    const k = h.name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ name: h.name, source: 'recording' })
  }
  for (const s of sessions) for (const e of Object.values(s.speaker_map ?? {})) if (e?.name && !e.me && !seen.has(e.name.toLowerCase())) { seen.add(e.name.toLowerCase()); out.push({ name: e.name, source: 'recording' }) }
  for (const m of [...mailFrom, ...sent]) if (m.to_email) out.push({ email: m.to_email, source: 'emailed' })
  return out
}

/** Guests (and organisers) on events already read, as candidates. */
export function eventPeople(events: UpcomingEvent[]): PersonCand[] {
  return events.flatMap((e) => [...e.others.map((o) => ({ name: o.name, email: o.email, source: 'calendar' })), ...(e.organizer && !e.organizerSelf ? [{ name: e.organizer.name, email: e.organizer.email, source: 'calendar' }] : [])])
}

/** Email From/To headers already seen, as candidates. */
export function headerPeople(headers: string[]): PersonCand[] {
  return headers.flatMap((h) => h.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((h) => ({ ...splitAddress(h), source: 'email' }))
}

/**
 * Every way to search for the person the user called `query`. `mine` = the user's own addresses
 * (never a match). `extra` = candidates the caller already has (calendar guests, email headers).
 */
export async function resolvePerson(userEmail: string, query: string, o: { mine?: string[]; extra?: PersonCand[] } = {}): Promise<PersonVariants> {
  const known = await knownPeople(userEmail).catch((): PersonCand[] => [])
  return personVariants(query, [...known, ...(o.extra ?? [])], [userEmail, ...(o.mine ?? [])])
}
