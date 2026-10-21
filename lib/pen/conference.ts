// Conference mode: the separate conversations inside one long recording.
//
// At an event the pen runs for an hour while the user talks to six people in turn. One set of
// notes for "the conference" is useless for the question that matters afterwards: "who was the
// guy I talked to about concierge cards?" (Carlos, 14 Oct). So the transcript is cut into the
// conversations in it, each with its topic and time range, and the names said inside each one
// become that conversation's name options (lib/pen/name-hints.ts segmentOptions).
//
// Speaker labels can't do this on their own: in a crowd the diarizer folds several strangers
// into one voice (measured on Carlos's event: "Speaker A" was Honor, Alexander and Jim). Topic
// and greetings can.
//
// The user confirms a name per conversation; that creates or links the contact (confirmName).
// Stored in pen_segments (schema.sql 2026-10-14 b). Re-running keeps confirmed names.

import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { penAnthropic } from './anthropic'
import { isMissingSchema } from './allowance'
import { userLang } from './user-lang'
import { LOCALE } from './i18n'
import { numberedLines, chunkLines, mentionsFor } from './names'
import { linkPerson, upsertByName, cleanName, ownedPeople, updatePerson } from './people'
import { eventName, stitch, type Conversation, type Segment } from './name-hints'
import type { PenSession, Utterance } from './store'
import { groupSessions } from './merge'

// Sonnet, not Haiku: on Carlos's event Haiku cut one group chat into four 1-minute pieces;
// Sonnet found the four real conversations (and named who each was with) in 5 s. ~3¢ an hour.
const MODEL = process.env.PEN_CONF_MODEL || 'claude-sonnet-5-5'
const CHUNK_CHARS = 60_000
type Lang = 'en' | 'es' | 'pt'
const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', pt: 'Portuguese' }

/** Suggest conference mode: long, and more voices than a meeting usually has. */
export const SUGGEST_MIN_SEC = 25 * 60
export const SUGGEST_MIN_SPEAKERS = 4

const SCHEMA = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          first_line: { type: 'integer', description: 'The [number] of the first line of this stretch.' },
          topic: { type: 'string', description: 'What was talked about, 2 to 6 words, specific: "fintech concierge cards", not "business chat".' },
          gist: { type: 'string', description: 'One sentence of at most 25 words: who the other person seems to be (role, company if said) and what was discussed.' },
          kind: { type: 'string', enum: ['conversation', 'talk', 'other'], description: 'conversation = the user talking with one or a few people; talk = a speaker, panel or announcement the user listened to; other = logistics, ordering food, silence, unrelated audio.' },
          continues_previous: { type: 'boolean', description: 'True only for the FIRST stretch, when it carries on the conversation already going before this part of the transcript.' },
        },
        required: ['first_line', 'topic', 'gist', 'kind', 'continues_previous'],
        additionalProperties: false,
      },
    },
  },
  required: ['segments'],
  additionalProperties: false,
} as const

const SYSTEM = `The transcript is from one recorder worn by the user at an event (a conference, a fair, a party), so it holds several separate conversations one after another.

Split it into those conversations, in order. A new one starts when the people or the subject change: a greeting or introduction ("nice to meet you", "I'm…", "what do you do?"), a goodbye, someone joining or leaving, or a clear jump to a different subject with different voices. Small talk inside one conversation is not a new one. A typical conversation at an event lasts 3 to 20 minutes; don't cut a long conversation into pieces just because the subject drifts.

Each line is "[number] minutes:seconds SPEAKER: text". Speaker labels are unreliable in a crowd (one label can be several people), so trust greetings, names and subject over labels.

For each conversation give the [number] of its first line, a short specific topic, one sentence on who the other person seems to be and what was said, and its kind. Write topic and gist in the language you are told. Never invent names, companies or roles that were not said.`

type Raw = { first_line: number; topic: string; gist: string; kind: string; continues_previous: boolean }

async function splitChunk(chunk: { from: number; lines: string[] }, lang: Lang, prev: string | null, known: string, before?: string[]): Promise<Raw[]> {
  const res = await penAnthropic('conference').messages.parse({
    model: MODEL,
    max_tokens: 20000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content:
        (known ? `Known voices: ${known}\n` : '') +
        (prev ? `Before this part of the transcript the user was in a conversation about: ${prev}\n` : '') +
        (before?.length
          ? `The recorder starts a new file every hour. The previous file (same event, a few seconds earlier) ended like this:\n${before.join('\n')}\n` +
            'Set continues_previous on your first stretch if it carries on that same conversation (same people, same subject, no greeting).\n'
          : '') +
        `\nTranscript:\n${chunk.lines.join('\n')}\n\nWrite topic and gist in ${LANG_NAME[lang]}.`,
    }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA), effort: 'medium' },
  })
  return res.parsed_output?.segments ?? []
}

