// The page behind a "notion" suggestion (plan G), written on the user's yes: a short day-by-day
// study plan up to the exam, a memo outline, or prep for a meeting, from what was said on the
// recording. The same content goes to Notion when it is connected, or becomes plain Juno to-dos
// when it isn't. The dated steps are also Juno to-dos, which are what remind the user.

import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { penAnthropic } from './anthropic'
import { getSession } from './store'
import { dialogueOf } from './pipeline'
import type { Lang } from './currency'
import type { DocBlock, DocKind } from './notion'
import type { Suggestion } from './suggestions-types'

const MODEL = 'claude-haiku-5-5'
const CONTEXT_CHARS = 30_000
/** A plan longer than two weeks is a syllabus, not a nudge. */
const MAX_PLAN_DAYS = 14
const MAX_TODOS = 6
const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', pt: 'Portuguese' }

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['heading', 'paragraph', 'bullet', 'todo'] }, text: { type: 'string' } },
        required: ['type', 'text'],
        additionalProperties: false,
      },
    },
    todos: {
      type: 'array',
      description: 'The dated steps the user should be reminded of.',
      items: {
        type: 'object',
        properties: { action: { type: 'string' }, due_date: { type: 'string', description: 'YYYY-MM-DD' } },
        required: ['action', 'due_date'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'blocks', 'todos'],
  additionalProperties: false,
} as const

const BRIEF: Record<DocKind, string> = {
  study_plan:
    'A short study plan from tomorrow to the exam day: one heading per day (weekday and date), two or three concrete bullets each, ' +
    'the last day light review. Use only topics said on the recording or obvious for the subject; where the recording does not say, ' +
    'keep it general rather than inventing a syllabus. Todos: one per study day that matters (at most 6), due that day.',
  memo:
    'An outline for the memo or document the user said they would write: purpose in one paragraph, then headings with bullets of ' +
    'what was said that belongs in it, and open questions. Todos: at most 2 (draft, send), dated only if a date was said.',
  prep:
    'Prep for the meeting or interview: who and when, what they want, what was said before, what to bring, questions to ask. ' +
    'Todos: at most 2, dated before the meeting.',
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export type DocDraft = { title: string; kind: DocKind; date: string | null; blocks: DocBlock[]; todos: { action: string; due_date: string | null }[] }

export async function draftDoc(email: string, s: Suggestion, lang: Lang, today: string): Promise<DocDraft> {
  const kind = (['study_plan', 'memo', 'prep'].includes(String(s.detail.doc)) ? s.detail.doc : 'memo') as DocKind
  const date = typeof s.detail.date === 'string' ? s.detail.date : null
  const subject = String(s.detail.subject ?? s.title)
  const session = s.session_id ? await getSession(email, s.session_id).catch(() => null) : null
  const context = session ? dialogueOf(session).slice(-CONTEXT_CHARS) : ''
  const last = date ? (date > addDays(today, MAX_PLAN_DAYS) ? addDays(today, MAX_PLAN_DAYS) : date) : null

  const res = await penAnthropic('suggestion-docs').messages.parse({
    model: MODEL,
    max_tokens: 6000,
    system:
      'You write one short, practical page for the user from a recording of their conversation. Plain, specific, no filler. ' +
      'Never invent facts about people, dates or numbers that were not said.',
    messages: [{
      role: 'user',
      content:
        `Page: ${kind.replace('_', ' ')} — ${subject}\n${BRIEF[kind]}\n` +
        `Today: ${today}.${date ? ` The date that matters: ${date}.` : ''}${last && last !== date ? ` Plan only up to ${last}.` : ''}\n` +
        `What was heard: "${s.quote ?? ''}"\n` +
        (session?.notes?.summary ? `\nNotes summary:\n${session.notes.summary}\n` : '') +
        (context ? `\nTranscript (end):\n${context}\n` : '') +
        `\nWrite the title, the page and the todos in ${LANG_NAME[lang]}. Todo dates between ${today} and ${date ?? addDays(today, MAX_PLAN_DAYS)}.`,
    }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA), effort: 'low' },
  })
  const out = res.parsed_output
  if (!out) throw new Error('could not write the page')
  const hi = date ?? addDays(today, MAX_PLAN_DAYS)
  return {
    title: out.title.trim().slice(0, 200) || subject,
    kind,
    date,
    blocks: out.blocks.filter((b) => b.text.trim()).slice(0, 95).map((b) => ({ type: b.type, text: b.text.trim() })),
    todos: out.todos
      .filter((t) => t.action.trim())
      .slice(0, MAX_TODOS)
      // A memo or prep with no date said gets no invented deadlines.
      .map((t) => ({ action: t.action.trim(), due_date: (kind === 'study_plan' || date) && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) && t.due_date >= today && t.due_date <= hi ? t.due_date : null })),
  }
}
