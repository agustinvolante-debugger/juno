// Grounded chat over one transcript. Deliberately NOT a general assistant: it answers from
// the recording and says so plainly when the recording does not contain the answer. The whole
// point of asking your own meeting a question is that the answer is trustworthy.
import Anthropic from '@anthropic-ai/sdk'
import type { ChatTurn, PenNotes } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5'

const SYSTEM = `You answer questions about one specific meeting, using only its transcript.

- Answer from the transcript. If it is not in there, say "That is not in the recording" and stop.
  Do not reason from general knowledge to fill a gap, and do not guess.
- Quote when a quote settles it. Verbatim only.
- Speaker labels come from an imperfect diarizer. If attribution is genuinely ambiguous, say so
  rather than picking a speaker.
- Be brief. Two or three sentences unless asked to go long. The person asking was in the room.
- Never invent identifiers, dates or numbers that are not spoken in the transcript.`

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
}): Promise<string> {
  // The transcript is the stable prefix and the question is volatile, so the transcript sits
  // in `system` behind a cache breakpoint. Every follow-up question on the same recording then
  // reads the transcript from cache instead of paying for it again.
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      { type: 'text', text: SYSTEM },
      {
        type: 'text',
        text:
          `Notes already extracted from this meeting:\n${JSON.stringify(opts.notes)}\n\n` +
          `Full transcript:\n${opts.dialogue}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      ...opts.history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user' as const, content: opts.question },
    ],
  })

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}
