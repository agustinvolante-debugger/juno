// What each to-do means for the person recording: is it theirs, when is it actually due, and
// who is waiting on it. Feeds Home's "Today" and the "only mine" to-do list.
//
// Why a second pass rather than trusting notes.actions[].owner: measured on the two real
// archives (29 Sep), owners were speaker letters ("A", "Speaker B") on about a third of items,
// because only 3 of 24 recordings had named speakers, and roles ("Agent co-founder (recorder)",
// "Person recording") on many more. Deadlines were words ("mañana", "Thursday, 24 September")
// relative to a recording date nothing had resolved, and 80% had none.
//
// One call per recording reads the actions with the transcript's opening (enough to tell which
// voice is the user) and returns one entry per action, in order. Stored in
// pen_sessions.action_meta, parallel to notes.actions by index, like action_done.

import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { getProfile } from './profile'
import type { PenSession } from './store'
import type { SpeakerMap } from './speakers'
import { isSelfName, namedDialogue } from './speakers'
import type { ActionMeta } from './todo-labels'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-5-5'
/** Enough dialogue to hear who is who; the actions themselves carry the rest. */
const DIALOGUE_CHARS = 30000

export { isMine, type ActionMeta, type Mine } from './todo-labels'

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Exactly one entry per action, in the same order as given.',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          mine: {
            type: 'string',
            enum: ['me', 'shared', 'other', 'unclear'],
            description:
              '"me": the person recording owes it. "shared": they owe it together with others. "other": someone else owes it. ' +
              '"unclear": cannot tell even from the transcript.',
          },
          due_date: { type: 'string', description: 'YYYY-MM-DD, or "" if no deadline was said or implied.' },
          waiting: { type: 'string', description: 'If mine/shared: the person (or company) waiting on it, by name. Else "".' },
        },
        required: ['index', 'mine', 'due_date', 'waiting'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

function weekday(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

/** "Speaker B", "A", or the user's own name is nobody waiting. Measured on the first backfill. */
function cleanWaiting(w: string, profileName?: string | null): string | null {
  const t = w.trim().replace(/\s+/g, ' ').slice(0, 60)
  if (!t || /^(speaker\s*)?[a-z]\d?$/i.test(t) || /^(the )?(user|recorder|person recording)$/i.test(t)) return null
  if (isSelfName(t, profileName)) return null
  return t
}

export async function classifyActions(session: PenSession, profileName?: string | null): Promise<ActionMeta[]> {
  const actions = session.notes?.actions ?? []
  if (!actions.length) return []
  const recorded = (session.recorded_at ?? session.created_at).slice(0, 10)
  const map = (session.speaker_map ?? null) as SpeakerMap | null
  const me = map ? Object.entries(map).find(([, e]) => e?.me) : undefined
  const utter = session.transcript?.utterances ?? []
  const dialogue = (utter.length ? namedDialogue(utter, map, session.transcript_edits) : session.transcript?.text ?? '').slice(0, DIALOGUE_CHARS)

  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system:
      'You sort the action items from one recorded meeting for the person who recorded it.\n' +
      '- Owners may be speaker letters ("A", "Speaker B"), roles ("the recorder", "Person recording", "Agent"), ' +
      'names, or blank. Use the transcript to work out whether the owner is the person recording. "The recorder", ' +
      '"Person recording", "me", "I" and the user\'s own name mean the user.\n' +
      '- An item addressed to a group that includes the user ("we", "both", "the team") is "shared".\n' +
      '- Resolve relative deadlines ("tomorrow", "Friday", "end of month", "mañana", "viernes") against the ' +
      'recording date. Leave due_date empty when no deadline was said; never invent one.\n' +
      '- waiting: for the user\'s items, the named person or organisation who asked for it or receives it (a ' +
      'client, a colleague). Use a real name from the transcript or notes; if you only have a speaker letter or ' +
      '"Speaker B", leave it empty. Never the user themselves. Empty if nobody in particular.',
    messages: [
      {
        role: 'user',
        content:
          `Person recording: ${profileName?.trim() || 'unknown name'}` +
          (me ? ` (speaker ${me[0]} in the transcript)` : '') +
          `\nRecording date: ${recorded} (${weekday(recorded)})\n` +
          (session.notes?.people?.length ? `People the notes heard: ${JSON.stringify(session.notes.people)}\n` : '') +
          `\nActions:\n${actions.map((a, i) => `${i}. ${a.action} | owner: ${a.owner || '(blank)'} | due: ${a.due || '(none)'}`).join('\n')}\n` +
          `\nTranscript (opening):\n${dialogue || '(none)'}`,
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA), effort: 'low' },
  })
  const out = res.parsed_output?.items ?? []
  return actions.map((_, i) => {
    const r = out.find((x) => x.index === i)
    const due = r && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date) ? r.due_date : null
    return r
      ? { mine: r.mine, due_date: due, waiting: cleanWaiting(r.waiting, profileName) }
      : { mine: 'unclear' as const, due_date: null, waiting: null }
  })
}

/** Classifies and saves. Never throws: a to-do list without labels still works. */
export async function refreshActionMeta(email: string, session: PenSession): Promise<ActionMeta[] | null> {
  try {
    const profile = await getProfile(email).catch(() => null)
    const meta = await classifyActions(session, profile?.name)
    const { error } = await supabaseAdmin.from('pen_sessions').update({ action_meta: meta }).eq('id', session.id)
    if (error) throw new Error(error.message)
    return meta
  } catch (e) {
    console.warn(`pen: action meta failed for ${session.id}: ${(e as Error).message}`)
    return null
  }
}
