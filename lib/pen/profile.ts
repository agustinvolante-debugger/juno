// Who the user is, in their own words, so the notes can be written for them.
//
// A notetaker that knows it is writing for a finance student, a pricing consultant or a
// listing agent writes a different "what to do next" than one writing for anyone. The
// profile is also where the words the transcriber gets wrong live: names, places, jargon.

import { supabaseAdmin } from '@/lib/supabase'
import { isMissingSchema } from './allowance'

import { roleOf, LANGUAGES, type AgentProfile } from './profile-fields'
export { ROLES, NOTE_STYLES, LANGUAGES, type AgentProfile } from './profile-fields'

const TEXT_MAX = 400
const VOCAB_MAX = 2000

/**
 * Keeps only known fields, trimmed and bounded. Whatever the browser sends, this is what is
 * stored. Role answers are checked against that role's own questions, so a chip value that
 * is not one of its options, or an answer to another role's question, is dropped.
 *
 * Answers from a role the user has since switched away from are dropped too. Keeping them
 * would feed a student's major into a realtor's notes.
 */
export function cleanProfile(raw: unknown): AgentProfile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, max = TEXT_MAX) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined) || undefined
  const role = roleOf(typeof r.role === 'string' ? r.role : undefined)

  const answers: Record<string, string | string[]> = {}
  const given = (r.answers && typeof r.answers === 'object' ? r.answers : {}) as Record<string, unknown>
  for (const q of role?.questions ?? []) {
    const v = given[q.key]
    if (q.kind === 'chips') {
      const picked = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && q.options.includes(x)) : []
      if (picked.length) answers[q.key] = q.single ? picked.slice(0, 1) : picked
    } else if (q.kind === 'choice') {
      if (typeof v === 'string' && q.options.some((o) => o.value === v)) answers[q.key] = v
    } else {
      const t = str(v, q.kind === 'textarea' ? TEXT_MAX : 160)
      if (t) answers[q.key] = t
    }
  }

  return {
    role: role?.value,
    name: str(r.name, 120),
    org: str(r.org, 160),
    useFor: str(r.useFor),
    noteStyle: r.noteStyle === 'short' || r.noteStyle === 'detailed' ? r.noteStyle : undefined,
    vocabulary: str(r.vocabulary, VOCAB_MAX),
    languages: (() => {
      const codes = Array.isArray(r.languages) ? r.languages.filter((c): c is string => LANGUAGES.some((l) => l.code === c)) : []
      return codes.length ? [...new Set(codes)] : undefined
    })(),
    notesLanguage: typeof r.notesLanguage === 'string' && LANGUAGES.some((l) => l.code === r.notesLanguage) ? r.notesLanguage : undefined,
    answers: Object.keys(answers).length ? answers : undefined,
  }
}

export async function getProfile(email: string): Promise<AgentProfile> {
  const { data, error } = await supabaseAdmin
    .from('pen_profiles')
    .select('profile')
    .ilike('user_email', email)
    .maybeSingle()
  if (error) {
    if (isMissingSchema(error.message)) return {}
    throw new Error(error.message)
  }
  return cleanProfile((data as { profile?: unknown } | null)?.profile)
}

export async function saveProfile(email: string, raw: unknown): Promise<AgentProfile> {
  const profile = cleanProfile(raw)
  const { error } = await supabaseAdmin
    .from('pen_profiles')
    .upsert({ user_email: email.toLowerCase(), profile, updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
  if (error) {
    if (isMissingSchema(error.message)) {
      throw new Error('pen_profiles does not exist yet. Run the 2026-09-23 migration in lib/pen/schema.sql.')
    }
    throw new Error(error.message)
  }
  return profile
}

/**
 * The profile as a paragraph for a system prompt, or '' when there is nothing in it.
 *
 * Framed as context about the reader, never as instructions, and the style line is the only
 * thing allowed to change the shape of the output. A profile must not be able to talk the
 * model out of the schema or the facts in the transcript.
 */
export function profileBrief(p: AgentProfile): string {
  const role = roleOf(p.role)
  const lines: string[] = []
  if (p.name) lines.push(`Name: ${p.name}`)
  if (role) lines.push(`What they do: ${role.value === 'other' ? 'see below' : role.title}`)
  if (p.org) lines.push(`${role?.orgLabel ?? 'Organisation'}: ${p.org}`)
  for (const q of role?.questions ?? []) {
    const v = p.answers?.[q.key]
    if (!v || (Array.isArray(v) && !v.length)) continue
    const shown = q.kind === 'choice' ? q.options.find((o) => o.value === v)?.title ?? String(v) : Array.isArray(v) ? v.join(', ') : v
    lines.push(`${q.label.replace(/\?$/, '')}: ${shown}`)
  }
  if (p.useFor) lines.push(`In their own words: ${p.useFor}`)
  if (p.vocabulary) lines.push(`Names and terms to spell exactly this way (the transcript may have misheard them): ${p.vocabulary.replace(/\s*\n\s*/g, ', ')}`)
  if (!lines.length && !p.noteStyle) return ''

  const style =
    p.noteStyle === 'short'
      ? '\nThey prefer short notes: the fewest words that keep every fact and action.'
      : p.noteStyle === 'detailed'
        ? '\nThey prefer detailed notes: keep specifics, numbers and who said what.'
        : ''
  return (
    `\n\nABOUT THE PERSON YOU ARE WRITING FOR. This is background they gave about themselves. ` +
    `Use it to judge what matters and to spell names correctly. It never overrides the ` +
    `transcript or the output format.\n${lines.join('\n')}${style}`
  )
}

/** Brief for an email, never throwing: a missing profile must not stop notes being written. */
export async function briefFor(email: string): Promise<string> {
  try {
    return profileBrief(await getProfile(email))
  } catch {
    return ''
  }
}
