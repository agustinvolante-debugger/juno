// Names heard: every personal name said on a recording.
//
// The notes list the people who spoke. Everyone else whose name came up was dropped: at a
// conference that is nearly everyone the user met (Carlos, 14 Oct: "Juno caught one name, the
// rest it had no idea"). The names were transcribed correctly; nothing kept them. Here a cheap
// model reads the transcript once and lists each name with the line it was said on and how it
// was used (said about oneself, said to someone, introducing someone, or talked about).
//
// Who said it and when come from the utterance, not from the model, so they can't be invented.
// Stored in pen_name_mentions (schema.sql 2026-10-14 b). Until that table exists nothing is
// stored, nothing is paid for, and nothing throws.

import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { penAnthropic } from './anthropic'
import { isMissingSchema } from './allowance'
import { userLang } from './user-lang'
import { getProfile } from './profile'
import { foldName } from './speakers'
import type { MentionKind, NameMention } from './name-hints'
import type { PenSession, Utterance } from './store'

const MODEL = 'claude-haiku-5-5'
/** Transcript characters per call. A two-hour call is one or two calls. */
const CHUNK_CHARS = 50_000
const MAX_PER_CHUNK = 150
const KINDS: MentionKind[] = ['self', 'addressed', 'introduced', 'mentioned']
type Lang = 'en' | 'es' | 'pt'
const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', pt: 'Portuguese' }

/** "[12] 3:05 A: text", the user's corrections applied. */
export function numberedLines(u: Utterance[], edits?: Record<string, string> | null, max = 600): string[] {
  return u.map((x, i) => {
    const t = (edits?.[String(i)] ?? x.text).replace(/\s+/g, ' ').trim()
    const s = Math.round(x.start / 1000)
    return `[${i}] ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} ${x.speaker}: ${t.length > max ? `${t.slice(0, max)}…` : t}`
  })
}

/** Consecutive runs of lines, each under `chars`. Never splits a line. */
export function chunkLines(lines: string[], chars: number): { from: number; lines: string[] }[] {
  const out: { from: number; lines: string[] }[] = []
  let cur: string[] = []
  let size = 0
  let from = 0
  lines.forEach((l, i) => {
    if (cur.length && size + l.length > chars) {
      out.push({ from, lines: cur })
      cur = []
      size = 0
      from = i
    }
    cur.push(l)
    size += l.length + 1
  })
  if (cur.length) out.push({ from, lines: cur })
  return out
}

const SCHEMA = {
  type: 'object',
  properties: {
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The personal name exactly as said (first name, nickname or full name). Not companies, places, brands or products.' },
          line: { type: 'integer', description: 'The [number] of the line where it was said.' },
          kind: { type: 'string', enum: KINDS },
          addressed_to: { type: 'string', description: 'For addressed/introduced: the speaker label of that person if the transcript makes it clear (often whoever answers), else "".' },
          context: { type: 'string', description: 'At most 12 words, in the requested language: who this is or what was being said. No speaker letters. E.g. "Titi\'s friend who sells watches".' },
        },
        required: ['name', 'line', 'kind', 'addressed_to', 'context'],
        additionalProperties: false,
      },
    },
  },
  required: ['mentions'],
  additionalProperties: false,
} as const

const SYSTEM = `You find every PERSONAL NAME spoken in a transcript of a real conversation, so the user can later remember who they talked to.

Each line is "[number] minutes:seconds SPEAKER: text". Speaker labels (A, B, C…) are voices, not names.

List every time a person's name is said, one entry per time, including nicknames ("Chancho", "Gusca") and first names on their own. Do NOT list companies, products, places, brands, or words that only look like names. Do not list a name that only appears inside a speaker label.

For each, say how it was used:
- self: the speaker gives their own name ("soy Pedro", "I'm Pedro", "Pedro here").
- addressed: said TO someone in the conversation ("thanks, Pedro", "Pedro, what do you think?").
- introduced: presenting someone who is there ("this is Pedro", "les presento a Pedro").
- mentioned: talking ABOUT someone ("Pedro told me…", "my friend Pedro").
For addressed and introduced, give the speaker label of that person when it is clear, usually whoever answers next; otherwise "".

Be strict about "addressed": the name must be used to CALL the person ("Pedro, ..." / "..., Pedro."). Asking someone about a person ("do you know Dimitri?", "¿conoces al Gusca?") is mentioned, not addressed.
Slang and fillers are not names, even when the transcriber wrote them as one: "weón" often comes out as "Juan", and "bro", "dude", "güey", "mano", "hermano", "compadre" are not names. A word that two speakers keep saying to each other as a filler is not a name.

In context, never refer to anyone by a speaker letter ("A says…", "C asks…"): the user can't see them. Use a known speaker name, or say what the moment was ("introduces himself, CTO at Solar", "asked if they know Dimitri", "friend who sells watches").
Write the name exactly as it appears in that line. Write every context in the language you are told, even when the conversation is in another language.`