/** Labels that really take part in a stretch: at least two turns or a tenth of the words. */
export function speakersOf(u: Utterance[], first: number, last: number): string[] {
  const turns: Record<string, number> = {}
  const words: Record<string, number> = {}
  let total = 0
  for (let i = first; i <= last; i++) {
    const n = u[i].text.split(/\s+/).length
    turns[u[i].speaker] = (turns[u[i].speaker] ?? 0) + 1
    words[u[i].speaker] = (words[u[i].speaker] ?? 0) + n
    total += n
  }
  return Object.keys(turns).filter((l) => turns[l] >= 2 || words[l] >= total / 10).sort()
}

/**
 * Turns the model's start lines into contiguous, ordered stretches covering the transcript.
 * Pure, so it can be tested. Stretches under ~40 s that are not the only one are folded into
 * the one before: a stray "excuse me" is not a conversation.
 */
export function buildSegments(raw: Raw[], u: Utterance[], opts: { carriesOn?: boolean } = {}): Omit<Segment, 'id' | 'person_id' | 'confirmed_name'>[] {
  const starts = raw
    .map((r) => ({ ...r, first_line: Math.trunc(Number(r.first_line)) }))
    .filter((r) => r.first_line >= 0 && r.first_line < u.length)
    .sort((a, b) => a.first_line - b.first_line)
  const dedup: Raw[] = []
  for (const r of starts) {
    if (dedup.length && dedup[dedup.length - 1].first_line === r.first_line) continue
    if (r.continues_previous && dedup.length) continue
    dedup.push(r)
  }
  if (!dedup.length) return []
  dedup[0] = { ...dedup[0], first_line: 0 }
  let segs = dedup.map((r, i) => {
    const last = i + 1 < dedup.length ? dedup[i + 1].first_line - 1 : u.length - 1
    return { r, first: r.first_line, last }
  })
  // Fold slivers into their neighbour.
  const merged: typeof segs = []
  for (const s of segs) {
    const dur = (u[s.last].end - u[s.first].start) / 1000
    if (merged.length && dur < 40) merged[merged.length - 1].last = s.last
    else merged.push({ ...s })
  }
  segs = merged
  const KINDS = ['conversation', 'talk', 'other'] as const
  // The first stretch carries on the last conversation of the file before: kind 'continues',
  // and the page, the search and the assistant show the two as one (name-hints stitch()).
  return segs.map((s, idx) => ({
    idx,
    first_utt: s.first,
    last_utt: s.last,
    start_sec: Math.round(u[s.first].start / 100) / 10,
    end_sec: Math.round(u[s.last].end / 100) / 10,
    topic: String(s.r.topic ?? '').trim().slice(0, 80) || '…',
    gist: String(s.r.gist ?? '').trim().slice(0, 300) || null,
    kind: idx === 0 && opts.carriesOn ? 'continues' : (KINDS as readonly string[]).includes(s.r.kind) ? (s.r.kind as Segment['kind']) : 'conversation',
    speakers: speakersOf(u, s.first, s.last),
  }))
}

/** The conversations in one recording, unsaved. The dry run and the stored path share it. */
export async function findSegments(session: PenSession, opts: { lang?: Lang; known?: string; before?: string[] } = {}) {
  const u = session.transcript?.utterances ?? []
  if (!u.length) return []
  const lang = opts.lang ?? 'en'
  const chunks = chunkLines(numberedLines(u, session.transcript_edits, 300), CHUNK_CHARS)
  // In order, so each chunk knows what conversation the last one ended in.
  const raw: Raw[] = []
  for (const c of chunks) {
    const prev = raw.length ? raw[raw.length - 1].topic : null
    const first = c.from === 0
    const got = await splitChunk(c, lang, prev, opts.known ?? '', first ? opts.before : undefined)
    raw.push(...got.map((g, i) => ({ ...g, continues_previous: i === 0 && (c.from > 0 || !!opts.before?.length) && g.continues_previous })))
  }
  return buildSegments(raw, u, { carriesOn: !!opts.before?.length && raw[0]?.continues_previous === true })
}

/** The last lines of the file before this one in a joined meeting: where the conversation was when the pen cut. */
async function previousTail(email: string, session: PenSession): Promise<string[] | undefined> {
  if (!session.merge_group || !session.merge_index) return undefined
  const parts = await groupSessions(email, session.merge_group)
  const prev = parts.find((p) => (p.merge_index ?? 0) === (session.merge_index ?? 0) - 1)
  const u = prev?.transcript?.utterances ?? []
  if (!u.length) return undefined
  return numberedLines(u, prev?.transcript_edits, 300).slice(-30).map((l) => l.replace(/^\[\d+\]/, '[before]'))
}

