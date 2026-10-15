// Feature 2 — chat across the WHOLE archive, not one recording.
//
// Two stages on purpose. Stuffing every transcript into one prompt works at four recordings
// and falls over at four hundred, so:
//
//   1. SELECT  — a compact index (title, date, type, summary, people) picks which recordings
//                the question actually concerns. Cheap, and scales to a large archive.
//   2. ANSWER  — only the selected recordings' notes are loaded, and the answer must cite
//                the recordings it drew on so every claim is traceable in the UI.
//
// The model emits [1]-style markers and a parallel citation list. The client turns those into
// interactive pills, which is why the marker/citation split matters: an answer with an
// untraceable claim is worse than no answer.
import Anthropic from '@anthropic-ai/sdk'
import { penAnthropic } from './anthropic'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { stripMarkdown } from './plaintext'
import type { ArchiveTurn, PenNotes, MeetingType, Transcript, Mention } from './store'
import { ownedPeople, sessionsWith } from './people'
import { namedDialogue, foldName, type SpeakerMap } from './speakers'
import { REPLY_LANGUAGE, inQuestionLanguage } from './reply-language'
import { isMissingSchema } from './allowance'
import { mentionsFor } from './names'
import { segmentsFor } from './conference'
import { clock, namesHeard, segmentOptions, reasonEn, eventName, type Segment } from './name-hints'

const anthropic = penAnthropic('archive-chat')
// Both stages are retrieval, not synthesis — pick the recordings, then answer from what is in
// front of you and cite it. Haiku 4.5 does that accurately, costs a fraction, and answers fast
// enough to feel like search rather than a request. Extraction stays on Opus, where the task is
// noticing what someone missed rather than reporting what they said.
const MODEL = 'claude-haiku-5-5'

type IndexRow = {
  id: string
  title: string | null
  client_name: string | null
  meeting_type: MeetingType | null
  recorded_at: string | null
  created_at: string
  notes: PenNotes
  merge_group?: string | null
  merge_index?: number | null
  duration_sec?: number | null
}

/** Where a file sits in a joined meeting: its start from the meeting's start, and the meeting's title. */
type PartInfo = { offset: number; part: number; of: number; title: string | null }

/**
 * Offsets for every part of every joined meeting in `rows`. A 7-hour event is 7 files; the
 * answer has to say "6:33", not "minute 33 of some file". Pure.
 */
export function partInfo(rows: { id: string; title: string | null; merge_group?: string | null; merge_index?: number | null; duration_sec?: number | null }[]): Map<string, PartInfo> {
  const out = new Map<string, PartInfo>()
  const groups = new Map<string, typeof rows>()
  for (const r of rows) if (r.merge_group) groups.set(r.merge_group, [...(groups.get(r.merge_group) ?? []), r])
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => (a.merge_index ?? 0) - (b.merge_index ?? 0))
    let offset = 0
    sorted.forEach((r, i) => {
      out.set(r.id, { offset, part: i + 1, of: sorted.length, title: sorted[0].title })
      offset += r.duration_sec ?? 0
    })
  }
  return out
}

