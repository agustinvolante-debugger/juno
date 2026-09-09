// Feature 3 — turn one line of a note into something you can actually send.
//
// The unit is a single item (an action, a takeaway, a missed thing), not the whole meeting,
// because the friction being removed is "I know what I owe someone, I just don't want to write
// the email". Whole-meeting summaries already exist elsewhere in the product.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { PenNotes, Deliverable } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

export type DeliverableKind = Deliverable['kind']

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short label for this deliverable, under 60 chars.' },
    recipient: { type: 'string', description: 'For an email: who it goes to, by name or role. Else "".' },
    subject: { type: 'string', description: 'For an email: the subject line. Else "".' },
    body: {
      type: 'string',
      description:
        'The deliverable itself, ready to paste. Plain text with blank lines between paragraphs. ' +
        'No markdown headings, no code fences, no commentary about what you produced.',
    },
  },
  required: ['title', 'recipient', 'subject', 'body'],
  additionalProperties: false,
} as const

const SHARED = `You draft from someone's own meeting notes. What you produce gets sent or filed, so
it has to be usable as-is.

Non-negotiable:
- Use only what is in the notes and transcript supplied. Never invent a name, number, date,
  price, address or commitment that is not there.
- Where a detail is genuinely missing, leave a clearly marked gap like [date] rather than
  guessing. A visible blank is honest; an invented specific is not.
- No preamble, no sign-off about being an AI, no explanation of what you wrote.
- Match the register of the notes: a working professional writing quickly to someone they know.
- Never include patient, medical or other sensitive detail unless it is essential to the point,
  and never include identifiers such as dates of birth or record numbers.`

const BY_KIND: Record<DeliverableKind, string> = {
  email: `Write a short email. Four to eight sentences. Open with the reason for writing, state
what you are doing or asking, and close with a concrete next step. Set recipient and subject.
If the notes do not make the recipient obvious, use the role, e.g. "the listing agent".`,

  memo: `Write a brief internal memo about this item. Context in a sentence or two, then what was
decided or is outstanding, then what happens next and who owns it. No headings — flowing
paragraphs. Something a colleague could read in thirty seconds and be caught up.`,

  tracker: `Produce a tracker entry, one field per line, in exactly this shape and nothing else:

Task: <imperative, specific>
Owner: <name or role, or "unassigned">
Due: <date if stated, else "not set">
Priority: <high | normal | low>
Source: <meeting title and date>
Context: <one sentence a stranger could act on>`,
}

export async function draftDeliverable(opts: {
  kind: DeliverableKind
  item: string
  notes: PenNotes
  sessionTitle: string
  sessionDate: string
  clientName?: string | null
  userNotes?: string | null
}): Promise<Omit<Deliverable, 'id' | 'ts'>> {
  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    system: `${SHARED}\n\n${BY_KIND[opts.kind]}`,
    messages: [
      {
        role: 'user',
        content:
          `Meeting: ${opts.sessionTitle} (${opts.sessionDate})\n` +
          (opts.clientName ? `With: ${opts.clientName}\n` : '') +
          (opts.userNotes ? `\nTheir own notes:\n${opts.userNotes.slice(0, 3000)}\n` : '') +
          `\nExtracted notes:\n${JSON.stringify(opts.notes)}\n\n` +
          `Draft a ${opts.kind} for this specific item:\n"${opts.item}"`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  })

  if (!res.parsed_output) throw new Error('deliverable returned no parsed output')
  const p = res.parsed_output

  // Emails carry their headers inside the body so one Copy gives you the whole thing.
  const body =
    opts.kind === 'email' && (p.recipient || p.subject)
      ? `To: ${p.recipient || '[recipient]'}\nSubject: ${p.subject || '[subject]'}\n\n${p.body}`
      : p.body

  return { kind: opts.kind, title: p.title, body, ref: opts.item.slice(0, 240) }
}
