// Turning a conversation into a document. The chat answers the question; this writes the
// thing you actually take to the meeting.
//
// Deliberately grounded in the thread rather than re-querying the archive: by the time the
// quick-action button appears, the chat has already selected and read the relevant
// recordings and cited them. Re-running that selection would cost a second retrieval pass
// and risk drifting away from the answer the user just read and accepted.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { ArchiveTurn } from './store'
import type { DocKind } from './docs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short, specific, no colon-subtitle. Names this document.' },
    body: {
      type: 'string',
      description:
        'The document itself, in Markdown. Headings, short paragraphs and bullets. No preamble, ' +
        'no "here is your document", no closing offer of further help.',
    },
  },
  required: ['title', 'body'],
  additionalProperties: false,
} as const

export const ACTIONS: Record<DocKind, { label: string; hint: string; brief: string }> = {
  summary: {
    label: 'Build summary',
    hint: 'A written summary of what the answer covered',
    brief:
      'Write a summary of what this conversation established. Lead with the answer, then the ' +
      'supporting detail grouped sensibly. It should stand alone for someone who did not read ' +
      'the thread.',
  },
  prep: {
    label: 'Draft prep doc',
    hint: 'What to walk into the next meeting knowing',
    brief:
      'Write a preparation document for the next meeting with these people. What was agreed ' +
      'last time, what is still open, what they care about, what to ask, and anything that ' +
      'would be embarrassing to have forgotten. Written to be read five minutes beforehand.',
  },
  checklist: {
    label: 'Make a checklist',
    hint: 'The outstanding actions, as things to tick off',
    brief:
      'Write a checklist of everything outstanding, as Markdown task list items ("- [ ] ..."). ' +
      'One action per line, each starting with a verb and specific enough to act on without ' +
      'rereading the thread. Group by who owes it if that is clear.',
  },
  note: { label: 'Save as page', hint: 'Keep this answer as an editable page', brief: 'Reproduce the answer as a clean, readable page.' },
}

export async function writeArtifact(opts: {
  kind: DocKind
  messages: ArchiveTurn[]
}): Promise<{ title: string; body: string }> {
  const action = ACTIONS[opts.kind] ?? ACTIONS.summary
  const today = new Date().toISOString().slice(0, 10)

  // Only the transcript. If it isn't in the thread it doesn't belong in the document — the
  // user is about to walk into a room holding this.
  const transcript = opts.messages
    .slice(-16)
    .map((m) => `${m.role === 'user' ? 'Question' : 'Answer'}: ${m.content}`)
    .join('\n\n')

  const r = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You turn a conversation about someone\'s recorded meetings into a document they will ' +
      'use. Ground every claim in the conversation you are given: it already draws on their ' +
      'real recordings. Do not invent names, dates, numbers or commitments that are not there. ' +
      'Where the conversation is genuinely silent on something the document needs, say so in ' +
      'one short line rather than filling the gap — a prep doc that confidently states ' +
      'something false is worse than one with a hole in it. ' +
      'Write plainly. No throat-clearing, no summary of what you are about to do, no sign-off.',
    messages: [
      {
        role: 'user',
        content: `Today is ${today}.\n\n${action.brief}\n\nThe conversation:\n\n${transcript}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  })

  const out = r.parsed_output
  if (!out?.body?.trim()) throw new Error('the model returned an empty document')
  return { title: out.title?.trim() || action.label, body: out.body.trim() }
}