const SELECT_SCHEMA = {
  type: 'object',
  properties: {
    session_ids: {
      type: 'array',
      description: 'Ids of the recordings needed to answer. Empty if the archive cannot answer it.',
      items: { type: 'string' },
    },
    reason: { type: 'string', description: 'One short line on why these, for debugging.' },
  },
  required: ['session_ids', 'reason'],
  additionalProperties: false,
} as const

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    // First, so it is decided before a word of the answer is written. Spanish and Portuguese
    // are close enough that "E sobre levantar capital de risco?" was answered in Spanish until
    // the model had to name the language.
    language: {
      type: 'string',
      description:
        'The language the LATEST question is written in, e.g. "Portuguese". Look at its words: ' +
        '"e", "sobre", "de risco", "você", "não" are Portuguese; "y", "sobre", "de riesgo", "tú" are Spanish. ' +
        'Ignore the language of earlier turns and of the recordings.',
    },
    answer: {
      type: 'string',
      description:
        'The answer, written in the language named in "language", in plain prose. Cite recordings inline with [1], [2] markers that ' +
        'correspond to the citations array. Every factual claim carries a marker.',
    },
    citations: {
      type: 'array',
      description:
        'ONE entry per recording you cited — never several entries sharing a marker. A marker ' +
        'identifies a recording, not a footnote, so the list is at most as long as the number of ' +
        'recordings you were given.',
      items: {
        type: 'object',
        properties: {
          marker: { type: 'integer', description: 'The number used inline, e.g. 1 for [1]. Each appears once in this array.' },
          session_id: { type: 'string' },
          quote: { type: 'string', description: 'A short line quoted VERBATIM from that recording\'s transcript, or "" if none applies. Never paraphrase into this field.' },
        },
        required: ['marker', 'session_id', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['language', 'answer', 'citations'],
  additionalProperties: false,
} as const

// ~213 tokens per minute of speech, measured on real recordings. So the whole archive can
// never go in the selection prompt (400 hours would be ~5M tokens), but the handful of
// recordings that survive selection comfortably can — which is why stage 1 stays on the notes
// index and stage 2 now reads the actual words.
const MAX_TRANSCRIPT_CHARS = 24000

// 12 transcripts at the cap below is ~66k tokens, comfortable inside Haiku's window, and it
// covers a real early archive without selection ever running.
const MAX_ANSWER_ROWS = 12
// The answer stage's whole transcript budget (12 recordings at the old cap, ~70k tokens). Shared
// out among the recordings actually read: two recordings get ~144k characters each, not 24k.
// A 60-minute part is ~45k characters, so one long event reads in full instead of its first
// half hour.
// PEN_ARCHIVE_BUDGET: tests only, to make a small test archive read like a full one.
const ANSWER_TRANSCRIPT_BUDGET = Number(process.env.PEN_ARCHIVE_BUDGET) || MAX_ANSWER_ROWS * MAX_TRANSCRIPT_CHARS

const STOPWORDS = new Set(
  ('a about all also am an and any are as at be been but by can did do does for from get got had has have ' +
   'he her him his how i if in into is it its just me more my no not of on or our out said say she should ' +
   'so some than that the their them then there these they this to was we were what when where which who ' +
   'why will with would you your anything everything something did do tell show find search across recording ' +
   'name named called guy girl person someone talked talk wanted want ' +
   'recordings meeting meetings').split(' '),
)

/**
 * Distinctive words in the question, for a literal transcript scan.
 *
 * The selection stage reads extracted notes, so a detail the extractor didn't think notable —
 * an HOA fee, a name said once — is invisible to it even though the transcript contains it.
 * This is the cheap safety net: quoted phrases and uncommon words, matched literally.
 */
export function keyTerms(question: string, max = 6): string[] {
  const quoted = Array.from(question.matchAll(/"([^"]{3,60})"/g)).map((m) => m[1].toLowerCase())
  // Letters in any language: "teléfono" used to come out as "fono".
  const words = (question.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]{3,}/gu) ?? [])
    .filter((w) => !STOPWORDS.has(w) && !STOPWORDS_ES_PT.has(w))
  return Array.from(new Set([...quoted, ...words])).slice(0, max)
}

// Spanish and Portuguese question words, so "¿cómo se llamaba el que…?" searches for the
// subject, not for "cómo".
const STOPWORDS_ES_PT = new Set(
  ('para como cómo quien quién quiénes cual cuál cuales cuando cuándo donde dónde este esta esto ese esa eso ' +
   'aquel aquella pero porque sobre entre tiene tenía tengo hablé habló hablamos dijo dije quería quiere ' +
   'nombre llamaba llama llamado mandar enviar enviarle mandarle todo todos algo nada desde hasta ' +
   'qual quais quem quando onde esse essa isso aquele aquela porque sobre entre tinha tenho falei falou ' +
   'disse queria quer nome chamava chamado mandar enviar tudo todos algo nada desde também muito').split(' '),
)

/**
 * A transcript cut to fit `cap` characters without losing what the question is about. A long
 * recording used to keep only its opening, so anything said after the first half hour was
 * invisible to the answer. Now: the opening for context, then every stretch around a line that
 * contains one of the question's words, then whatever fits from the start, in transcript order,
 * with the gaps marked. Pure, for testing.
 */
export function fitTranscript(lines: string[], cap: number, terms: string[]): string {
  const total = lines.reduce((t, l) => t + l.length + 1, 0)
  if (total <= cap) return lines.join('\n')
  const want = terms.map((t) => foldName(t)).filter((t) => t.length >= 3)
  const keep = new Array<boolean>(lines.length).fill(false)
  let used = 0
  const take = (i: number) => {
    if (i < 0 || i >= lines.length || keep[i] || used + lines[i].length + 1 > cap) return
    keep[i] = true
    used += lines[i].length + 1
  }
  for (let i = 0; i < Math.min(20, lines.length); i++) take(i)
  if (want.length) {
    const folded = lines.map((l) => foldName(l))
    // Rare words first, and none that is everywhere: "send" or "want" in a two-hour chat would
    // spend the whole budget on noise before "Georgia" got its turn.
    const common = Math.max(12, lines.length * 0.03)
    const byTerm = want
      .map((w) => folded.flatMap((l, i) => (l.includes(w) ? [i] : [])))
      .filter((h) => h.length && h.length <= common)
      .sort((a, b) => a.length - b.length)
    // Nearest lines first around every hit, so many hits each keep their core before any one
    // keeps a wide margin.
    for (const hits of byTerm) for (let r = 0; r <= 12; r++) for (const h of hits) { take(h - r); take(h + r) }
  }
  for (let i = 0; i < lines.length && used < cap; i++) take(i)
  const out: string[] = []
  let skipped = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push(`[… ${skipped} lines not shown …]`)
      skipped = 0
      out.push(l)
    } else skipped++
  })
  if (skipped) out.push(`[… ${skipped} lines not shown …]`)
  return out.join('\n')
}

