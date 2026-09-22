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
import { isViewing } from '@/lib/pen/categories'
export { isViewing }
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { mustStream } from './anthropic-limits'
import type { PenNotes, MeetingType } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

const NOTES_SCHEMA = {
  type: 'object',
  properties: {
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
      description:
        'Fill ONLY when told this is a property viewing. Otherwise return empty arrays — do ' +
        'not invent reactions for a meeting that was not a viewing.',
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
    'headline', 'summary', 'people', 'decisions',
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
- A transcript may arrive in PARTS, marked "--- PART n of m ---". That is one meeting the
  recorder split because it hit its file limit, not several meetings. Write ONE set of notes
  covering all of it. Speaker labels are assigned per part and DO NOT carry across a seam:
  "Speaker A" in part two is very often a different person from "Speaker A" in part one. Work
  out who is who from names, roles and what each voice is talking about, and list each real
  person ONCE. If two labels are plainly the same person, merge them; if you genuinely cannot
  tell, say so rather than inventing an extra attendee.

On privacy, and this is not optional. Record the ACTION and drop the sensitive detail behind it
wherever the action still makes sense without it. "Chase the referral for Tuesday's admission"
rather than naming a condition. Never copy identifiers — dates of birth, record numbers,
addresses, phone numbers — into the notes. These notes are stored outside the systems the
original conversation belongs to, so carry the minimum that makes them useful.`

export async function extractNotes(
  dialogue: string,
  opts?: { category?: MeetingType | null; priorProfile?: unknown; partNotes?: PenNotes[] },
): Promise<PenNotes> {
  const cat = (opts?.category ?? '').trim()
  const forced = cat
    ? `\n\nThis recording has been categorised as: "${cat}". ` +
      (isViewing(cat)
        ? 'It IS a property viewing, so fill the showing block.'
        : 'It is NOT a property viewing, so leave every field in the showing block empty.')
    : '\n\nThe category is unknown. Leave the showing block empty unless the transcript is ' +
      'unmistakably someone being shown a property.'
  const prior = opts?.priorProfile
    ? `\n\nWhat you already know about these people from earlier meetings — use it to sharpen the ` +
      `notes, and flag anything that contradicts it under "missed":\n${JSON.stringify(opts.priorProfile)}`
    : ''

  // Coverage floor for a meeting that arrived in parts.
  //
  // Without this the last part gets compressed out of existence: measured on a real 73-minute
  // pair, one pass over the joined transcript kept 1 of part two's 5 actions, 1 of its 7
  // missed items and 0 of its 4 open questions — including the only safety concern anyone
  // raised. The model writes a fixed-size note regardless of how long the input is, and the
  // tail of a long transcript is what loses. Each part was already written up on its own
  // while it was short enough to be read properly, so those notes go back in as a floor.
  const floor = opts?.partNotes?.length
    ? `\n\nEach part was already written up separately, BEFORE they were known to be one meeting. ` +
      `Those notes are below. Treat them as a FLOOR, not a suggestion: every item in them belongs ` +
      `in your output unless one of these is true, and then say which —\n` +
      `  - it duplicates an item from another part (merge them into one, keeping the fuller wording);\n` +
      `  - a later part resolved it (fold the resolution in; an open question answered later is a ` +
      `decision or an action, not a dropped line);\n` +
      `  - it is plainly wrong on the full transcript (a name misheard, a speaker misattributed).\n` +
      `A part having been at the end of a long recording is NOT a reason to drop its items. ` +
      `Add anything the per-part notes missed because the reader could not see the whole meeting.\n\n` +
      opts.partNotes
        .map((n, i) => `Notes written for PART ${i + 1}:\n${JSON.stringify(n)}`)
        .join('\n\n')
    : ''

  // STREAMED, and it has to be.
  //
  // max_tokens is a budget for thinking AND output, not just output: Opus 5 reasons by default
  // and spends thousands of tokens doing it on a long transcript — a measured 2,197 against a
  // 3,000 ceiling — leaving too few to finish the JSON, which then failed to parse mid-string.
  // Raising the ceiling fixed that and broke something else: the SDK refuses a NON-streaming
  // request whose ceiling implies a possible ten-minute call, computed as
  // (60min x max_tokens) / 128000, so anything above 21,333 throws "Streaming is required"
  // before the request is even sent — regardless of how short the recording is.
  //
  // Streaming removes the ceiling from the equation rather than ducking under it, and
  // finalMessage() still returns a ParsedMessage, so structured output survives.
  const MAX = 32000
  // Guards the invariant rather than trusting the comment above it.
  if (!mustStream(MAX)) throw new Error('extraction expects a streamed ceiling; see anthropic-limits')

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Transcript:\n\n${dialogue}${forced}${prior}${floor}` }],
    output_config: { format: jsonSchemaOutputFormat(NOTES_SCHEMA) },
  })
  const res = await stream.finalMessage()

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
    max_tokens: 8000,
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
