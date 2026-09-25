// The people a user talks to, and which recordings each one was on.
//
// The user supplies what only they know for certain: a name, and an email. Everything else
// (their role, their company, who they are to the user) is written by the model from the
// notes of every recording the person is linked to, and rewritten as more recordings arrive.
//
// Linking is always the user's decision. The extraction already names people it heard, but
// those appear as suggestions on the recording page, never as automatic links: a transcript
// mentions "the lender" and "my wife", and a contact list that fills itself with those is a
// list nobody trusts.

import Anthropic from '@anthropic-ai/sdk'
import { isSelfName } from './speakers'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { isMissingSchema } from './allowance'
import type { PenNotes } from './store'

export type PenPerson = {
  id: string
  user_email: string
  name: string
  email: string | null
  role: string | null
  company: string | null
  summary: string | null
  /** The user's own line about who this is. Never written by the model; fed to it as fact. */
  about?: string | null
  enriched_at: string | null
  created_at: string
  updated_at: string
}

/** A person as the picker and the recording page need them. */
export type PersonCard = Pick<PenPerson, 'id' | 'name' | 'email' | 'role' | 'company' | 'summary' | 'about'> & {
  recordings: number
  lastAt: string | null
}

const NAME_MAX = 120

export function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
}
export function cleanEmail(v: unknown): string | null {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200 ? e : null
}

/** Everyone, with how many recordings they are on. Most recently seen first. */
export async function listPeople(userEmail: string): Promise<PersonCard[]> {
  const [{ data: people, error }, { data: links, error: e2 }] = await Promise.all([
    // '*' rather than a column list, so a column added later (about) cannot break the read
    // before its migration runs.
    supabaseAdmin.from('pen_people').select('*').eq('user_email', userEmail),
    supabaseAdmin.from('pen_session_people').select('person_id,created_at,pen_sessions(recorded_at,created_at)').eq('user_email', userEmail),
  ])
  if (error || e2) {
    const m = (error ?? e2)!.message
    if (isMissingSchema(m)) return []
    throw new Error(m)
  }
  const stats = new Map<string, { n: number; last: string | null }>()
  for (const l of (links ?? []) as unknown as { person_id: string; created_at: string; pen_sessions: { recorded_at: string | null; created_at: string } | null }[]) {
    const when = l.pen_sessions?.recorded_at ?? l.pen_sessions?.created_at ?? l.created_at
    const s = stats.get(l.person_id) ?? { n: 0, last: null }
    s.n++
    if (!s.last || when > s.last) s.last = when
    stats.set(l.person_id, s)
  }
  return ((people ?? []) as PersonCard[])
    .map((p) => ({ ...p, recordings: stats.get(p.id)?.n ?? 0, lastAt: stats.get(p.id)?.last ?? null }))
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name))
}

/** The person with this name, created if new. Names match case-insensitively. */
export async function upsertByName(userEmail: string, name: string, email?: string | null): Promise<PenPerson> {
  const clean = cleanName(name)
  if (!clean) throw new Error('A name is required.')
  const { data: found, error } = await supabaseAdmin
    .from('pen_people')
    .select('*')
    .eq('user_email', userEmail)
    .ilike('name', clean.replace(/[%_\\]/g, (c) => `\\${c}`))
    .maybeSingle()
  if (error) throw new Error(schemaHint(error.message))
  if (found) {
    // An email given now fills a blank one; it never silently overwrites one already saved.
    if (email && !found.email) {
      await supabaseAdmin.from('pen_people').update({ email, updated_at: new Date().toISOString() }).eq('id', found.id)
      return { ...(found as PenPerson), email }
    }
    return found as PenPerson
  }
  const { data, error: e2 } = await supabaseAdmin
    .from('pen_people')
    .insert({ user_email: userEmail, name: clean, email: email ?? null })
    .select('*')
    .single()
  // Lost a race with a concurrent insert of the same name: read the winner.
  if (e2?.code === '23505') return upsertByName(userEmail, clean, email)
  if (e2) throw new Error(schemaHint(e2.message))
  return data as PenPerson
}

export const ABOUT_MAX = 300

export function cleanAbout(v: unknown): string | null {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, ABOUT_MAX) : ''
  return t || null
}

export async function updatePerson(userEmail: string, id: string, patch: { name?: unknown; email?: unknown; about?: unknown }): Promise<PenPerson> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    const n = cleanName(patch.name)
    if (!n) throw new Error('A name is required.')
    body.name = n
  }
  if (patch.email !== undefined) {
    if (patch.email === '' || patch.email === null) body.email = null
    else {
      const e = cleanEmail(patch.email)
      if (!e) throw new Error('That email address does not look right.')
      body.email = e
    }
  }
  if (patch.about !== undefined) body.about = cleanAbout(patch.about)
  const { data, error } = await supabaseAdmin.from('pen_people').update(body).eq('id', id).eq('user_email', userEmail).select('*').single()
  if (error?.code === '23505') throw new Error('Someone with that name already exists.')
  if (error) throw new Error(schemaHint(error.message))
  return data as PenPerson
}

export async function linkPerson(userEmail: string, sessionId: string, personId: string, source: 'user' | 'import' = 'user') {
  const { error } = await supabaseAdmin
    .from('pen_session_people')
    .upsert({ session_id: sessionId, person_id: personId, user_email: userEmail, source }, { onConflict: 'session_id,person_id', ignoreDuplicates: true })
  if (error) throw new Error(schemaHint(error.message))
}

export async function unlinkPerson(userEmail: string, sessionId: string, personId: string) {
  const { error } = await supabaseAdmin
    .from('pen_session_people')
    .delete()
    .eq('user_email', userEmail)
    .eq('session_id', sessionId)
    .eq('person_id', personId)
  if (error) throw new Error(schemaHint(error.message))
}

