// keep_audio: "keep the audio of the Carlos call" / "you can delete it after all". The website's
// "Keep this audio · Undo" on the recording page. Audio is otherwise deleted 90 days after upload
// (lib/pen/audio-retention.ts); transcripts and notes always stay.

import type Anthropic from '@anthropic-ai/sdk'
import { getSession } from '../../store'
import { setKeepAudio } from '../../audio-keep'
import { audioPaths, RETAIN_DAYS } from '../../audio-retention'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'keep_audio',
    description:
      `Keep (keep=true) or stop keeping (keep=false) a recording's audio. Audio is deleted ${RETAIN_DAYS} days after upload ` +
      'unless kept; the transcript and notes are always kept either way. Covers every part of a joined meeting.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The recording, from a search or list result.' },
        keep: { type: 'boolean' },
      },
      required: ['session_id', 'keep'],
      additionalProperties: false,
    },
  },
]

async function keepAudio(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const id = str(input, 'session_id')
  const s = UUID.test(id) ? await getSession(ctx.email, id) : null
  if (!s) return { error: 'no such recording' }
  const title = s.title ?? s.source_name ?? 'Untitled'
  if (!audioPaths(s.storage_path).length) return { ok: true, recording: title, note: 'This recording has no audio stored with Juno (an import or a WhatsApp file), so there is nothing to keep or delete.' }
  if (s.audio_deleted_at) return { error: `the audio file of "${title}" was already deleted on ${s.audio_deleted_at.slice(0, 10)}. Only the audio file went: the transcript, notes and everything else are kept, and the user can still search it and ask about it.` }
  const keep = input.keep === true
  const r = await setKeepAudio(ctx.email, s, keep)
  if (!r.ok) return { error: r.error }
  const until = new Date(Date.parse(s.created_at) + RETAIN_DAYS * 86_400_000).toISOString().slice(0, 10)
  return {
    ok: true,
    recording: title,
    keep,
    parts: r.ids.length,
    note: keep
      ? 'Say the audio file will be kept until they change it.'
      : `Say only the AUDIO FILE will be deleted, on or after ${until}; the transcript, notes and everything else stay, and they can still search it and ask Juno about it (it stays part of their memory).`,
  }
}

export const audioModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => (name === 'keep_audio' ? keepAudio(ctx, input) : undefined),
  prompt:
    `- Only the audio FILE is deleted, ${RETAIN_DAYS} days after upload; the transcript, notes and everything else stay searchable and askable. Say so plainly whenever audio deletion comes up. "Keep the audio of the Carlos call" is ` +
    'keep_audio with keep=true (find the recording first); "you can delete it" / "stop keeping it" is keep=false.',
}
