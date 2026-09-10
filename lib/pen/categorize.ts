// Auto-categorisation, on Claude Haiku 4.5.
//
// Deliberately a SEPARATE call from extraction rather than a field on it:
//   - it is cheap and fast, so it can run the moment a transcript lands, before the slower
//     extraction finishes, and the category is what the left nav needs first
//   - it can be re-run on its own when a user rejects the guess
//   - and it means extraction stays on Opus, where note quality actually matters
//
// The category is FREE-FORM. The old three-option enum was a guess about what people record,
// and the two real users needed a fourth thing within a week. `suggestions` exist so the
// override picker can offer something better than an alphabetical list.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { COMMON_TYPES } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5'

/** Below this we show the picker instead of asserting a category. */
export const CONFIDENCE_FLOOR = 0.6

const SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      description:
        'Two or three words, sentence case, e.g. "Property viewing", "Sales call", ' +
        '"One-on-one". Describe the KIND of conversation, never its subject. Empty string ' +
        'if the transcript is too short or garbled to tell.',
    },
    confidence: { type: 'number', description: '0 to 1. Be honest — a low number is useful.' },
    alternatives: {
      type: 'array',
      description: 'Up to three other plausible categories, best first. Empty if it is obvious.',
      items: { type: 'string' },
    },
  },
  required: ['category', 'confidence', 'alternatives'],
  additionalProperties: false,
} as const

const SYSTEM = `You label what KIND of conversation a recording is, from its transcript.

- Describe the format, not the topic. "Client meeting", not "Q3 pricing". "Coffee", not
  "catching up with Dani".
- Prefer one of these when it genuinely fits, because consistent labels group usefully:
${COMMON_TYPES.map((t) => `  ${t}`).join('\n')}
  If none fits, invent a short one rather than forcing a bad match.
- A low confidence is a useful answer. Under 0.6 the product asks the user instead of
  guessing at them, so do not inflate it to seem decisive.
- Return an empty category when there is genuinely not enough to go on: a few seconds of
  audio, or a transcript that is mostly noise.
- Never include a name, company or any identifying detail in the label.`

export async function categorize(dialogue: string): Promise<{
  category: string
  confidence: number
  alternatives: string[]
}> {
  // The opening minutes carry the format almost always, and this is the cheap fast path.
  const head = dialogue.slice(0, 6000)
  if (head.trim().length < 40) return { category: '', confidence: 0, alternatives: [] }

  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 700,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Transcript (beginning):\n\n${head}` }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  })

  const p = res.parsed_output
  if (!p) return { category: '', confidence: 0, alternatives: [] }

  return {
    category: (p.category ?? '').trim().slice(0, 40),
    confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)),
    alternatives: (p.alternatives ?? []).map((a) => String(a).trim().slice(0, 40)).filter(Boolean).slice(0, 3),
  }
}