/** People linked to one recording. */
export async function peopleOnSession(userEmail: string, sessionId: string): Promise<PenPerson[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_session_people')
    .select('pen_people(*)')
    .eq('user_email', userEmail)
    .eq('session_id', sessionId)
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  return ((data ?? []) as unknown as { pen_people: PenPerson | null }[])
    .map((r) => r.pen_people)
    .filter((p): p is PenPerson => !!p)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Recording ids a person was on, newest first. */
export async function sessionsWith(userEmail: string, personIds: string[]): Promise<string[]> {
  if (!personIds.length) return []
  const { data, error } = await supabaseAdmin
    .from('pen_session_people')
    .select('session_id,pen_sessions(recorded_at,created_at)')
    .eq('user_email', userEmail)
    .in('person_id', personIds)
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  const rows = (data ?? []) as unknown as { session_id: string; pen_sessions: { recorded_at: string | null; created_at: string } | null }[]
  const when = (r: (typeof rows)[number]) => r.pen_sessions?.recorded_at ?? r.pen_sessions?.created_at ?? ''
  return Array.from(new Set(rows.sort((a, b) => when(b).localeCompare(when(a))).map((r) => r.session_id)))
}

/** People the ids name, restricted to this user. The ids come from the browser. */
export async function ownedPeople(userEmail: string, ids: string[]): Promise<PenPerson[]> {
  const clean = Array.from(new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 10)
  if (!clean.length) return []
  const { data, error } = await supabaseAdmin.from('pen_people').select('*').eq('user_email', userEmail).in('id', clean)
  if (error) {
    if (isMissingSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as PenPerson[]
}

/**
 * People the notes heard on this recording who are not linked yet. Only named people: a role
 * on its own ("the inspector") is not someone you can add to a contact list.
 */
/**
 * Names the notes heard that are not on the recording's People yet. Leaves out the user (their
 * own name is heard on every call and they are not their own contact) and the notes'
 * placeholder for a voice nobody could name.
 */
export function suggestionsFrom(notes: PenNotes | null | undefined, linked: { name: string }[], me?: string | null) {
  const have = new Set(linked.map((p) => p.name.toLowerCase()))

  const seen = new Set<string>()
  return (notes?.people ?? []).flatMap((p) => {
    const name = cleanName(p.name)
    const key = name.toLowerCase()
    if (!name || have.has(key) || seen.has(key)) return []
    if (/^unknown speaker/i.test(name) || /\(the user\)/i.test(p.speaker ?? '')) return []
    if (isSelfName(name, me)) return []
    seen.add(key)
    return [{ name, role: p.role || null, note: p.note || null }]
  })
}

function schemaHint(message: string): string {
  return isMissingSchema(message)
    ? 'A people table or column is missing. Run the 2026-09-23 (b) and (d) migrations in lib/pen/schema.sql.'
    : message
}

/* ------------------------------------------------------------- enrichment */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Summarising what is already in the notes, not reading transcripts. Haiku is plenty.
const MODEL = 'claude-haiku-4-5'

const PERSON_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string', description: 'Their role or relationship to the user, a few words. "" if unclear.' },
    company: { type: 'string', description: 'Where they work, if stated. "" if not.' },
    summary: {
      type: 'string',
      description: 'One or two sentences: who this person is to the user and what is live between them. "" if the notes say nothing.',
    },
  },
  required: ['role', 'company', 'summary'],
  additionalProperties: false,
} as const

/**
 * Rewrites a person's role, company and summary from the notes of every recording they are
 * linked to. Reads notes, not transcripts: they are short, already name who said what, and
 * twenty recordings of notes fit where two transcripts would not.
 */
export async function enrichPerson(userEmail: string, personId: string): Promise<void> {
  const [person] = await ownedPeople(userEmail, [personId])
  if (!person) return
  const ids = (await sessionsWith(userEmail, [personId])).slice(0, 20)
  if (!ids.length) return
  const { data } = await supabaseAdmin
    .from('pen_sessions')
    .select('title,recorded_at,created_at,notes')
    .eq('user_email', userEmail)
    .in('id', ids)
  const notes = (data ?? []) as { title: string | null; recorded_at: string | null; created_at: string; notes: PenNotes }[]
  const written = notes.filter((n) => n.notes && Object.keys(n.notes).length)
  if (!written.length) return

  const corpus = written
    .map((n) =>
      `--- ${n.title ?? 'untitled'} (${(n.recorded_at ?? n.created_at).slice(0, 10)})\n` +
      JSON.stringify({ summary: n.notes.summary, people: n.notes.people, decisions: n.notes.decisions, actions: n.notes.actions }),
    )
    .join('\n')

  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system:
      'You keep a short contact card for one person, written from notes of meetings the user had ' +
      'with them. Use only what the notes support; leave a field empty rather than guess. The ' +
      'person may appear under a first name only or be misspelled by the transcriber. Plain text, ' +
      'no markdown.',
    messages: [
      {
        role: 'user',
        content:
          `Person: ${person.name}${person.email ? ` <${person.email}>` : ''}\n` +
          // The user's own description outranks anything inferred from the notes. Without it the
          // card once described a realtor friend as a co-founder, because that is how the
          // conversation happened to sound.
          (person.about ? `What the user says about them (treat as fact; the notes may mislead): ${person.about}\n` : '') +
          `\nMeetings they were in:\n${corpus}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(PERSON_SCHEMA) },
  })
  const out = res.parsed_output
  if (!out) return
  await supabaseAdmin
    .from('pen_people')
    .update({
      role: out.role.trim() || null,
      company: out.company.trim() || null,
      summary: out.summary.trim() || null,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', person.id)
}
