// "Keep this audio" for one recording, shared by the recording page (PATCH sessions/[id]) and
// the WhatsApp assistant (whatsapp/tools/audio.ts). A joined meeting is one unit for the 90-day
// rule (lib/pen/audio-retention.ts), so every part gets the same answer.

import { supabaseAdmin } from '@/lib/supabase'
import type { PenSession } from './store'
import { missingColumn } from './audio-retention'

export type KeepResult = { ok: true; ids: string[] } | { ok: false; status: number; error: string }

export async function setKeepAudio(email: string, session: Pick<PenSession, 'id' | 'merge_group' | 'audio_deleted_at'>, keep: boolean): Promise<KeepResult> {
  if (session.audio_deleted_at && keep) return { ok: false, status: 410, error: 'The audio of this recording was already removed after 90 days. The transcript and notes are kept.' }
  let q = supabaseAdmin.from('pen_sessions').update({ keep_audio: keep, updated_at: new Date().toISOString() }).eq('user_email', email)
  q = session.merge_group ? q.eq('merge_group', session.merge_group) : q.eq('id', session.id)
  const { data, error } = await q.select('id')
  if (error) {
    if (missingColumn(error.message)) return { ok: false, status: 503, error: 'Keeping audio is not switched on yet. Nothing is deleted in the meantime.' }
    return { ok: false, status: 500, error: error.message }
  }
  return { ok: true, ids: (data ?? []).map((r) => r.id as string) }
}