export async function segmentsFor(email: string, sessionIds: string[]): Promise<Record<string, Segment[]>> {
  const out: Record<string, Segment[]> = {}
  if (!sessionIds.length) return out
  const { data, error } = await supabaseAdmin
    .from('pen_segments')
    .select('id,session_id,idx,first_utt,last_utt,start_sec,end_sec,topic,gist,kind,speakers,person_id,confirmed_name')
    .eq('user_email', email)
    .in('session_id', sessionIds)
    .order('idx', { ascending: true })
  if (error) {
    if (!isMissingSchema(error.message)) console.warn(`pen: segments read: ${error.message}`)
    return out
  }
  for (const r of (data ?? []) as (Segment & { session_id: string })[]) {
    const { session_id, ...s } = r
    ;(out[session_id] ??= []).push(s)
  }
  return out
}

/**
 * Splits one recording and stores the conversations, replacing earlier ones. A name the user
 * already confirmed moves to whichever new conversation covers most of the old one. Returns the
 * count, or null when it couldn't run (table missing, no transcript, model failure).
 */
export async function splitConversations(email: string, session: PenSession): Promise<number | null> {
  try {
    if (!session.transcript?.utterances?.length) return null
    const { error: probe } = await supabaseAdmin.from('pen_segments').select('id').limit(1)
    if (probe) return null
    const lang = await userLang(email)
    const map = (session.speaker_map ?? {}) as Record<string, { name?: string; me?: boolean }>
    const known = Object.entries(map).filter(([, e]) => e?.name).map(([l, e]) => `${l} = ${e.name}${e.me ? ' (the user)' : ''}`).join('; ')
    const fresh = await findSegments(session, { lang, known, before: await previousTail(email, session) })
    if (!fresh.length) return null
    const old = (await segmentsFor(email, [session.id]))[session.id] ?? []
    const rows = fresh.map((s) => {
      const keep = old
        .filter((o) => o.person_id || o.confirmed_name)
        .map((o) => ({ o, overlap: Math.min(o.end_sec, s.end_sec) - Math.max(o.start_sec, s.start_sec) }))
        .filter((x) => x.overlap > (x.o.end_sec - x.o.start_sec) / 2)
        .sort((a, b) => b.overlap - a.overlap)[0]?.o
      return {
        ...s,
        user_email: email,
        session_id: session.id,
        ...(keep ? { person_id: keep.person_id, confirmed_name: keep.confirmed_name, confirmed_at: new Date().toISOString() } : {}),
      }
    })
    const { error: delErr } = await supabaseAdmin.from('pen_segments').delete().eq('user_email', email).eq('session_id', session.id)
    if (delErr) throw new Error(delErr.message)
    const { error } = await supabaseAdmin.from('pen_segments').insert(rows)
    if (error) throw new Error(error.message)
    await supabaseAdmin.from('pen_sessions').update({ segments_at: new Date().toISOString(), event_mode: true }).eq('id', session.id)
    return rows.length
  } catch (e) {
    console.warn(`pen: conversations failed for ${session.id}: ${(e as Error).message}`)
    return null
  }
}

const MET: Record<Lang, (event: string, date: string, topic: string) => string> = {
  en: (e, d, t) => `Met at ${e}${d ? `, ${d}` : ''}. Conversation: ${t}.`,
  es: (e, d, t) => `Nos conocimos en ${e}${d ? `, ${d}` : ''}. Conversación: ${t}.`,
  pt: (e, d, t) => `Nos conhecemos em ${e}${d ? `, ${d}` : ''}. Conversa: ${t}.`,
}


/**
 * "This conversation was with Pedro": creates or reuses the contact, links them to the
 * recording, and, if the contact has no line of their own yet, writes where they were met and
 * what about (the user just confirmed it, so it is theirs, not the model's). `name` = '' clears.
 * The caller refreshes the contact card afterwards (enrichPerson), outside the response.
 */
