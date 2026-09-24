// Juno Pen on WhatsApp: what happens to each message.
//
//   LINK 123456        claims the code from Settings and ties this phone to the account.
//   a file             asks for the all-party consent tap, then streams the file to
//                      AssemblyAI and runs the same pipeline as a web upload. The briefing
//                      comes back here (and by email) from the AssemblyAI webhook.
//   any other text     a question for the archive, answered from the user's own recordings.
//
// Meta bars general-purpose AI chatbots on the business platform, so the agent answers from
// the recordings and nothing else. askArchive already refuses to go outside them.

import { ALLOWED_EMAILS } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { isActive } from '../accounts'
import { getAllowance } from '../allowance'
import { askArchive } from '../archive'
import { uploadStream } from '../aai'
import { briefFor } from '../profile'
import { createSession, updateSession, type PenSession } from '../store'
import { startTranscription, AAI_PREFIX } from '../transcribe'
import { fmtHours } from '../plan'
import { sendText, sendButtons, openMedia, type Inbound } from './vonage'
import {
  claimCode,
  getLinkByEmail,
  getLinkByPhone,
  getMessage,
  moveMessage,
  recordInbound,
  setChat,
  type Link,
} from './store'

function appUrl(path = ''): string {
  const base = (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  return `${base}${path}`
}

const AUDIO_EXT = /\.(wav|wave|mp3|m4a|aac|ogg|opus|oga|webm|amr|3gp|flac|aif|aiff|wma|mp4|m4v|mov)$/i

const HELP =
  'I\'m Juno Pen.\n\n' +
  '• Send me a recording (the WAV from your pen, or any audio file) and I\'ll send the briefing back here.\n' +
  '• Ask me anything about your calls, like "what did Chris say about the Malibu house?"\n' +
  '• Send "new" to start a fresh conversation.'

/** Everything that arrives at the inbound webhook ends up here, after the 200 has gone back. */
export async function handleInbound(msg: Inbound): Promise<void> {
  const link = await getLinkByPhone(msg.from)

  // Recorded before anything else so a Vonage retry of the same message is a no-op.
  const fresh = await recordInbound({
    id: msg.id,
    phone: msg.from,
    email: link?.email ?? null,
    kind: msg.kind,
    state: 'received',
    payload: { mediaUrl: msg.mediaUrl, fileName: msg.fileName, raw: msg.raw },
  })
  if (!fresh) return

  const code = /^\s*link\s+(\d{6})\s*$/i.exec(msg.text)
  if (msg.kind === 'text' && code) return linkPhone(msg, code[1])

  if (!link) {
    await sendText(
      msg.from,
      'Hi, this is Juno Pen. This number isn\'t linked to an account yet.\n\n' +
        `Open ${appUrl('/settings/whatsapp')} while signed in and send me the code it shows.\n\n` +
        `No account yet? Start here: ${appUrl()}`,
    )
    return
  }
  if (!(await allowed(link.email))) {
    await sendText(msg.from, `Your Juno Pen account isn't active. You can pick a plan at ${appUrl()}.`)
    return
  }

  if (msg.kind === 'media') return askConsent(msg)
  if (msg.kind === 'reply') return onReply(msg, link)
  if (msg.kind === 'text') return onText(msg, link)
  await sendText(msg.from, 'I can read recordings and text messages. Send me the WAV from your pen, or ask me about a call.')
}

async function allowed(email: string): Promise<boolean> {
  if (ALLOWED_EMAILS.includes(email.toLowerCase())) return true
  return isActive(email).catch(() => false)
}

async function linkPhone(msg: Inbound, code: string): Promise<void> {
  const link = await claimCode(code, msg.from)
  if (!link) {
    await sendText(msg.from, `That code didn't work. Codes last 30 minutes. Get a fresh one at ${appUrl('/settings/whatsapp')}.`)
    return
  }
  await sendText(msg.from, `Linked to ${link.email}. ✅\n\n${HELP}`)
}

/* ------------------------------------------------------------------ files */

async function askConsent(msg: Inbound): Promise<void> {
  if (!msg.mediaUrl) {
    await sendText(msg.from, 'That file arrived without its contents. Could you send it again?')
    return
  }
  if (msg.fileName && !AUDIO_EXT.test(msg.fileName)) {
    await moveMessage(msg.id, 'received', 'cancelled')
    await sendText(msg.from, `${msg.fileName} doesn't look like a recording. Send me the WAV file from your pen.`)
    return
  }
  const link = (await getLinkByPhone(msg.from))!
  const allowance = await getAllowance(link.email)
  if (!allowance.canProcess) {
    await moveMessage(msg.id, 'received', 'cancelled')
    await sendText(msg.from, outOfHours())
    return
  }

  await moveMessage(msg.id, 'received', 'consent')
  // Florida is all-party consent (Fla. Stat. § 934.03) and our users are licensed
  // professionals. Same rule as the web upload: refused until confirmed, never defaulted.
  await sendButtons(
    msg.from,
    `Got ${msg.fileName ?? 'your recording'}.\n\nOne tap before I write it up: did everyone on this recording agree to be recorded?`,
    // One button on purpose. Not tapping it is the "no": the file is never processed and
    // Vonage drops it after 48 hours.
    [{ id: `consent:${msg.id}`, title: 'Everyone agreed' }],
  )
}

function outOfHours(): string {
  return `You're out of recording hours for this month. Buy more at ${appUrl('/settings/hours')} and send the file again.`
}

async function onReply(msg: Inbound, link: Link): Promise<void> {
  const [action, id] = (msg.replyId ?? '').split(':')
  const file = id ? await getMessage(id) : null
  if (!file || file.phone !== msg.from) {
    await sendText(msg.from, 'I lost track of that file. Could you send it again?')
    return
  }

  if (action === 'cancel') {
    if (await moveMessage(file.id, 'consent', 'cancelled')) {
      await sendText(msg.from, 'Okay, I won\'t transcribe it. Nothing was kept.')
    } else if (file.state === 'accepted' || file.state === 'done') {
      // Tapped after "Everyone agreed". Say so rather than let them think it was stopped.
      await sendText(msg.from, `That one is already being transcribed, so I couldn't stop it. You'll find it at ${appUrl()}.`)
    }
    return
  }
  if (action !== 'consent') return
  // A double tap lands here twice; only the first one moves the row.
  if (!(await moveMessage(file.id, 'consent', 'accepted'))) return

  try {
    const r = await transcribeFile(link.email, file.payload.mediaUrl ?? '', file.payload.fileName ?? nameFromRaw(file.payload.raw))
    await moveMessage(file.id, 'accepted', r.ok ? 'done' : 'cancelled', { session_id: r.session?.id ?? null })
    await sendText(msg.from, r.ok ? `Transcribing now${r.minutes ? ` (about ${r.minutes} min of audio)` : ''}. I'll send the briefing here in a few minutes.` : r.message)
  } catch (e) {
    await moveMessage(file.id, 'accepted', 'failed')
    console.warn(`pen whatsapp: file ${file.id} failed: ${(e as Error).message}`)
    await sendText(msg.from, 'Something went wrong receiving that file, and nothing was transcribed. Try sending it again, or upload it on the website.')
  }
}

/** For rows recorded before the parser read audio.name. */
function nameFromRaw(raw: unknown): string | null {
  const r = (raw ?? {}) as Record<string, { name?: string } | undefined>
  return r.audio?.name ?? r.file?.name ?? r.video?.name ?? null
}

async function transcribeFile(
  email: string,
  mediaUrl: string,
  fileName: string | null,
): Promise<{ ok: true; session: PenSession; minutes: number | null } | { ok: false; session?: PenSession; message: string }> {
  // Checked again: hours may have run out between the file and the tap.
  if (!(await getAllowance(email)).canProcess) return { ok: false, message: outOfHours() }

  const media = await openMedia(mediaUrl)
  const bytes = Number(media.headers.get('content-length')) || 0
  const mime = media.headers.get('content-type') || 'application/octet-stream'
  const counted = { n: 0 }
  const { head, stream } = await peek(media.body!, 4096, counted)
  const seconds = wavSeconds(head, bytes)

  const uploadUrl = await uploadStream(stream)
  // Vonage streams without a Content-Length, so the size is whatever actually came through.
  const size = bytes || counted.n
  const { session } = await createSession({
    user_email: email,
    storage_path: `${AAI_PREFIX}${uploadUrl}`,
    // The pen's own filename is kept: it carries the start time that joins split meetings.
    source_name: (fileName || `WhatsApp recording ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`).slice(0, 200),
    mime,
    bytes: size || 1,
    duration_sec: seconds ? Math.round(seconds) : null,
    recorded_at: null,
    consent: true,
    source_channel: 'whatsapp',
  })

  const started = await startTranscription(email, session)
  if (!started.ok) {
    await updateSession(session.id, { status: 'error', error_text: 'Out of hours when sent over WhatsApp. Send it again once you have time.' })
    return { ok: false, session, message: outOfHours() }
  }
  return { ok: true, session, minutes: seconds ? Math.max(1, Math.round(seconds / 60)) : null }
}

/** Reads the first `n` bytes without losing them: the returned stream starts from byte 0. */
async function peek(body: ReadableStream<Uint8Array>, n: number, counted?: { n: number }): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  while (got < n) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    got += value.length
  }
  const head = new Uint8Array(got)
  let o = 0
  for (const c of chunks) {
    head.set(c, o)
    o += c.length
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.length) controller.enqueue(head)
      if (counted) counted.n += head.length
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close()
      else {
        if (counted) counted.n += value.length
        controller.enqueue(value)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
  return { head, stream }
}

