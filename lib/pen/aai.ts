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
export async function submit(opts: {
  audioUrl: string
  webhookUrl?: string
  speakersExpected?: number
}): Promise<AaiTranscript> {
  const res = await fetch(`${BASE}/transcript`, {
    method: 'POST',
    headers: { Authorization: key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_url: opts.audioUrl,
      speaker_labels: true,
      // An empty house is a reverb chamber and people walk between rooms. Telling the
      // model how many voices to expect measurably helps; leave it off if unsure.
      ...(opts.speakersExpected ? { speakers_expected: opts.speakersExpected } : {}),
      ...(opts.webhookUrl ? { webhook_url: opts.webhookUrl } : {}),
      punctuate: true,
      format_text: true,
      // Detect the language instead of assuming English. He is bilingual and both users are in
      // Florida, so a Spanish recording is plausible and would previously have transcribed as
      // garbled English rather than failing. Mutually exclusive with language_code.
      // Caveat: AssemblyAI wants 15-90s of speech for a reliable read, so a very short clip can
      // be misdetected. If the pairing with speaker_labels is ever rejected, submit() throws
      // with the API's own message and it surfaces in the UI rather than failing quietly.
      language_detection: true,
    }),
  })
  if (!res.ok) throw new Error(`assemblyai submit ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/**
 * Streams audio into AssemblyAI's own storage and returns the URL to transcribe from.
 *
 * Used where the file never touched our bucket: a WhatsApp file comes from Vonage and goes
 * straight here, which keeps it clear of Supabase's 50 MB per-file limit. The URL only works
 * with our API key.
 */
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