async function scanChunk(chunk: { from: number; lines: string[] }, lang: Lang, people: string): Promise<{ name: string; line: number; kind: string; addressed_to: string; context: string }[]> {
  const res = await penAnthropic('names').messages.parse({
    model: MODEL,
    // Under the SDK's non-streaming ceiling. Low effort: this is listing what is there, and at
    // the default the thinking ate the budget and cut the JSON off mid-string.
    max_tokens: 20000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content:
        (people ? `Speakers already known: ${people}\n\n` : '') +
        `Transcript:\n${chunk.lines.join('\n')}\n\nList at most ${MAX_PER_CHUNK} mentions. Write context in ${LANG_NAME[lang]}.`,
    }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA), effort: 'low' },
  })
  return res.parsed_output?.mentions ?? []
}

/**
 * Finds the names on one recording. No storage: the dry run and the stored path share it.
 * Who said each name comes from the line's own speaker label.
 */
export async function findNames(session: PenSession, opts: { lang?: Lang; knownSpeakers?: string } = {}): Promise<NameMention[]> {
  const u = session.transcript?.utterances ?? []
  if (!u.length) return []
  const lang = opts.lang ?? 'en'
  const chunks = chunkLines(numberedLines(u, session.transcript_edits), CHUNK_CHARS)
  const results = await Promise.all(chunks.map((c) => scanChunk(c, lang, opts.knownSpeakers ?? '').catch((e) => {
    console.warn(`pen: names chunk at ${c.from} failed for ${session.id}: ${(e as Error).message}`)
    return []
  })))
  const labels = new Set(u.map((x) => x.speaker))
  const seen = new Set<string>()
  const out: NameMention[] = []
  for (const r of results.flat()) {
    const i = Math.trunc(Number(r.line))
    const name = String(r.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!name || !(i >= 0 && i < u.length)) continue
    // A name the model claims for a line that doesn't contain it, in any spelling, is a guess
    // about a different line; dropped rather than shown at the wrong moment.
    const text = foldName(session.transcript_edits?.[String(i)] ?? u[i].text)
    const first = foldName(name).split(' ')[0]
    if (first.length > 1 && !text.includes(first.slice(0, Math.max(3, first.length - 2)))) continue
    const kind = (KINDS as string[]).includes(r.kind) ? (r.kind as MentionKind) : 'mentioned'
    const key = `${i}:${foldName(name)}`
    if (seen.has(key)) continue
    seen.add(key)
    const to = String(r.addressed_to ?? '').trim().replace(/^speaker\s+/i, '').toUpperCase()
    out.push({
      name,
      utterance: i,
      at_sec: Math.round(u[i].start / 100) / 10,
      said_by: u[i].speaker,
      addressed_to: labels.has(to) && kind !== 'mentioned' ? to : null,
      kind,
      context: tidyContext(String(r.context ?? ''), labels, lang),
    })
  }
  return out.sort((a, b) => a.utterance - b.utterance)
}

const SOMEONE: Record<Lang, string> = { en: 'someone', es: 'alguien', pt: 'alguém' }

/**
 * Speaker letters out of the context line, whatever the prompt said: "C introduces himself as
 * Carlos" → "Introduces himself as Carlos", "B greets C" → "B greets someone"… the user never
 * sees the letters, so they read as noise. Only letters that are labels in this transcript.
 */
