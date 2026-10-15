// Grounded chat over one transcript. Deliberately NOT a general assistant: it answers from
// the recording and says so plainly when the recording does not contain the answer. The whole
// point of asking your own meeting a question is that the answer is trustworthy.
import Anthropic from '@anthropic-ai/sdk'
import { penAnthropic } from './anthropic'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { stripMarkdown } from './plaintext'
import type { ChatTurn, PenNotes } from './store'
import { REPLY_LANGUAGE, inQuestionLanguage } from './reply-language'

const anthropic = penAnthropic('chat')
// The transcript is already in context; the job is to read it and answer accurately, which is
// Haiku's shape. See lib/pen/archive.ts for the same reasoning.
const MODEL = 'claude-haiku-5-5'

// The language is named before the answer is written: without it a Portuguese question after a
// Spanish one was answered in Spanish (the two are close). Same pattern as archive.ts.
const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    language: {
      type: 'string',
      description:
        'The language the LATEST question is written in, e.g. "Portuguese". Look at its words: ' +
        '"e", "de risco", "você", "não" are Portuguese; "y", "de riesgo", "tú" are Spanish. Ignore earlier turns and the transcript.',
    },
    answer: { type: 'string', description: 'The answer, written in the language named in "language".' },
  },
  required: ['language', 'answer'],
  additionalProperties: false,
} as const

const SYSTEM = `You answer questions about one specific meeting, using only its transcript.

- Answer from the transcript. Do not reason from general knowledge to fill a gap, and do not
  guess. If nothing in it matches, even by meaning, say "That is not in the recording". If only
  something close matches (they ask about "invoices" and the talk was about purchase orders),
  lead with that closest match (never open with "That is not in the recording" when you then
  give one) and say plainly how it differs.
- Quote when a quote settles it. Verbatim only.
- Speaker labels come from an imperfect diarizer. If attribution is genuinely ambiguous, say so
  rather than picking a speaker.
- Be brief. Two or three sentences unless asked to go long. The person asking was in the room.
- Plain prose only. The answer is rendered as plain text, so **asterisks**, # headings and
  bulleted lists appear literally on screen rather than formatting.
- Never invent identifiers, dates or numbers that are not spoken in the transcript.
- Match by meaning, not only by words: the user asks in their own words ("disputes") for
  something that may have been said differently ("chargebacks").
- Each line starts with its time from the start of the meeting, [h:mm]. When you point to a
  moment, give that time ("at 6:33"). Long meetings come in parts; times already count from
  the very start, so never restart them per part, and don't mention parts at all.
- When the recording lists conversations (an event), say which one by its time range and
  topic, and for who it was, the confirmed name or the name options with why; never present
  an option as certain.
- A name marked "(confirmed)" in the conversations list was given by the user: it is who that
  conversation was with, even when the transcript never says it. Answer with it ("that was
  Gordon, at 1:35–1:40").`

export function suggestedQuestions(notes: PenNotes): string[] {
  const t = notes.meeting_type
  const base = ['What did I commit to?', 'What did I miss?', 'Was anything left unresolved?']
  if (t === 'showing') {
    return ['What did they actually like?', 'What were the objections?', 'Did they signal they would come back?', ...base.slice(0, 1)]
  }
  if (t === 'clinical') {
    return ['What needs doing before the end of today?', 'Who owes me something?', 'What did I agree to follow up on?', ...base.slice(1, 2)]
  }
  return base
}

export async function askTranscript(opts: {
  dialogue: string
  notes: PenNotes
  history: ChatTurn[]
  question: string
  /** The user's own profile as a prompt paragraph. See lib/pen/profile.ts. */
  agent?: string
  /** An event's conversations, one line each (time range, topic, gist, names). */
  conversations?: string
}): Promise<string> {
  // The transcript is the stable prefix and the question is volatile, so the transcript sits
  // in `system` behind a cache breakpoint. Every follow-up question on the same recording then
  // reads the transcript from cache instead of paying for it again.
  const res = await anthropic.messages.parse({
    model: MODEL,
    // max_tokens is a budget for thinking AND output, not just output. Opus 5 reasons by
    // default, and on a long input it happily spends thousands of tokens doing it — a
    // measured 2,197 of a 3,000 ceiling — leaving too few to finish the JSON, which then
    // fails to parse mid-string. Ceilings here are sized for both; unused tokens cost
    // nothing, a truncated answer costs the whole request.
    // 16k: a 7-hour event is ~90k tokens of transcript, and the thinking grows with it.
    max_tokens: 16000,
    system: [
      { type: 'text', text: SYSTEM + (opts.agent ?? '') + REPLY_LANGUAGE },
      {
        type: 'text',
        text:
          `Notes already extracted from this meeting:\n${JSON.stringify(opts.notes)}\n\n` +
          (opts.conversations ? `Conversations in this recording (an event):\n${opts.conversations}\n\n` : '') +
          `Full transcript:\n${opts.dialogue}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      ...opts.history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: inQuestionLanguage(opts.question) },
    ],
    output_config: { format: jsonSchemaOutputFormat(ANSWER_SCHEMA) },
  })

  const parsed = res.parsed_output as { language: string; answer: string } | null
  // "That is not in the recording. The closest match is…" contradicts itself; Haiku opens that
  // way despite the prompt, so the denial goes when a match follows it.
  if (parsed?.answer) parsed.answer = parsed.answer.replace(/^That is not in the recording\.\s+(?=(The )?closest match)/i, '')
  return stripMarkdown(
    parsed?.answer ??
      res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(''),
  )
}
