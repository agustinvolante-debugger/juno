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
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { stripMarkdown } from './plaintext'
import type { ArchiveTurn, PenNotes, MeetingType, Transcript } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Both stages are retrieval, not synthesis — pick the recordings, then answer from what is in
// front of you and cite it. Haiku 4.5 does that accurately, costs a fraction, and answers fast
// enough to feel like search rather than a request. Extraction stays on Opus, where the task is
// noticing what someone missed rather than reporting what they said.
const MODEL = 'claude-haiku-4-5'

type IndexRow = {
  id: string
  title: string | null
  client_name: string | null
  meeting_type: MeetingType | null
  recorded_at: string | null
  created_at: string
  notes: PenNotes
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
    answer: {
      type: 'string',
      description:
        'The answer, in plain prose. Cite recordings inline with [1], [2] markers that ' +
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
  required: ['answer', 'citations'],
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

const STOPWORDS = new Set(
  ('a about all also am an and any are as at be been but by can did do does for from get got had has have ' +
   'he her him his how i if in into is it its just me more my no not of on or our out said say she should ' +
   'so some than that the their them then there these they this to was we were what when where which who ' +
   'why will with would you your anything everything something did do tell show find search across recording ' +
   'recordings meeting meetings').split(' '),
)

/**
 * Distinctive words in the question, for a literal transcript scan.
 *
 * The selection stage reads extracted notes, so a detail the extractor didn't think notable —
 * an HOA fee, a name said once — is invisible to it even though the transcript contains it.
 * This is the cheap safety net: quoted phrases and uncommon words, matched literally.
 */
export function keyTerms(question: string): string[] {
  const quoted = Array.from(question.matchAll(/"([^"]{3,60})"/g)).map((m) => m[1].toLowerCase())
  const words = (question.toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g) ?? [])
    .filter((w) => !STOPWORDS.has(w))
  return Array.from(new Set([...quoted, ...words])).slice(0, 6)
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

/** Compact enough that hundreds of recordings still fit in the selection prompt. */
function indexLine(r: IndexRow) {
  const when = (r.recorded_at ?? r.created_at).slice(0, 10)
  const who = r.notes?.people?.map((p) => p.name || p.role).filter(Boolean).slice(0, 5).join(', ')
  return [
    `id: ${r.id}`,
    `date: ${when}`,
    `type: ${r.meeting_type ?? 'unknown'}`,
    `title: ${r.title ?? 'untitled'}`,
    r.client_name ? `with: ${r.client_name}` : '',
    who ? `people: ${who}` : '',
    r.notes?.summary ? `summary: ${r.notes.summary.slice(0, 320)}` : '',
  ]
    .filter(Boolean)
    .join(' | ')
}

/**
 * The transcript as the user sees it: AssemblyAI's utterances with their manual corrections
 * applied on top. Searching the uncorrected original would find the garbled version of a name
 * the user has already fixed.
 */
function dialogueOf(t: Transcript | null | undefined, edits: Record<string, string> | null | undefined): string {
  if (!t) return '(not transcribed)'
  const e = edits ?? {}
  const body = t.utterances?.length
    ? t.utterances.map((u, i) => `Speaker ${u.speaker}: ${e[String(i)] ?? u.text}`).join('\n')
    : (t.text ?? '')
  if (!body) return '(not transcribed)'
  return body.length > MAX_TRANSCRIPT_CHARS
    ? `${body.slice(0, MAX_TRANSCRIPT_CHARS)}\n[transcript truncated]`
    : body
}

export async function askArchive(opts: {
  userEmail: string
  question: string
  history: ArchiveTurn[]
}): Promise<{ answer: string; citations: { marker: number; session_id: string; title: string; quote: string }[] }> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,meeting_type,recorded_at,created_at,notes')
    .eq('user_email', opts.userEmail)
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as IndexRow[]
  if (!rows.length) {
    return { answer: 'There are no recordings in your archive yet.', citations: [] }
  }

  const today = new Date().toISOString().slice(0, 10)

  /* ------------------------------------------------------- stage 1: select */
  //
  // Selection exists to keep hundreds of transcripts out of one prompt. Below the answer
  // stage's own limit there is nothing to select — everything fits — and running the stage
  // anyway just adds a way to be wrong. It was: on a six-recording archive it rejected
  // relevant recordings on two of four ordinary questions, including one the per-recording
  // chat answered in detail, and the user saw "nothing in your archive covers that".
  if (rows.length <= MAX_ANSWER_ROWS) {
    return answerFrom(rows.map((r) => r.id), rows, opts, today)
  }

  const sel = await anthropic.messages.parse({
    model: MODEL,
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
          `Today is ${today}.\n\nIndex of recordings:\n${rows.map(indexLine).join('\n')}\n\n` +
          (opts.history.length
            ? `Earlier in this conversation:\n${opts.history.slice(-4).map((t) => `${t.role}: ${t.content.slice(0, 300)}`).join('\n')}\n\n`
            : '') +
          `Question: ${opts.question}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SELECT_SCHEMA) },
  })

  const picked = (sel.parsed_output?.session_ids ?? []).filter((id) => rows.some((r) => r.id === id))
  // Union, model first: what it reasoned about leads, and literal transcript hits it could not
  // have seen from the notes get appended rather than displacing them.
  const literal = await transcriptMatches(opts.userEmail, keyTerms(opts.question))
  const wanted = Array.from(new Set([...picked, ...literal.filter((id) => rows.some((r) => r.id === id))]))
    .slice(0, MAX_ANSWER_ROWS)
  // An empty selection is not evidence of an empty archive — it is one model reading short
  // summaries and being timid. Telling someone their archive has nothing on a subject it
  // demonstrably covers is the worst answer this thing can give, so fall back to the most
  // recent recordings and let the answer stage decide against the actual transcripts. It is
  // grounded and will say "that is not in these recordings" when that is genuinely true.
  const rowsToRead = wanted.length ? wanted : rows.slice(0, MAX_ANSWER_ROWS).map((r) => r.id)

  return answerFrom(rowsToRead, rows, opts, today)
}

/* --------------------------------------------------------- stage 2: answer */

async function answerFrom(
  wanted: string[],
  rows: IndexRow[],
  opts: { userEmail: string; question: string; history: ArchiveTurn[] },
  today: string,
): Promise<{ answer: string; citations: { marker: number; session_id: string; title: string; quote: string }[] }> {
  wanted = wanted.slice(0, MAX_ANSWER_ROWS)
  const { data: full, error: e2 } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,meeting_type,recorded_at,created_at,notes,user_notes,transcript,transcript_edits')
    .in('id', wanted)
  if (e2) throw new Error(e2.message)

  const byId = new Map((full ?? []).map((r) => [r.id as string, r]))
  const marked = wanted.map((id, i) => ({ marker: i + 1, id, row: byId.get(id) }))

  const corpus = marked
    .filter((m) => m.row)
    .map((m) => {
      const r = m.row as IndexRow & {
        user_notes?: string | null
        transcript?: Transcript | null
        transcript_edits?: Record<string, string> | null
      }
      return (
        `--- [${m.marker}] recording ${r.id}\n` +
        `title: ${r.title ?? 'untitled'}\n` +
        `date: ${(r.recorded_at ?? r.created_at).slice(0, 10)}\n` +
        `type: ${r.meeting_type ?? 'unknown'}\n` +
        (r.client_name ? `with: ${r.client_name}\n` : '') +
        (r.user_notes ? `their own notes: ${r.user_notes.slice(0, 1500)}\n` : '') +
        `extracted notes: ${JSON.stringify(r.notes ?? {})}\n` +
        `transcript:\n${dialogueOf(r.transcript, r.transcript_edits)}\n`
      )
    })
    .join('\n')

  const ans = await anthropic.messages.parse({
    model: MODEL,
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
      '- Never invent names, numbers, dates or identifiers.',
    messages: [
      ...opts.history.slice(-6).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: `Recordings:\n\n${corpus}\n\nQuestion: ${opts.question}` },
    ],
    output_config: { format: jsonSchemaOutputFormat(ANSWER_SCHEMA) },
  })

  const parsed = ans.parsed_output
  const answer = stripMarkdown(parsed?.answer ?? '')

  // Markers are assigned HERE, by position, when the corpus is built — the model is told which
  // number each recording has, it does not choose them. So the mapping is already known and the
  // citations array is a convenience, not the source of truth. Backfilling from it means a
  // marker in the prose always becomes a clickable pill, even on a run where the model returns
  // an incomplete list (Haiku does, intermittently) — and a marker with no pill is a dead
  // reference in an answer whose whole point is being traceable.
  const byMarker = new Map(marked.map((m) => [m.marker, m.id]))
  const out = new Map<number, { marker: number; session_id: string; title: string; quote: string }>()

  for (const c of parsed?.citations ?? []) {
    if (!byId.has(c.session_id)) continue
    out.set(c.marker, {
      marker: c.marker,
      session_id: c.session_id,
      title: (byId.get(c.session_id) as IndexRow).title ?? 'Untitled',
      quote: c.quote ?? '',
    })
  }

  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1])
    if (out.has(n)) continue
    const id = byMarker.get(n)
    if (!id || !byId.has(id)) continue
    out.set(n, { marker: n, session_id: id, title: (byId.get(id) as IndexRow).title ?? 'Untitled', quote: '' })
  }

  const citations = Array.from(out.values()).sort((a, b) => a.marker - b.marker)
  return { answer, citations }
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