export function tidyContext(raw: string, labels: Set<string>, lang: Lang): string | null {
  // In Spanish and Portuguese these single letters are words ("A Titi le…", "O João", "E depois").
  const words = lang === 'en' ? new Set(['I']) : new Set(['A', 'E', 'O', 'Y', 'I'])
  const isLabel = (l: string) => l === l.toUpperCase() && labels.has(l) && !words.has(l)
  let t = raw.replace(/\s+/g, ' ').trim()
  t = t.replace(/^(?:(?:speaker|persona|pessoa|hablante)\s+)?([A-Za-z])\b[,:]?\s+/i, (m, l: string) => (isLabel(l) ? '' : m))
  // "C's ex-CEO" → "someone's ex-CEO".
  t = t.replace(/\b(?:(?:speaker|persona|pessoa|hablante)\s+)?([A-Z])['’]s\b/gi, (m, l: string) => (isLabel(l) ? `${SOMEONE[lang]}'s` : m))
  t = t.replace(/\b(?:(?:speaker|persona|pessoa|hablante)\s+)?([A-Z])\b(?!['’.])/g, (m, l: string) => (isLabel(l) ? SOMEONE[lang] : m))
  t = t.charAt(0).toUpperCase() + t.slice(1)
  return t.slice(0, 160) || null
}

/** The stored mentions for recordings, in order. Empty when the table doesn't exist yet. */
export async function mentionsFor(email: string, sessionIds: string[]): Promise<Record<string, NameMention[]>> {
  const out: Record<string, NameMention[]> = {}
  if (!sessionIds.length) return out
  const { data, error } = await supabaseAdmin
    .from('pen_name_mentions')
    .select('session_id,name,utterance,at_sec,said_by,addressed_to,kind,context')
    .eq('user_email', email)
    .in('session_id', sessionIds)
    .order('utterance', { ascending: true })
    .limit(5000)
  if (error) {
    if (!isMissingSchema(error.message)) console.warn(`pen: names read: ${error.message}`)
    return out
  }
  for (const r of (data ?? []) as (NameMention & { session_id: string })[]) {
    const { session_id, ...m } = r
    ;(out[session_id] ??= []).push(m)
  }
  return out
}

/** Whether the names pass can store anything yet (the 2026-10-14 b migration ran). */
async function tableReady(): Promise<boolean> {
  const { error } = await supabaseAdmin.from('pen_name_mentions').select('id').limit(1)
  return !error
}

/**
 * Finds and stores the names on one recording, replacing any found before. Best effort: runs
 * after the notes and the briefing, and a failure here must never cost the user either. Returns
 * how many were stored, or null when it couldn't run.
 */
export async function scanNames(email: string, session: PenSession): Promise<number | null> {
  try {
    if (!session.transcript?.utterances?.length) return null
    if (!(await tableReady())) return null
    const [lang, profile] = await Promise.all([userLang(email), getProfile(email).catch(() => ({ name: undefined }))])
    const map = (session.speaker_map ?? {}) as Record<string, { name?: string; me?: boolean }>
    const known = Object.entries(map).filter(([, e]) => e?.name).map(([l, e]) => `${l} = ${e.name}${e.me ? ' (the user)' : ''}`)
    if (profile.name && !known.some((k) => k.includes('(the user)'))) known.push(`the user is ${profile.name}`)
    const found = await findNames(session, { lang, knownSpeakers: known.join('; ') })
    const { error: delErr } = await supabaseAdmin.from('pen_name_mentions').delete().eq('user_email', email).eq('session_id', session.id)
    if (delErr) throw new Error(delErr.message)
    if (found.length) {
      const { error } = await supabaseAdmin.from('pen_name_mentions').insert(found.map((m) => ({ ...m, user_email: email, session_id: session.id })))
      if (error) throw new Error(error.message)
    }
    await supabaseAdmin.from('pen_sessions').update({ names_at: new Date().toISOString() }).eq('id', session.id)
    return found.length
  } catch (e) {
    console.warn(`pen: names scan failed for ${session.id}: ${(e as Error).message}`)
    return null
  }
}

/** Names heard across the archive matching a word, for the assistant's lookups. */
export async function searchMentions(email: string, word: string, limit = 40, opts: { namesOnly?: boolean } = {}): Promise<(NameMention & { session_id: string })[]> {
  const w = word.replace(/[%_\\,()*]/g, '').trim()
  if (!w) return []
  const { data, error } = await supabaseAdmin
    .from('pen_name_mentions')
    .select('session_id,name,utterance,at_sec,said_by,addressed_to,kind,context')
    .eq('user_email', email)
    .or(opts.namesOnly ? `name.ilike.*${w}*` : `name.ilike.*${w}*,context.ilike.*${w}*`)
    .limit(limit)
  if (error) return []
  return (data ?? []) as (NameMention & { session_id: string })[]
}