/**
 * Recordings whose transcript literally contains one of the terms. Runs in Postgres so the
 * transcripts never leave the database — pulling every transcript into the function to grep
 * them in JS would move megabytes per question.
 */
async function transcriptMatches(userEmail: string, terms: string[]): Promise<string[]> {
  if (!terms.length) return []
  const or = terms.map((t) => `transcript->>text.ilike.*${t.replace(/[*,()]/g, '')}*`).join(',')
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id')
    .eq('user_email', userEmail)
    .or(or)
    .limit(12)
  // A failed prefilter must not take the question down with it — the model's selection stands
  // on its own, this only adds to it.
  if (error) return []
  return (data ?? []).map((r) => r.id as string)
}

type NameIndex = Map<string, { names: string[]; convos: { start_sec: number; topic: string; confirmed_name: string | null }[] }>

/**
 * Names heard and conversation topics per recording, for the selection index: "who did I talk
 * to about concierge cards?" has to find an event recording whose notes are one paragraph about
 * a whole afternoon. Two light reads over the user's rows; empty until the tables exist.
 */
async function nameIndex(userEmail: string): Promise<NameIndex> {
  const out: NameIndex = new Map()
  const [m, sg] = await Promise.all([
    supabaseAdmin.from('pen_name_mentions').select('session_id,name').eq('user_email', userEmail).limit(10000),
    supabaseAdmin.from('pen_segments').select('session_id,idx,start_sec,topic,confirmed_name').eq('user_email', userEmail).order('idx').limit(4000),
  ])
  for (const e of [m.error, sg.error]) if (e && !isMissingSchema(e.message)) console.warn(`pen: name index: ${e.message}`)
  for (const r of (m.data ?? []) as { session_id: string; name: string }[]) {
    const x = out.get(r.session_id) ?? { names: [], convos: [] }
    if (!x.names.some((n) => n.toLowerCase() === r.name.toLowerCase())) x.names.push(r.name)
    out.set(r.session_id, x)
  }
  for (const r of (sg.data ?? []) as { session_id: string; start_sec: number; topic: string; confirmed_name: string | null }[]) {
    const x = out.get(r.session_id) ?? { names: [], convos: [] }
    x.convos.push({ start_sec: r.start_sec, topic: r.topic, confirmed_name: r.confirmed_name })
    out.set(r.session_id, x)
  }
  return out
}

