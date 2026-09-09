// "Jot and Enhance". The user writes shorthand; this expands each line using the transcript.
//
// The hard rule: it NEVER rewrites the user's words. Expansions come back as separate blocks
// that render grey beneath the black original. If enhancement edited your notes in place, the
// black/grey distinction would mean nothing and you would lose what you actually typed.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { NoteBlock, PenNotes } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

const SCHEMA = {
  type: 'object',
  properties: {
    expansions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          block_id: { type: 'string', description: 'The id of the note this expands' },
          expansion: {
            type: 'string',
            description:
              'The expanded version, or "" when the transcript does not support one. ' +
              'Complete sentences, no heading, no bullet markers, no preamble.',
          },
        },
        required: ['block_id', 'expansion'],
        additionalProperties: false,
      },
    },
  },
  required: ['expansions'],
  additionalProperties: false,
} as const

const SYSTEM = `You expand a person's shorthand meeting notes into full sentences, using the
transcript of that meeting as the source of detail.

The person wrote terse fragments during or just after the meeting. Your job is to say what they
meant, filled out with what the transcript actually shows.

Rules:
- Ground every expansion in the transcript. If the transcript does not support an expansion for a
  note, return "" for it. An empty expansion is the correct answer and is much better than a
  plausible invention.
- Never contradict the person's own note. They were in the room. If their note conflicts with your
  reading of the transcript, expand their version and do not argue.
- Add only detail that is genuinely in the recording: what was said, by whom, what followed. Do not
  add advice, opinions, or next steps — other parts of the product do that.
- Two or three sentences per note. This sits directly beneath their line, not instead of it.
- Do not restate their words verbatim as the opening. Continue the thought.
- Never invent names, numbers, dates or identifiers that are not spoken in the transcript.`

export async function enhanceBlocks(opts: {
  blocks: NoteBlock[]
  dialogue: string
  notes: PenNotes
}): Promise<Record<string, string>> {
  const userBlocks = opts.blocks.filter((b) => b.source === 'user' && b.text.trim())
  if (!userBlocks.length) return {}

  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: [
      { type: 'text', text: SYSTEM },
      // Transcript is the stable prefix; the notes change every time Enhance is pressed.
      { type: 'text', text: `Transcript of the meeting:\n\n${opts.dialogue}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content:
          `Their notes, one per line as id → text:\n` +
          userBlocks.map((b) => `${b.id} → ${b.text}`).join('\n') +
          `\n\nReturn one expansion per id.`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  })

  if (!res.parsed_output) throw new Error('enhance returned no parsed output')
  const out: Record<string, string> = {}
  for (const e of res.parsed_output.expansions) {
    if (e.expansion?.trim()) out[e.block_id] = e.expansion.trim()
  }
  return out
}
