// A second reader for the transcript: fixes what the transcriber plainly misheard.
//
// Claude cannot listen to audio, so it cannot transcribe. What it can do is read the finished
// transcript knowing the names, the vocabulary and what the conversation is about, and fix
// the words that are obviously wrong ("Bonachi" for "Vonage" when Vonage is in the
// vocabulary). The fixes are written to transcript_edits, the same overlay a user's manual
// corrections use, so AssemblyAI's original is never touched and the user can still edit.
//
// Output is only the utterances that change, which keeps it cheap: Haiku reads ~20k tokens
// per recorded hour and writes a few hundred.

import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { Utterance } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
// Sonnet, not Haiku: measured 24 Sep on a Chilean-Spanish call, Haiku made 11-14 changes of which
// ~5 were guesses (vocabulary forced in, slang "standardised"); Sonnet made 4, all correct.
const MODEL = process.env.PEN_CLEANUP_MODEL || 'claude-sonnet-5'
/** Utterances per request. Small and parallel: one 120-utterance call took 28 s. */
const CHUNK = 80

const SCHEMA = {
  type: 'object',
  properties: {
    fixes: {
      type: 'array',
      description: 'Only utterances that need a correction. Empty when the transcript is fine.',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer', description: 'The utterance number shown in brackets.' },
          text: { type: 'string', description: 'The whole corrected utterance: its words only, without the number or speaker.' },
        },
        required: ['i', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['fixes'],
  additionalProperties: false,
} as const

const SYSTEM = `You proofread a speech-to-text transcript of a real conversation. You fix words the
transcriber plainly misheard. You are not an editor.

Fix:
- A name, place, company or term from the vocabulary that the transcriber spelled wrong or split
  into sound-alike words ("Bonaje" for "Vonage").
- A word that is obviously a mishearing in context (a sound-alike that makes no sense there).

Every change must replace a word or short phrase with one that SOUNDS LIKE it. Never put a
vocabulary term where the original does not sound like that term, and never add or drop words.

Never:
- Rephrase, tidy grammar, fix capitalisation, remove filler words, or finish sentences.
- Standardise slang, dialect or swearing ("pivotear", "weón", "cachai" stay exactly as written).
- Translate. Keep every utterance in the language it is in, including mixed-language lines.
- Guess. If you are not confident what was said, leave the utterance alone. Regional slang and
  words you don't recognise are NOT errors: leave them as they are.
- Change who said it, or merge or split utterances.

Return only the utterances you changed, each in full. Most utterances need no change.`

/**
 * A correction touches a word or two. More than this is a rewrite, and measured on a real
 * Chilean-Spanish call the rewrites were the wrong ones (vocabulary forced in, words dropped).
 */
const MAX_WORDS_CHANGED = 3

/** Words that differ between two lines: longest-common-subsequence on words. */
export function wordsChanged(a: string, b: string): number {
  const x = a.split(/\s+/).filter(Boolean)
  const y = b.split(/\s+/).filter(Boolean)
  const dp: number[] = new Array(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    let prev = 0
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j]
      dp[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return Math.max(x.length, y.length) - dp[y.length]
}

export async function cleanupTranscript(
  utterances: Utterance[],
  opts: { vocabulary: string[]; context?: string },
): Promise<Record<string, string>> {
  if (utterances.length < 2) return {}
  const header =
    (opts.context ? `About this conversation: ${opts.context}\n` : '') +
    (opts.vocabulary.length ? `Names and terms that may appear, spelled correctly: ${opts.vocabulary.join(', ')}\n` : '')

  const chunks: { start: number; items: Utterance[] }[] = []
  for (let s = 0; s < utterances.length; s += CHUNK) chunks.push({ start: s, items: utterances.slice(s, s + CHUNK) })

  const results = await Promise.all(
    chunks.map(async ({ start, items }) => {
      const body = items.map((u, k) => `[${start + k}] (${u.speaker}) ${u.text}`).join('\n')
      const res = await anthropic.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: 'user', content: `${header}\nTranscript:\n${body}` }],
        output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
      })
      return (res.parsed_output as { fixes: { i: number; text: string }[] } | null)?.fixes ?? []
    }),
  )

  const edits: Record<string, string> = {}
  for (const f of results.flat()) {
    const orig = utterances[f.i]?.text
    // Strip a speaker prefix if the model copied one in anyway.
    const text = f.text?.trim().replace(/^\(?[A-Z]\)?:?\s+(?=\S)/, (m) => (orig?.startsWith(m) ? m : ''))
    // Ignore anything out of range, unchanged, or suspiciously different in length: a
    // "correction" that doubles or halves the line is a rewrite, not a fix.
    if (orig === undefined || !text || text === orig) continue
    if (wordsChanged(orig, text) > MAX_WORDS_CHANGED) continue
    edits[String(f.i)] = text
  }
  return edits
}
