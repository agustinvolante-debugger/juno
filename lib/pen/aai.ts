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
      language_code: 'en_us',
    }),
  })
  if (!res.ok) throw new Error(`assemblyai submit ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

export async function fetchTranscript(id: string): Promise<AaiTranscript> {
  const res = await fetch(`${BASE}/transcript/${id}`, { headers: { Authorization: key() } })
  if (!res.ok) throw new Error(`assemblyai fetch ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/** Speaker-labelled text, which is what the extraction prompt reads. */
export function toDialogue(t: AaiTranscript, max = 60000): string {
  if (t.utterances?.length) {
    const lines = t.utterances.map((u) => `Speaker ${u.speaker}: ${u.text}`)
    const joined = lines.join('\n')
    // Truncating a transcript silently would corrupt the extraction. Say so instead.
    if (joined.length <= max) return joined
    return joined.slice(0, max) + '\n\n[TRANSCRIPT TRUNCATED — showing is longer than the extraction window]'
  }
  return (t.text ?? '').slice(0, max)
}
