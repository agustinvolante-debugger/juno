// Sending a recording for transcription, or holding it because there is no time left.
//
// One function so the three ways a recording gets sent all enforce the allowance the same
// way: the upload itself, the app resuming held recordings when it opens, and a purchase
// landing through the Stripe webhook.

import { getSession, updateSession, createReadUrl, listSessions, type PenSession } from './store'
import { submit, hasKey } from './aai'
import { getAllowance, type Allowance } from './allowance'
import { hintsFor } from './hints'

export type StartResult =
  | { ok: true; aaiId: string; webhook: boolean }
  | { ok: false; held: true; allowance: Allowance }

/**
 * storage_path for audio that lives in AssemblyAI's storage rather than our bucket. What
 * follows the prefix is the upload URL. Nothing to delete on our side for these.
 */
export const AAI_PREFIX = 'aai:'

export async function startTranscription(email: string, session: PenSession): Promise<StartResult> {
  if (!hasKey()) throw new Error('ASSEMBLYAI_API_KEY is not set. Add it to .env.local and to the Vercel project env.')

  const allowance = await getAllowance(email)
  if (!allowance.canProcess) {
    // Kept, not refused. The audio is already in storage and it goes through the moment
    // there is time for it.
    if (session.status !== 'held') await updateSession(session.id, { status: 'held', error_text: null })
    return { ok: false, held: true, allowance }
  }

  // AssemblyAI fetches the audio itself, so it needs a URL it can reach. Short-lived.
  // A WhatsApp file was streamed into AssemblyAI's storage instead of ours; see AAI_PREFIX.
  const audioUrl = session.storage_path.startsWith(AAI_PREFIX)
    ? session.storage_path.slice(AAI_PREFIX.length)
    : await createReadUrl(session.storage_path)
  const secret = process.env.PEN_WEBHOOK_SECRET
  const base = process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL
  const webhookUrl = secret && base ? `${base.replace(/\/$/, '')}/api/pen/webhook?k=${secret}` : undefined

  // Names, vocabulary, languages and who was on the call. A failure here must not stop the
  // recording being transcribed; it just goes without the extra context.
  const hints = await hintsFor(email, session.id).catch(() => ({}))
  const t = await submit({ audioUrl, webhookUrl, ...hints })
  await updateSession(session.id, {
    aai_id: t.id,
    status: 'transcribing',
    error_text: null,
    // The moment it costs something. The duration is the browser's estimate until AssemblyAI
    // reports the real one, which replaces it.
    metered_at: new Date().toISOString(),
    metered_sec: session.duration_sec ?? 0,
  })
  return { ok: true, aaiId: t.id, webhook: Boolean(webhookUrl) }
}

/**
 * Sends held recordings, oldest first, while there is time for them.
 *
 * Re-checks the allowance before each one, so a single hour bought releases one long
 * recording rather than every held file at once.
 */
export async function resumeHeld(email: string): Promise<{ started: number; stillHeld: number }> {
  const held = (await listSessions(email))
    .filter((s) => s.status === 'held')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))

  let started = 0
  for (const s of held) {
    const fresh = await getSession(email, s.id)
    if (!fresh || fresh.status !== 'held') continue
    try {
      const r = await startTranscription(email, fresh)
      if (!r.ok) break
      started++
    } catch (e) {
      await updateSession(s.id, { status: 'error', error_text: (e as Error).message })
    }
  }
  return { started, stillHeld: held.length - started }
}
