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
import type { ArchiveTurn, PenNotes, MeetingType } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

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
      items: {
        type: 'object',
        properties: {
          marker: { type: 'integer', description: 'The number used inline, e.g. 1 for [1]' },
          session_id: { type: 'string' },
          quote: { type: 'string', description: 'A short verbatim line from that recording, or ""' },
        },
        required: ['marker', 'session_id', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['answer', 'citations'],
  additionalProperties: false,
} as const

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
  const sel = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system:
      'You pick which recordings are needed to answer a question about someone\'s archive of ' +
      'meetings. Prefer few: only what the question actually needs. Read relative dates ' +
      `("last week", "yesterday") against today's date. If nothing in the index is relevant, ` +
      'return an empty list rather than guessing.',
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

  const wanted = (sel.parsed_output?.session_ids ?? []).filter((id) => rows.some((r) => r.id === id)).slice(0, 12)
  if (!wanted.length) {
    return {
      answer:
        'Nothing in your archive covers that. Either the recordings you mean have not been ' +
        'transcribed yet, or the question is about something that was never recorded.',
      citations: [],
    }
  }

  /* ------------------------------------------------------- stage 2: answer */
  const { data: full, error: e2 } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,meeting_type,recorded_at,created_at,notes,user_notes')
    .in('id', wanted)
  if (e2) throw new Error(e2.message)

  const byId = new Map((full ?? []).map((r) => [r.id as string, r]))
  const marked = wanted.map((id, i) => ({ marker: i + 1, id, row: byId.get(id) }))

  const corpus = marked
    .filter((m) => m.row)
    .map((m) => {
      const r = m.row as IndexRow & { user_notes?: string | null }
      return (
        `--- [${m.marker}] recording ${r.id}\n` +
        `title: ${r.title ?? 'untitled'}\n` +
        `date: ${(r.recorded_at ?? r.created_at).slice(0, 10)}\n` +
        `type: ${r.meeting_type ?? 'unknown'}\n` +
        (r.client_name ? `with: ${r.client_name}\n` : '') +
        (r.user_notes ? `their own notes: ${r.user_notes.slice(0, 1500)}\n` : '') +
        `extracted notes: ${JSON.stringify(r.notes ?? {})}\n`
      )
    })
    .join('\n')

  const ans = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    system:
      `You answer questions about someone's own archive of recorded meetings. Today is ${today}.\n\n` +
      '- Answer only from the recordings supplied. If they do not settle it, say so.\n' +
      '- Cite inline with the bracketed number each recording was given, e.g. [2]. Every factual ' +
      'claim needs a marker, and never cite a number you were not given.\n' +
      '- Be brief and concrete. Prose, not headings. Do not restate the question.\n' +
      '- When several recordings agree, cite them together, e.g. [1][3].\n' +
      '- Never invent names, numbers, dates or identifiers.',
    messages: [
      ...opts.history.slice(-6).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: `Recordings:\n\n${corpus}\n\nQuestion: ${opts.question}` },
    ],
    output_config: { format: jsonSchemaOutputFormat(ANSWER_SCHEMA) },
  })

  const parsed = ans.parsed_output
  const answer = parsed?.answer ?? ''
  const citations = (parsed?.citations ?? [])
    .filter((c) => byId.has(c.session_id))
    .map((c) => ({
      marker: c.marker,
      session_id: c.session_id,
      title: (byId.get(c.session_id) as IndexRow).title ?? 'Untitled',
      quote: c.quote ?? '',
    }))

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