/** Compact enough that hundreds of recordings still fit in the selection prompt. */
function indexLine(r: IndexRow, extra?: { names: string[]; convos: { start_sec: number; topic: string; confirmed_name: string | null }[] }, part?: PartInfo) {
  const when = (r.recorded_at ?? r.created_at).slice(0, 10)
  const at = part?.offset ?? 0
  const who = r.notes?.people?.map((p) => p.name || p.role).filter(Boolean).slice(0, 5).join(', ')
  return [
    `id: ${r.id}`,
    `date: ${when}`,
    `type: ${r.meeting_type ?? 'unknown'}`,
    `title: ${(part?.part ?? 1) > 1 ? part!.title ?? r.title ?? 'untitled' : r.title ?? 'untitled'}`,
    part && part.of > 1 ? `part ${part.part} of ${part.of} of "${part.title ?? 'a joined meeting'}" (from ${clock(part.offset)})` : '',
    r.client_name ? `with: ${r.client_name}` : '',
    who ? `people: ${who}` : '',
    r.notes?.summary ? `summary: ${r.notes.summary.slice(0, 320)}` : '',
    extra?.names.length ? `names heard: ${extra.names.slice(0, 15).join(', ')}` : '',
    extra?.convos.length ? `conversations: ${extra.convos.slice(0, 15).map((c) => `${clock(c.start_sec + at)} ${c.topic}${c.confirmed_name ? ` (with ${c.confirmed_name})` : ''}`).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ')
}

/**
 * The transcript as the user sees it: AssemblyAI's utterances with their manual corrections
 * applied on top. Searching the uncorrected original would find the garbled version of a name
 * the user has already fixed.
 */
/** "6:33" (hours:minutes) from seconds. */
function hm(sec: number): string {
  const m = Math.floor(sec / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

function dialogueOf(
  t: Transcript | null | undefined,
  edits: Record<string, string> | null | undefined,
  map?: SpeakerMap | null,
  fit: { cap: number; terms: string[] } = { cap: MAX_TRANSCRIPT_CHARS, terms: [] },
  offsetSec = 0,
): string {
  if (!t) return '(not transcribed)'
  // Names instead of "Speaker A" where known, so "what did Chris say" can find Chris. Each
  // line carries its minute, so an answer can point to the moment.
  const lines = t.utterances?.length
    ? t.utterances.map((u, i) => `[${hm(offsetSec + u.start / 1000)}] ${namedDialogue([u], map, edits?.[String(i)] !== undefined ? { '0': edits[String(i)] } : null)}`)
    : (t.text ?? '').split(/(?<=[.!?])\s+/)
  if (!lines.join('').trim()) return '(not transcribed)'
  return fitTranscript(lines, fit.cap, fit.terms)
}

export async function askArchive(opts: {
  userEmail: string
  question: string
  history: ArchiveTurn[]
  /** The user's own profile as a prompt paragraph. See lib/pen/profile.ts. */
  agent?: string
  /** Recording ids the user tagged with @. Always read, and read first. */
  mentions?: string[]
  /** Person ids the user tagged with @. The answer is drawn only from their recordings. */
  people?: string[]
  /** What each tag looks like in the question ("@Recruiter…"), by id. */
  labels?: Record<string, string>
  /** Overrides the model for both stages. WhatsApp uses Sonnet 5.5; the web chat stays on Haiku. */
  model?: string
  /** Effort for an overriding model. Haiku takes none. */
  effort?: 'low' | 'medium' | 'high'
}): Promise<{ answer: string; citations: { marker: number; session_id: string; title: string; quote: string }[]; mentioned: Mention[] }> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,meeting_type,recorded_at,created_at,notes,merge_group,merge_index,duration_sec')
    .eq('user_email', opts.userEmail)
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) throw new Error(error.message)

  let rows = (data ?? []) as IndexRow[]
  if (!rows.length) {
    return { answer: 'There are no recordings in your archive yet.', citations: [], mentioned: [] }
  }

  // @-tagged recordings. Checked against this user's own rows, because the ids come from the
  // browser and answerFrom reads by id alone. Looked up separately rather than from `rows`,
  // which stops at the newest 400: tagging an old recording must still work.
  const label = (id: string, fallback: string) => {
    const l = opts.labels?.[id]
    return typeof l === 'string' && l.trim() ? l.trim().slice(0, 60) : fallback
  }
  const mentioned: Mention[] = (await ownedMentions(opts.userEmail, opts.mentions ?? [])).map((m) => ({ ...m, label: label(m.id, m.title) }))
  const tagged = mentioned.map((m) => m.id)

  // @-tagged people narrow the archive to the recordings they were on. "Calls with @Chris
  // about the Malibu house" is then a question over Chris's calls only, and the model cannot
  // wander into a Malibu conversation he was never part of.
  const persons = await ownedPeople(opts.userEmail, opts.people ?? [])
  const personTags: PersonTag[] = []
  for (const p of persons) {
    personTags.push({ id: p.id, label: label(p.id, p.name), name: p.name, email: p.email, role: p.role, company: p.company, sessions: await sessionsWith(opts.userEmail, [p.id]) })
  }
  const personMentions: Mention[] = personTags.map((p) => ({ id: p.id, title: p.name, label: p.label, kind: 'person' }))
  if (personTags.length) {
    const scope = new Set([...tagged, ...personTags.flatMap((p) => p.sessions)])
    rows = rows.filter((r) => scope.has(r.id))
    if (!scope.size) {
      const names = personTags.map((p) => p.name).join(' and ')
      return {
        answer: `No recordings are linked to ${names} yet. Open a recording they were on and add them under People.`,
        citations: [],
        mentioned: [...mentioned, ...personMentions],
      }
    }
  }
  const withMentions = { ...opts, mentioned, personTags, allMentions: [...mentioned, ...personMentions] }

  const today = new Date().toISOString().slice(0, 10)

  /* ------------------------------------------------------- stage 1: select */
  //
  // Selection exists to keep hundreds of transcripts out of one prompt. Below the answer
  // stage's own limit there is nothing to select — everything fits — and running the stage
  // anyway just adds a way to be wrong. It was: on a six-recording archive it rejected
  // relevant recordings on two of four ordinary questions, including one the per-recording
  // chat answered in detail, and the user saw "nothing in your archive covers that".
  if (rows.length <= MAX_ANSWER_ROWS) {
    const all = rows.map((r) => r.id)
    return answerFrom(Array.from(new Set([...tagged, ...all])), rows, withMentions, today)
  }

  const names = await nameIndex(opts.userEmail).catch(() => new Map() as NameIndex)
  const parts = partInfo(rows)
  const sel = await anthropic.messages.parse({
    model: opts.model ?? MODEL,
    // max_tokens is a budget for thinking AND output, not just output. Opus 5 reasons by
    // default, and on a long input it happily spends thousands of tokens doing it — a
    // measured 2,197 of a 3,000 ceiling — leaving too few to finish the JSON, which then
    // fails to parse mid-string. Ceilings here are sized for both; unused tokens cost
    // nothing, a truncated answer costs the whole request.
    max_tokens: 8000,
    system:
      'You pick which recordings might help answer a question about someone\'s archive of ' +
      'meetings.\n\n' +
      'WHEN IN DOUBT, INCLUDE IT. You are reading short summaries, not the recordings ' +
      'themselves, so a detail can easily be present in a transcript and absent from its ' +
      'summary. Including a recording that turns out to be irrelevant costs almost nothing; ' +
      'leaving one out makes the answer wrong, and the user is told their archive has nothing ' +
      'on the subject when it does.\n' +
      `Read relative dates ("last week", "yesterday") against today's date. ` +
      'Return an empty list only when the question is plainly about something outside this ' +
      'archive entirely.',
    messages: [
      {
        role: 'user',
        content:
          `Today is ${today}.\n\nIndex of recordings:\n${rows.map((r) => indexLine(r, names.get(r.id), parts.get(r.id))).join('\n')}\n\n` +
          (opts.history.length
            ? `Earlier in this conversation:\n${opts.history.slice(-4).map((t) => `${t.role}: ${t.content.slice(0, 300)}`).join('\n')}\n\n`
            : '') +
          `Question: ${opts.question}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SELECT_SCHEMA), ...(opts.model && opts.effort ? { effort: opts.effort } : {}) },
  })

  const picked = (sel.parsed_output?.session_ids ?? []).filter((id) => rows.some((r) => r.id === id))
  // Union, model first: what it reasoned about leads, and literal transcript hits it could not
  // have seen from the notes get appended rather than displacing them.
  const literal = await transcriptMatches(opts.userEmail, keyTerms(opts.question))
  // Tagged recordings lead, so the cap below can never cut one the user named.
  const wanted = Array.from(new Set([...tagged, ...picked, ...literal.filter((id) => rows.some((r) => r.id === id))]))
    .slice(0, MAX_ANSWER_ROWS)
  // An empty selection is not evidence of an empty archive — it is one model reading short
  // summaries and being timid. Telling someone their archive has nothing on a subject it
  // demonstrably covers is the worst answer this thing can give, so fall back to the most
  // recent recordings and let the answer stage decide against the actual transcripts. It is
  // grounded and will say "that is not in these recordings" when that is genuinely true.
  const rowsToRead = wanted.length ? wanted : rows.slice(0, MAX_ANSWER_ROWS).map((r) => r.id)

  return answerFrom(rowsToRead, rows, withMentions, today)
}

type PersonTag = { id: string; label: string; name: string; email: string | null; role: string | null; company: string | null; sessions: string[] }

/** The tagged ids that really are this user's recordings, with the title the user sees. */
async function ownedMentions(userEmail: string, ids: string[]): Promise<Mention[]> {
  const clean = Array.from(new Set(ids.filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 10)
  if (!clean.length) return []
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,source_name')
    .eq('user_email', userEmail)
    .in('id', clean)
  if (error) throw new Error(error.message)
  const byId = new Map((data ?? []).map((r) => [r.id as string, r]))
  // Kept in the order the user typed them.
  return clean.flatMap((id) => {
    const r = byId.get(id)
    return r ? [{ id, title: (r.title || r.client_name || r.source_name || 'Untitled') as string }] : []
  })
}

/* --------------------------------------------------------- stage 2: answer */

async function answerFrom(
  wanted: string[],
  rows: IndexRow[],
  opts: { userEmail: string; question: string; history: ArchiveTurn[]; agent?: string; model?: string; effort?: 'low' | 'medium' | 'high'; mentioned?: Mention[]; personTags?: PersonTag[]; allMentions?: Mention[] },
  today: string,
): Promise<{ answer: string; citations: { marker: number; session_id: string; title: string; quote: string }[]; mentioned: Mention[] }> {
  wanted = wanted.slice(0, MAX_ANSWER_ROWS)
  const { data: full, error: e2 } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,meeting_type,recorded_at,created_at,notes,user_notes,transcript,transcript_edits,speaker_map,merge_group,merge_index,duration_sec')
    .in('id', wanted)
  if (e2) throw new Error(e2.message)

  const byId = new Map((full ?? []).map((r) => [r.id as string, r]))
  const marked = wanted.map((id, i) => ({ marker: i + 1, id, row: byId.get(id) }))

  // Every file of each joined meeting that was picked, so times count from the meeting's start
  // and the conversation picker below sees the whole event, not just the files that were chosen.
  const groups = Array.from(new Set((full ?? []).flatMap((r) => (r.merge_group ? [r.merge_group as string] : []))))
  const { data: sibs } = groups.length
    ? await supabaseAdmin.from('pen_sessions').select('id,title,merge_group,merge_index,duration_sec').eq('user_email', opts.userEmail).in('merge_group', groups)
    : { data: [] as { id: string; title: string | null; merge_group: string | null; merge_index: number | null; duration_sec: number | null }[] }
  const parts = partInfo((sibs ?? []) as { id: string; title: string | null; merge_group: string | null; merge_index: number | null; duration_sec: number | null }[])
  const offsetOf = (id: string) => parts.get(id)?.offset ?? 0
  const eventIds = Array.from(new Set([...wanted, ...(sibs ?? []).map((x) => x.id as string)]))

  const [heard, convos] = await Promise.all([
    mentionsFor(opts.userEmail, eventIds).catch(() => ({}) as Awaited<ReturnType<typeof mentionsFor>>),
    segmentsFor(opts.userEmail, eventIds).catch(() => ({}) as Awaited<ReturnType<typeof segmentsFor>>),
  ])
  const picked = await pickConversations(opts.question, eventIds, convos, parts, byId as Map<string, { title?: string | null }>, opts.userEmail).catch(() => [])
  /** Every name said, and for an event each conversation with its name options. The transcript above is cut at 24k characters; these cover the whole recording. */
  const namesBlock = (id: string, labels: string[]) => {
    const ms = heard[id] ?? []
    const segs = convos[id] ?? []
    const lines: string[] = []
    if (ms.length) {
      lines.push('names heard (time, how used, context):')
      for (const n of namesHeard(ms, null, labels).slice(0, 40)) {
        lines.push(`  ${n.name} ×${n.count}: ` + n.moments.slice(0, 3).map((m) => `${clock(m.at_sec + offsetOf(id))} ${m.kind}${m.context ? ` "${m.context}"` : ''}`).join('; '))
      }
    }
    if (segs.length) {
      lines.push('conversations in this recording (an event; the user met people one after another):')
      for (const g of segs) {
        const o = segmentOptions(ms, g)
        const who = g.confirmed_name
          ? `confirmed by the user: ${g.confirmed_name}`
          : o.likely.length ? `name not confirmed; options: ${o.likely.map((x) => `${x.name} (${reasonEn(x)})`).join(', ')}` : 'name not said'
        lines.push(`  ${clock(g.start_sec + offsetOf(id))}–${clock(g.end_sec + offsetOf(id))} ${g.kind === 'continues' ? 'conversation (carries on the last one of the previous file of this event)' : g.kind} · ${g.topic} · ${g.gist ?? ''} · ${who}` + (o.mentioned.length ? ` · also mentioned: ${o.mentioned.map((x) => x.name).join(', ')}` : ''))
      }
    }
    return lines.length ? `${lines.join('\n')}\n` : ''
  }

  // "@Recruiter screen" in the question means one specific recording. Say which marker it is,
  // so the model does not have to match a title to a recording by guesswork.
  const tags = (opts.mentioned ?? []).flatMap((m) => {
    const hit = marked.find((x) => x.id === m.id && x.row)
    return hit ? [`@${m.label ?? m.title} = the recording titled "${m.title}", recording [${hit.marker}]`] : []
  })
  const people = (opts.personTags ?? []).map((p) => {
    const on = marked.filter((x) => x.row && p.sessions.includes(x.id)).map((x) => `[${x.marker}]`)
    const who = [p.email && `<${p.email}>`, p.role, p.company].filter(Boolean).join(', ')
    return (
      `@${p.label} = the person ${p.name}${who ? ` (${who})` : ''}. ` +
      (on.length ? `They were on recordings ${on.join(' ')}.` : 'None of the recordings supplied involve them.') +
      (p.sessions.length > on.length ? ` They are on ${p.sessions.length} recordings in total; only these were supplied.` : '')
    )
  })
  const taggedNote =
    (tags.length
      ? `The user tagged these recordings with @. Each tag means exactly that recording; answer ` +
        `about it specifically and cite it:\n${tags.join('\n')}\n\n`
      : '') +
    (people.length
      ? `The user tagged these people with @. Only the recordings listed for a person involve ` +
        `them. When asked to show or list someone's conversations, give one short line per ` +
        `recording, newest first, each with its date and citation:\n${people.join('\n')}\n\n`
      : '') +
    (tags.length || people.length
      ? 'The @ labels are shorthand the user typed. In your answer, call recordings and people by ' +
        'their real title or name, never by the @ label.\n\n'
      : '')

  // Picked conversations go under the recording of the same meeting that is being read (a file
  // of it that was chosen), in full, so a paraphrased question still reads the right minutes.
  const meetingOf = (id: string) => (sibs ?? []).find((x) => x.id === id)?.merge_group ?? id
  const homeOf = (sessionId: string) => marked.find((x) => x.row && (x.id === sessionId || meetingOf(x.id) === meetingOf(sessionId)))?.id
  const pickedFor = (id: string) => {
    const mine = picked.filter((c) => homeOf(c.sessionId) === id)
    if (!mine.length) return ''
    return `conversations picked as likely relevant to the question, in full:\n` +
      mine.map((c) => `  >> ${c.header}\n${c.text}`).join('\n') + '\n'
  }
  const reading = marked.filter((m) => m.row).length || 1
  const fit = { cap: Math.max(MAX_TRANSCRIPT_CHARS, Math.floor(ANSWER_TRANSCRIPT_BUDGET / reading)), terms: keyTerms(opts.question, 10) }
  const corpus = marked
    .filter((m) => m.row)
    .map((m) => {
      const r = m.row as IndexRow & {
        user_notes?: string | null
        transcript?: Transcript | null
        transcript_edits?: Record<string, string> | null
        speaker_map?: SpeakerMap | null
      }
      return (
        `--- [${m.marker}] recording ${r.id}\n` +
        // A later file of a joined meeting goes by the meeting's title: its own was written from
        // that hour alone, and two titles for one recording confused every answer.
        `title: ${(parts.get(r.id)?.part ?? 1) > 1 ? parts.get(r.id)!.title ?? r.title ?? 'untitled' : r.title ?? 'untitled'}\n` +
        (parts.get(r.id) && parts.get(r.id)!.of > 1
          ? `part ${parts.get(r.id)!.part} of ${parts.get(r.id)!.of} of "${parts.get(r.id)!.title ?? 'a joined meeting'}"; it starts at ${clock(offsetOf(r.id))}, and every time below already counts from the start of the whole meeting. ` +
            `Call it "${eventName(parts.get(r.id)!.title) || parts.get(r.id)!.title}" in your answer; the notes below were written for this file alone and may give it another name.\n`
          : '') +
        `date: ${(r.recorded_at ?? r.created_at).slice(0, 10)}\n` +
        `type: ${r.meeting_type ?? 'unknown'}\n` +
        (r.client_name ? `with: ${r.client_name}\n` : '') +
        (r.user_notes ? `their own notes: ${r.user_notes.slice(0, 1500)}\n` : '') +
        `extracted notes: ${JSON.stringify(r.notes ?? {})}\n` +
        namesBlock(r.id, (r.transcript?.utterances ?? []).map((u) => u.speaker)) +
        pickedFor(r.id) +
        `transcript:\n${dialogueOf(r.transcript, r.transcript_edits, r.speaker_map, fit, offsetOf(r.id))}\n`
      )
    })
    .join('\n')

  const ans = await anthropic.messages.parse({
    model: opts.model ?? MODEL,
    max_tokens: 16000,
    system:
      `You answer questions about someone's own archive of recorded meetings. Today is ${today}.\n\n` +
      '- Each recording gives you its extracted notes AND its transcript. The transcript is what ' +
      'was actually said: prefer it for anything specific, and use it whenever the notes are ' +
      'silent on the question.\n' +
      '- Answer only from the recordings supplied. If they do not settle it, say so.\n' +
      '- Cite inline with the bracketed number each recording was given, e.g. [2]. Every factual ' +
      'claim needs a marker, and never cite a number you were not given.\n' +
      '- PLAIN PROSE ONLY. The answer is rendered as plain text, so markdown does not format — ' +
      'asterisks, hashes and numbered headings appear literally on screen. No **bold**, no ' +
      'headings, no bulleted or numbered lists. Paragraphs and sentences.\n' +
      '- Be brief. Answer the question asked and stop; a few short paragraphs, not a report. ' +
      'Detail belongs in the recording, not in a wall of text. Do not restate the question.\n' +
      '- When several recordings agree, cite them together, e.g. [1][3].\n' +
      '- The citations list has ONE entry per recording, not one per claim. If you cite [1] ' +
      'twelve times in the prose, [1] still appears once in the list.\n' +
      '- These are the USER\'S OWN recordings, and a diarised transcript labels speakers A and B ' +
      'without saying which is them. Do not decide who the user was. Say "the interviewer" and ' +
      '"the candidate", or name people the transcript names; never write "you said" or "you ' +
      'interviewed" unless the transcript makes it explicit.\n' +
      '- When you mention a moment or a conversation, name the event or recording by its title and give the time ' +
      'range from the start of the whole recording (e.g. "at Payments conference networking, 6:28–6:41"). Never ' +
      'mention parts, files or conversation numbers: to the user it is one recording.\n' +
      '- Some recordings list "names heard" and, for events, "conversations" with time ranges. ' +
      'For "who did I talk to about X": give the conversation\'s time range, and either the name ' +
      'the user confirmed or the name options with why (e.g. "probably Pedro: he was called Pedro ' +
      'twice"), saying plainly when no name was said. Suggest confirming the name on the recording ' +
      'page. Never present an unconfirmed option as certain. A name "confirmed by the user" is who that ' +
      'conversation was with, even if the transcript never says it: answer with it.\n' +
      '- Long transcripts show the stretches around the question\'s words, with "[… N lines not shown …]" ' +
      'where lines were left out, and each line starts with its minute ([12m], [1:05m]). If the answer ' +
      'could be in a part not shown, say so rather than guessing.\n' +
      '- Never invent names, numbers, dates or identifiers.' +
      (opts.agent ?? '') +
      REPLY_LANGUAGE,
    messages: [
      ...opts.history.slice(-6).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: `Recordings:\n\n${corpus}\n\n${taggedNote}Question: ${inQuestionLanguage(opts.question)}` },
    ],
    output_config: { format: jsonSchemaOutputFormat(ANSWER_SCHEMA), ...(opts.model && opts.effort ? { effort: opts.effort } : {}) },
  })

  const parsed = ans.parsed_output
  const answer = stripMarkdown(parsed?.answer ?? '')

  // Markers are assigned HERE, by position, when the corpus is built — the model is told which
  // number each recording has, it does not choose them. So the mapping is already known and the
  // citations array is a convenience, not the source of truth. Backfilling from it means a
  // marker in the prose always becomes a clickable pill, even on a run where the model returns
  // an incomplete list (Haiku does, intermittently) — and a marker with no pill is a dead
  // reference in an answer whose whole point is being traceable.
  // Sources show the meeting's title for every file of it, as the answer does.
  const titleFor = (id: string) => ((parts.get(id)?.part ?? 1) > 1 ? parts.get(id)!.title : null) ?? (byId.get(id) as IndexRow | undefined)?.title ?? 'Untitled'
  const byMarker = new Map(marked.map((m) => [m.marker, m.id]))
  const out = new Map<number, { marker: number; session_id: string; title: string; quote: string }>()

  for (const c of parsed?.citations ?? []) {
    if (!byId.has(c.session_id)) continue
    out.set(c.marker, {
      marker: c.marker,
      session_id: c.session_id,
      title: titleFor(c.session_id),
      quote: c.quote ?? '',
    })
  }

  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1])
    if (out.has(n)) continue
    const id = byMarker.get(n)
    if (!id || !byId.has(id)) continue
    out.set(n, { marker: n, session_id: id, title: titleFor(id), quote: '' })
  }

  const citations = Array.from(out.values()).sort((a, b) => a.marker - b.marker)
  return { answer, citations, mentioned: opts.allMentions ?? opts.mentioned ?? [] }
}

