// Extraction. One Claude call classifies the meeting AND pulls the notes, so a recording
// dropped in by a non-technical user needs no configuration at all.
//
// Universal fields (summary, people, decisions, actions, open questions, what you missed)
// apply to every meeting. `showing` is only filled for a property viewing.
//
// PRIVACY BY DESIGN, and it is load-bearing for the clinical case: the prompt instructs the
// model to record the ACTION, not the clinical detail behind it. "Chase the cardiology
// referral for the Tuesday admission" is useful; the diagnosis is not needed in a note
// stored outside the hospital's systems. Keeps derived PHI to the minimum the job requires.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { PenNotes, MeetingType } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

const NOTES_SCHEMA = {
  type: 'object',
  properties: {
    meeting_type: {
      type: 'string',
      enum: ['showing', 'clinical', 'generic'],
      description:
        'showing = someone being shown a property. clinical = healthcare staff discussing patients, ' +
        'rounds, referrals, scheduling or clinical admin. generic = anything else.',
    },
    headline: { type: 'string', description: 'A short title for this meeting, under 60 characters.' },
    summary: { type: 'string', description: '3 to 5 sentences. What happened and where it was left.' },
    people: {
      type: 'array',
      description: 'Everyone taking part. Use names if said aloud, otherwise describe them by role.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Their name if stated, else "" ' },
          role: { type: 'string', description: 'e.g. buyer, listing agent, attending, scheduler, spouse' },
          speaker: { type: 'string', description: 'Which transcript speaker label they map to, e.g. "A"' },
          note: { type: 'string', description: 'One short line on what they wanted or were responsible for' },
        },
        required: ['name', 'role', 'speaker', 'note'],
        additionalProperties: false,
      },
    },
    decisions: {
      type: 'array',
      description: 'Things actually settled. Not topics discussed — decisions reached.',
      items: {
        type: 'object',
        properties: { decision: { type: 'string' }, who: { type: 'string' } },
        required: ['decision', 'who'],
        additionalProperties: false,
      },
    },
    actions: {
      type: 'array',
      description: 'Concrete next steps. Prefer things the person recording has to do.',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Start with a verb. Specific enough to act on without the transcript.' },
          owner: { type: 'string', description: 'Who owes it. "" if genuinely unclear.' },
          due: { type: 'string', description: 'Only if a time was mentioned, else ""' },
          priority: { type: 'string', enum: ['high', 'normal', 'low'] },
        },
        required: ['action', 'owner', 'due', 'priority'],
        additionalProperties: false,
      },
    },
    open_questions: {
      type: 'array',
      description: 'Questions raised and left unanswered.',
      items: { type: 'string' },
    },
    missed: {
      type: 'array',
      description:
        'The most valuable section. Things a busy person would plausibly have missed: a commitment ' +
        'someone else made in passing, a constraint mentioned once, a question asked of them that ' +
        'never got answered, a contradiction with something said earlier, a deadline stated casually.',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          why: { type: 'string', description: 'One line on why it matters' },
        },
        required: ['item', 'why'],
        additionalProperties: false,
      },
    },
    showing: {
      type: 'object',
      description: 'Fill ONLY when meeting_type is "showing". Otherwise use empty arrays.',
      properties: {
        reactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              feature: { type: 'string' },
              who: { type: 'string' },
              sentiment: { type: 'string', enum: ['loved', 'liked', 'neutral', 'disliked'] },
              quote: { type: 'string' },
            },
            required: ['feature', 'who', 'sentiment', 'quote'],
            additionalProperties: false,
          },
        },
        objections: {
          type: 'array',
          items: {
            type: 'object',
            properties: { objection: { type: 'string' }, who: { type: 'string' }, quote: { type: 'string' } },
            required: ['objection', 'who', 'quote'],
            additionalProperties: false,
          },
        },
        signals: {
          type: 'array',
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
          description: 'What the buyers clearly want based on what they reacted to, though never said outright.',
          items: { type: 'string' },
        },
      },
      required: ['reactions', 'objections', 'signals', 'revealed_criteria'],
      additionalProperties: false,
    },
  },
  required: [
    'meeting_type', 'headline', 'summary', 'people', 'decisions',
    'actions', 'open_questions', 'missed', 'showing',
  ],
  additionalProperties: false,
} as const

const SYSTEM = `You turn a recording of a real meeting into notes the person who was there can act on.

The audio came from a recorder in someone's pocket, so expect crosstalk, room noise, footsteps,
and speaker labels that are sometimes wrong. Read through that.

Rules that matter more than completeness:
- Only report what is in the transcript. An empty array is the right answer when nothing of that
  kind was said. Never pad a section so the output looks fuller.
- Quotes must be verbatim. If you cannot quote it exactly, use "".
- The person recording is one of the speakers. Do not log their own enthusiasm as someone else's.
- If the audio is too garbled to read, say so in summary and leave the arrays empty. That is a
  useful result, not a failure.

On privacy, and this is not optional. Record the ACTION and drop the sensitive detail behind it
wherever the action still makes sense without it. "Chase the referral for Tuesday's admission"
rather than naming a condition. Never copy identifiers — dates of birth, record numbers,
addresses, phone numbers — into the notes. These notes are stored outside the systems the
original conversation belongs to, so carry the minimum that makes them useful.`

export async function extractNotes(dialogue: string, opts?: { forceType?: MeetingType; priorProfile?: unknown }): Promise<PenNotes> {
  const forced = opts?.forceType
    ? `\n\nThe user has told you this is a "${opts.forceType}" meeting. Use that as meeting_type even if you would have guessed otherwise.`
    : ''
  const prior = opts?.priorProfile
    ? `\n\nWhat you already know about these people from earlier meetings — use it to sharpen the ` +
      `notes, and flag anything that contradicts it under "missed":\n${JSON.stringify(opts.priorProfile)}`
    : ''

  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 12000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Transcript:\n\n${dialogue}${forced}${prior}` }],
    output_config: { format: jsonSchemaOutputFormat(NOTES_SCHEMA) },
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
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['must_haves', 'dealbreakers', 'revealed_criteria', 'budget_signals', 'open_questions'],
  additionalProperties: false,
} as const

/** The compounding piece: what one set of people actually wants, learned across meetings. */
export async function updateClientProfile(prior: unknown, latest: PenNotes) {
  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You maintain a running picture of what one set of people wants, across many meetings. ' +
      'Merge the new meeting into the existing picture. Prefer patterns seen more than once. ' +
      'Drop anything the latest meeting contradicts, and do not accumulate near-duplicates. ' +
      'Keep each list short and specific enough to act on. Carry no sensitive identifiers.',
    messages: [
      { role: 'user', content: `Existing picture:\n${JSON.stringify(prior ?? {})}\n\nNewest meeting:\n${JSON.stringify(latest)}` },
    ],
    output_config: { format: jsonSchemaOutputFormat(PROFILE_SCHEMA) },
  })
  return res.parsed_output
}
