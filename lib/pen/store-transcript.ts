// Saving a finished AssemblyAI transcript onto its recording.
//
// Two callers reach a finished transcript: the webhook, and the browser's polling route when
// no webhook arrives (local dev). Both go through here so names and language are saved the
// same way whichever gets there first.

import type { AaiTranscript } from './aai'
import { updateSession, type PenSession } from './store'
import { restoreLabels } from './speakers'
import { autoSpeakerMap } from './speaker-map'

export async function storeTranscript(session: PenSession, t: AaiTranscript): Promise<void> {
  // Speaker identification swaps the labels for names. Letters go back into the transcript
  // and the names into speaker_map, tied to the user and their contacts where they match.
  const restored = restoreLabels(t.utterances ?? [], t.speech_understanding?.response?.speaker_identification?.mapping)
  const speakerMap = await autoSpeakerMap(session.user_email, session.id, restored.names).catch(() => null)
  await updateSession(session.id, {
    status: 'transcribed',
    transcript: { text: t.text ?? '', utterances: restored.utterances },
    ...(speakerMap ? { speaker_map: speakerMap } : {}),
    ...(t.language_code ? { language: t.language_code } : {}),
    duration_sec: t.audio_duration ?? session.duration_sec,
    // The real length replaces the browser's estimate on the meter.
    ...(t.audio_duration ? { metered_sec: Math.round(t.audio_duration) } : {}),
    error_text: null,
  })
}