export async function confirmName(email: string, session: PenSession, segmentId: string, name: string, personId?: string | null): Promise<Segment | null> {
  const { data: seg, error } = await supabaseAdmin
    .from('pen_segments').select('*').eq('user_email', email).eq('session_id', session.id).eq('id', segmentId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!seg) return null
  const clean = cleanName(name)
  if (!clean && !personId) {
    const { data } = await supabaseAdmin.from('pen_segments')
      .update({ person_id: null, confirmed_name: null, confirmed_at: null }).eq('id', segmentId).select('*').single()
    return data as Segment
  }
  const person = personId ? (await ownedPeople(email, [personId]))[0] : await upsertByName(email, clean)
  if (!person) throw new Error('That contact was not found.')
  await linkPerson(email, session.id, person.id, 'user')
  if (!person.about) {
    const lang = await userLang(email)
    const event = eventName(session.title || session.source_name)
    const when = session.recorded_at ?? session.created_at
    const date = when ? new Date(when).toLocaleDateString(LOCALE[lang], { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    if (event) await updatePerson(email, person.id, { about: MET[lang](event, date, seg.topic) }).catch(() => {})
  }
  const { data, error: e2 } = await supabaseAdmin.from('pen_segments')
    .update({ person_id: person.id, confirmed_name: person.name, confirmed_at: new Date().toISOString() })
    .eq('id', segmentId).select('*').single()
  if (e2) throw new Error(e2.message)
  return data as Segment
}

/** Auto conference mode, for when the toggle was forgotten: 2 hours or more, 4 voices or more. */
export const AUTO_MIN_SEC = 2 * 3600

/**
 * Whether a recording should be split into conversations without being asked: ticked as an
 * event, or long with many voices (a joined meeting counts end to end; voices are counted per
 * file, since labels restart in each).
 */
export async function isEventLike(email: string, s: PenSession): Promise<boolean> {
  if (s.event_mode) return true
  const parts = s.merge_group ? await groupSessions(email, s.merge_group) : [s]
  if (parts.some((p) => p.event_mode)) return true
  const total = parts.reduce((t, p) => t + (p.duration_sec ?? 0), 0)
  const voices = Math.max(0, ...parts.map((p) => new Set((p.transcript?.utterances ?? []).map((u) => u.speaker)).size))
  if (total >= AUTO_MIN_SEC && voices >= SUGGEST_MIN_SPEAKERS) return true
  return recordedAtConference(email, parts, total, voices)
}

/** Recorded during a conference on the user's calendar: this long and this many voices at least. */
export const CAL_MIN_SEC = 15 * 60
export const CAL_MIN_SPEAKERS = 2

/**
 * Was this recording made during a conference-like event on the user's calendars
 * (lib/pen/event-prep.ts, PEN_EVENT_PREP=1 only)? One calendar read, only for recordings the
 * rule above didn't already settle. The file's time may be its start (the pen) or its end (a
 * phone), so the window is widened by the recording's length either side. False on any failure.
 */
async function recordedAtConference(email: string, parts: PenSession[], total: number, voices: number): Promise<boolean> {
  const { eventPrepOn, duringConference } = await import('./event-prep')
  if (!eventPrepOn() || total < CAL_MIN_SEC || voices < CAL_MIN_SPEAKERS) return false
  const at = Date.parse(parts[0]?.recorded_at ?? parts[0]?.created_at ?? '')
  if (!Number.isFinite(at)) return false
  const { userZone } = await import('./timezone')
  const tz = (await userZone(email).catch(() => null))?.tz || 'UTC'
  return duringConference(email, new Date(at - total * 1000), new Date(at + total * 1000), tz)
}

/**
 * The conversations of a recording (all parts of a joined meeting) as the briefing lists them.
 * Empty when it was never split or the tables don't exist.
 */
export async function conversationsOf(email: string, s: PenSession): Promise<Conversation[]> {
  const parts = s.merge_group ? await groupSessions(email, s.merge_group) : [s]
  const ids = parts.map((p) => p.id)
  const [segs, ms] = await Promise.all([segmentsFor(email, ids), mentionsFor(email, ids)])
  if (!ids.some((id) => segs[id]?.length)) return []
  const { getProfile } = await import('./profile')
  const me = (await getProfile(email).catch(() => ({ name: undefined }))).name ?? null
  let offset = 0
  return stitch(parts.map((p) => {
    const x = { id: p.id, offset, segments: segs[p.id] ?? [], mentions: ms[p.id] ?? [] }
    offset += p.duration_sec ?? 0
    return x
  }), { me })
}

/**
 * Conference mode on demand, for every part of a joined meeting at once (in parallel: a 7-hour
 * event is 7 files): marks it an event, finds names where missing, splits. True when every part
 * split. Shared by the recording page's button and the WhatsApp/iMessage assistant.
 */
export async function splitEvent(email: string, s: PenSession): Promise<boolean> {
  const { scanNames } = await import('./names')
  const parts = s.merge_group ? await groupSessions(email, s.merge_group) : [s]
  const { pool } = await import('./event-day')
  // Files with no speech have nothing to split; they don't count as a failure.
  const results = await pool(parts.filter((p) => p.transcript?.utterances?.length), 6, async (p) => {
    await supabaseAdmin.from('pen_sessions').update({ event_mode: true }).eq('id', p.id)
    if (!p.names_at) await scanNames(email, p)
    return splitConversations(email, p)
  })
  return results.every((n) => n !== null)
}
