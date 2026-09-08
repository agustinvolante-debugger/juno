// The realtor-specific extraction. This file is the only part of the product a generic
// notetaker (Granola et al.) does not already do for free, so it is where the value is.
//
// Deliberately NOT a meeting summary. Per showing we want reactions room by room,
// objections, buying signals, and the criteria the couple revealed without stating.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { PenNotes } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

const SHOWING_SCHEMA = {
  type: 'object',
  properties: {
    client_name: { type: 'string', description: 'Buyer name(s) if stated, else empty string' },
    summary: { type: 'string', description: '2-4 sentences. What happened and where it left off.' },
    reactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          feature: { type: 'string', description: 'The room or feature, e.g. "kitchen", "backyard", "primary bath"' },
          who: { type: 'string', description: 'Which person, using whatever identifier the transcript supports' },
          sentiment: { type: 'string', enum: ['loved', 'liked', 'neutral', 'disliked'] },
          quote: { type: 'string', description: 'Short verbatim quote, or empty string' },
        },
        required: ['feature', 'who', 'sentiment', 'quote'],
        additionalProperties: false,
      },
    },
    objections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          objection: { type: 'string' },
          who: { type: 'string' },
          quote: { type: 'string' },
        },
        required: ['objection', 'who', 'quote'],
        additionalProperties: false,
      },
    },
    signals: {
      type: 'array',
      description: 'Buying signals: asking to return, talking about furniture placement, mortgage or timeline questions.',
      items: {
        type: 'object',
        properties: {
          signal: { type: 'string' },
          strength: { type: 'string', enum: ['strong', 'medium', 'weak'] },
          quote: { type: 'string' },
        },
        required: ['signal', 'strength', 'quote'],
        additionalProperties: false,
      },
    },
    revealed_criteria: {
      type: 'array',
      description: 'What they want but never said outright, inferred from what they reacted to. e.g. "needs a garage".',
      items: { type: 'string' },
    },
    followups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Concrete next action for the agent' },
          due: { type: 'string', description: 'When, if the transcript implies one, else empty string' },
        },
        required: ['action', 'due'],
        additionalProperties: false,
      },
    },
  },
  required: ['client_name', 'summary', 'reactions', 'objections', 'signals', 'revealed_criteria', 'followups'],
  additionalProperties: false,
} as const

const SYSTEM = `You read transcripts of real estate showings and pull out what the agent needs.

The recording is made on a device in the agent's shirt pocket while walking a property, so
expect crosstalk, background noise, HVAC, footsteps, and speaker labels that may be imperfect.

Rules:
- Only report what is actually in the transcript. An empty array is the correct answer when
  nothing of that kind was said. Never pad a section to make the output look fuller.
- Prefer the couple's own words. Quotes must be verbatim; if you cannot quote it, use "".
- The agent is one of the speakers. Do not record the agent's own enthusiasm as a buyer reaction.
- "revealed_criteria" is the valuable field: what the buyers clearly want based on what they
  reacted to, especially when they never said it directly.
- If the transcript is too garbled to read, say so in summary and leave the arrays empty.`

export async function extractShowing(dialogue: string, priorProfile?: unknown): Promise<PenNotes> {
  const prior = priorProfile
    ? `\n\nWhat you already know about these buyers from earlier showings (use it to sharpen ` +
      `revealed_criteria, and note anything that contradicts it):\n${JSON.stringify(priorProfile)}`
    : ''

  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Showing transcript:\n\n${dialogue}${prior}` }],
    output_config: { format: jsonSchemaOutputFormat(SHOWING_SCHEMA) },
  })

  if (!res.parsed_output) throw new Error('extraction returned no parsed output')
  return res.parsed_output as PenNotes
}

const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    must_haves: { type: 'array', items: { type: 'string' } },
    dealbreakers: { type: 'array', items: { type: 'string' } },
    revealed_criteria: { type: 'array', items: { type: 'string' } },
    budget_signals: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' }, description: 'What the agent still does not know' },
  },
  required: ['must_haves', 'dealbreakers', 'revealed_criteria', 'budget_signals', 'open_questions'],
  additionalProperties: false,
} as const

/**
 * The compounding piece. After ten showings this is a learned model of what one specific
 * couple actually wants — the part his CRM will never give him, and the reason this is a
 * product rather than a transcription wrapper.
 */
export async function updateClientProfile(prior: unknown, latest: PenNotes) {
  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You maintain a running picture of what one set of home buyers wants, across many showings. ' +
      'Merge the new showing into the existing picture. Prefer patterns seen more than once. ' +
      'Drop anything the latest showing contradicts, and do not accumulate near-duplicates. ' +
      'Keep each list short and specific enough for an agent to act on.',
    messages: [
      {
        role: 'user',
        content:
          `Existing picture:\n${JSON.stringify(prior ?? {})}\n\n` +
          `Newest showing:\n${JSON.stringify(latest)}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(PROFILE_SCHEMA) },
  })
  return res.parsed_output
}
