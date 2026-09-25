// AssemblyAI: transcription + speaker diarization.
//
// Diarization is the whole point, not a nice-to-have. He records COUPLES, and
// "the wife loved the kitchen, the husband balked at the price" is the product.
// A single undifferentiated wall of text is worth almost nothing here.

const BASE = 'https://api.assemblyai.com/v2'

export type AaiStatus = 'queued' | 'processing' | 'completed' | 'error'

export type AaiTranscript = {
  id: string
  status: AaiStatus
  text?: string | null
  audio_duration?: number | null
  error?: string | null
  utterances?: { speaker: string; text: string; start: number; end: number; confidence?: number }[] | null
  language_code?: string | null
  language_confidence?: number | null
  speech_model_used?: string | null
  /** Present when speaker identification ran: original label -> name. */
  speech_understanding?: { response?: { speaker_identification?: { mapping?: Record<string, string> } } } | null
}

/** Everything that makes a transcript better than the bare audio allows. See transcribe.ts. */
export type SubmitHints = {
  /** Names and terms to recognise (keyterms_prompt). */
  keyterms?: string[]
  /** One or two sentences on what the audio is about (prompt). Context, not instructions. */
  context?: string
  /** Language codes the speaker uses. A hint, not a filter. */
  languages?: string[]
  /** Speaker count range. Omitted entirely when unknown: a wrong count is worse than none. */
  speakers?: { min: number; max: number }
  /** Who is on the call, for speaker identification. Needs at least two names. */
  names?: { name: string; description?: string }[]
}

function key(): string {
  const k = process.env.ASSEMBLYAI_API_KEY
  if (!k) throw new Error('ASSEMBLYAI_API_KEY is not set — add it to .env.local and Vercel env')
  return k
}

export function hasKey(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY)
}

/** Kick off a transcription. `audioUrl` must be publicly fetchable by AssemblyAI. */
export async function submit(opts: { audioUrl: string; webhookUrl?: string } & SubmitHints): Promise<AaiTranscript> {
  const body: Record<string, unknown> = {
    audio_url: opts.audioUrl,
    // Named explicitly (speech_model is deprecated). Universal-3.5 Pro covers en/es/pt and
    // switches between them mid-file; anything outside its languages falls back to U-2.
    speech_models: ['universal-3-5-pro', 'universal-2'],
    speaker_labels: true,
    ...(opts.webhookUrl ? { webhook_url: opts.webhookUrl } : {}),
    punctuate: true,
    format_text: true,
    // Detect the language instead of assuming English: recordings are in English, Spanish and
    // Portuguese, and the transcript stays in whatever was spoken.
    language_detection: true,
  }

  // A speaker count is a HARD limit to AssemblyAI, not a hint. Hard-coding 3 made nearly
  // every recording come out as exactly three speakers: solo notes split in three, two-person
  // calls with a phantom third, five-person meetings squeezed into three. So: a range when we
  // know who was there, nothing at all when we don't.
  if (opts.speakers) body.speaker_options = { min_speakers_expected: opts.speakers.min, max_speakers_expected: opts.speakers.max }
  if (opts.languages?.length) body.language_detection_options = { expected_languages: opts.languages }
  if (opts.keyterms?.length) body.keyterms_prompt = opts.keyterms
  if (opts.context) body.prompt = opts.context
  if (opts.names && opts.names.length >= 2) {
    body.speech_understanding = {
      // 'medium', measured 24 Sep: 'low' swapped the two people on a real two-person call, medium
      // got them right. Same transcript, same names.
      request: { speaker_identification: { speaker_type: 'name', effort: 'medium', speakers: opts.names } },
    }
  }

  const res = await fetch(`${BASE}/transcript`, {
    method: 'POST',
    headers: { Authorization: key(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`assemblyai submit ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

export async function uploadStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: key(), 'Content-Type': 'application/octet-stream' },
    body,
    // Node's fetch needs this to send a streamed body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  if (!res.ok) throw new Error(`assemblyai upload ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = (await res.json()) as { upload_url?: string }
  if (!j.upload_url) throw new Error('assemblyai upload returned no url')
  return j.upload_url
}

export async function fetchTranscript(id: string): Promise<AaiTranscript> {
  const res = await fetch(`${BASE}/transcript/${id}`, { headers: { Authorization: key() } })
  if (!res.ok) throw new Error(`assemblyai fetch ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/** Speaker-labelled text, which is what the extraction prompt reads. */
/**
 * `max` is a guard against an absurd input, not a budget: 60k chars was about 70 minutes of
 * speech, so a long meeting lost its ending silently. Opus 5 holds 200k tokens, and 400k
 * chars is roughly 100k tokens — about eight hours — so the cap now only catches a runaway.
 */
export function toDialogue(t: AaiTranscript, max = 400000): string {
  if (t.utterances?.length) {
    const lines = t.utterances.map((u) => `Speaker ${u.speaker}: ${u.text}`)
    const joined = lines.join('\n')
    // Truncating a transcript silently would corrupt the extraction. Say so instead.
    if (joined.length <= max) return joined
    return joined.slice(0, max) + '\n\n[TRANSCRIPT TRUNCATED — this recording is longer than the extraction window]'
  }
  return (t.text ?? '').slice(0, max)
}

/**
 * Translates a finished transcript, one line per utterance, in the same order as its
 * utterances. Runs on AssemblyAI's copy of the transcript (+$0.06/h), so the user's own
 * corrections are not carried into the translation.
 */
export async function translateTranscript(transcriptId: string, lang: string): Promise<string[]> {
  const res = await fetch('https://llm-gateway.assemblyai.com/v1/understanding', {
    method: 'POST',
    headers: { Authorization: key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript_id: transcriptId,
      speech_understanding: { request: { translation: { target_languages: [lang], match_original_utterance: true } } },
    }),
  })
  if (!res.ok) throw new Error(`assemblyai translate ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = (await res.json()) as { utterances?: { translated_texts?: Record<string, string> }[] }
  return (j.utterances ?? []).map((u) => u.translated_texts?.[lang] ?? '')
}