/* ------------------------------------------------------------------ store */

export async function getArchiveChat(userEmail: string): Promise<ArchiveTurn[]> {
  const { data } = await supabaseAdmin
    .from('pen_archive_chat')
    .select('messages')
    .eq('user_email', userEmail)
    .maybeSingle()
  return (data?.messages as ArchiveTurn[]) ?? []
}

export async function setArchiveChat(userEmail: string, messages: ArchiveTurn[]) {
  const { error } = await supabaseAdmin
    .from('pen_archive_chat')
    .upsert(
      { user_email: userEmail, messages: messages.slice(-40), updated_at: new Date().toISOString() },
      { onConflict: 'user_email' },
    )
  if (error) throw new Error(error.message)
}

/* ---------------------------------------------------- conversations by meaning */

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    picks: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the conversations that could answer the question, best first. Empty if none.' },
  },
  required: ['picks'],
  additionalProperties: false,
} as const

/**
 * The conversations of an event that a question is about, chosen by MEANING from their one-line
 * summaries ("disputes" finds the stretch summarised as "chargeback tooling"), returned with
 * their full text and times from the start of the meeting. The transcript fit above works on
 * words; this is what finds a paraphrase in hour 6 of a 7-hour event. One small Haiku call, only
 * when the recordings read have conversations.
 */