/** Duration of a WAV from its fmt chunk's byte rate and the file size. Null for anything else. */
export function wavSeconds(head: Uint8Array, totalBytes: number): number | null {
  if (head.length < 36 || !totalBytes) return null
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const tag = (o: number) => String.fromCharCode(head[o], head[o + 1], head[o + 2], head[o + 3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  let p = 12
  while (p + 8 <= head.length) {
    const size = v.getUint32(p + 4, true)
    if (tag(p) === 'fmt ' && p + 16 <= head.length) {
      const byteRate = v.getUint32(p + 16, true)
      return byteRate > 0 ? totalBytes / byteRate : null
    }
    p += 8 + size + (size % 2)
  }
  return null
}

/* ------------------------------------------------------------------ agent */

async function onText(msg: Inbound, link: Link): Promise<void> {
  const q = msg.text.trim()
  if (!q) return
  if (/^(help|ayuda|\?|hi|hello|hola)$/i.test(q)) {
    await sendText(msg.from, HELP)
    return
  }
  if (/^(new|reset|nuevo)$/i.test(q)) {
    await setChat(link.email, [])
    await sendText(msg.from, 'Fresh start. What do you want to know?')
    return
  }

  // "What were the main points?" right after sending a file means that file. Measured on the
  // first sandbox test: without this the archive picked two unrelated calls. The recent one is
  // read first; everything else is still searchable.
  const recent = await latestWhatsAppRecording(link.email)
  const { answer, citations } = await askArchive({
    userEmail: link.email,
    question: q.slice(0, 2000),
    history: link.chat ?? [],
    agent: await briefFor(link.email).catch(() => undefined),
    ...(recent ? { mentions: [recent] } : {}),
  })
  const now = Date.now()
  await setChat(link.email, [
    ...(link.chat ?? []),
    { role: 'user', content: q, ts: now },
    { role: 'assistant', content: answer, citations, ts: now + 1 },
  ])
  // The model sometimes gives one recording two markers. One line per recording, all its
  // markers on it, so the list never shows the same title twice.
  const byRecording = new Map<string, { markers: number[]; title: string }>()
  for (const c of citations) {
    const row = byRecording.get(c.session_id) ?? { markers: [], title: c.title }
    row.markers.push(c.marker)
    byRecording.set(c.session_id, row)
  }
  const sources = byRecording.size
    ? '\n\n' + [...byRecording.values()].map((r) => `${r.markers.map((m) => `[${m}]`).join('')} ${r.title}`).join('\n')
    : ''
  await sendText(msg.from, answer + sources)
}

/** How long a recording sent here stays "the call" for follow-up questions. */
const RECENT_MS = 12 * 60 * 60 * 1000

async function latestWhatsAppRecording(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('pen_sessions')
    .select('id')
    .eq('user_email', email)
    .eq('source_channel', 'whatsapp')
    .eq('status', 'noted')
    .gt('created_at', new Date(Date.now() - RECENT_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  return (data?.[0]?.id as string | undefined) ?? null
}

/* -------------------------------------------------------------- briefings */

/** The briefing as a WhatsApp message: the short version, with the full note one tap away. */
export function briefingText(session: PenSession): string {
  const n = session.notes ?? {}
  const done = new Set(Array.isArray(session.action_done) ? session.action_done : [])
  const title = session.title ?? session.source_name ?? 'Your recording'
  const list = (items: string[]) => items.slice(0, 8).map((t) => `• ${t}`).join('\n')
  const parts = [`*${title}*`]
  if (session.duration_sec) parts[0] += ` (${fmtHours(session.duration_sec)})`
  if (n.summary) parts.push(n.summary)
  const actions = (n.actions ?? []).filter((_, i) => !done.has(i))
  if (actions.length) parts.push('*To do*\n' + list(actions.map((a) => [a.action, a.owner, a.due].filter(Boolean).join(' · '))))
  if (n.missed?.length) parts.push('*Nearly missed*\n' + list(n.missed.map((m) => m.item)))
  if (n.open_questions?.length) parts.push('*Still open*\n' + list(n.open_questions))
  parts.push(`Full note: ${appUrl()}\nAsk me anything about this call.`)
  return parts.join('\n\n')
}

/** Sends the briefing back to the phone a WhatsApp recording came from. Never throws. */
export async function sendWhatsAppBriefing(session: PenSession): Promise<void> {
  try {
    const link = await getLinkByEmail(session.user_email)
    if (!link?.phone) return
    await sendText(link.phone, briefingText(session))
  } catch (e) {
    console.warn(`pen whatsapp: briefing not sent for ${session.id}: ${(e as Error).message}`)
  }
}

export async function sendWhatsAppFailure(email: string, sourceName: string): Promise<void> {
  try {
    const link = await getLinkByEmail(email)
    if (!link?.phone) return
    await sendText(link.phone, `I couldn't write up ${sourceName}. Nothing is lost: open it at ${appUrl()} and press "Write the notes" to try again.`)
  } catch {}
}