async function pickConversations(
  question: string,
  ids: string[],
  convos: Record<string, Segment[]>,
  parts: Map<string, PartInfo>,
  byId: Map<string, { title?: string | null }>,
  userEmail: string,
): Promise<{ sessionId: string; header: string; text: string }[]> {
  const list = ids.flatMap((id) => (convos[id] ?? []).filter((g) => g.kind !== 'other').map((g) => ({ id, g })))
  if (!list.length) return []
  const off = (id: string) => parts.get(id)?.offset ?? 0
  const titleOf = (id: string) => eventName(parts.get(id)?.title ?? byId.get(id)?.title ?? '') || 'a recording'
  const lines = list.map(({ id, g }, i) => `[${i + 1}] ${titleOf(id)} · ${clock(g.start_sec + off(id))}–${clock(g.end_sec + off(id))} · ${g.topic} · ${g.gist ?? ''}${g.confirmed_name ? ` · with ${g.confirmed_name}` : ''}`)
  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You pick which conversations, from one-line summaries, could answer a question about them. Judge by MEANING: ' +
      'the user asks in their own words ("disputes") for what may have been said differently ("chargebacks"). ' +
      'Pick at most 4, best first. Pick none if none fits.',
    messages: [{ role: 'user', content: `Conversations:\n${lines.join('\n')}\n\nQuestion: ${question}` }],
    output_config: { format: jsonSchemaOutputFormat(PICK_SCHEMA), effort: 'low' },
  })
  const chosen = (res.parsed_output?.picks ?? []).map((n) => list[Math.trunc(n) - 1]).filter(Boolean).slice(0, 4)
  if (!chosen.length) return []
  const need = Array.from(new Set(chosen.map((c) => c.id)))
  const { data } = await supabaseAdmin.from('pen_sessions').select('id,transcript,transcript_edits,speaker_map').eq('user_email', userEmail).in('id', need)
  const rows = new Map(((data ?? []) as { id: string; transcript: Transcript; transcript_edits: Record<string, string> | null; speaker_map: SpeakerMap | null }[]).map((r) => [r.id, r]))
  return chosen.flatMap(({ id, g }) => {
    const r = rows.get(id)
    const u = r?.transcript?.utterances ?? []
    if (!u.length) return []
    const text = u.slice(g.first_utt, g.last_utt + 1)
      .map((x, k) => {
        const i = g.first_utt + k
        return `[${hm(off(id) + x.start / 1000)}] ${namedDialogue([x], r!.speaker_map, r!.transcript_edits?.[String(i)] !== undefined ? { '0': r!.transcript_edits[String(i)] } : null)}`
      })
      .join('\n')
      .slice(0, 16000)
    const header = `${titleOf(id)} · ${clock(g.start_sec + off(id))}–${clock(g.end_sec + off(id))} · ${g.topic}${g.confirmed_name ? ` · with ${g.confirmed_name} (confirmed)` : ''}`
    return [{ sessionId: id, header, text }]
  })
}
