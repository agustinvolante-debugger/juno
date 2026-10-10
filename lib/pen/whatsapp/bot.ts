// Juno Pen on WhatsApp: what happens to each message.
//
//   LINK 123456        claims the code from Settings and ties this phone to the account.
//   a file             asks for the all-party consent tap, then streams the file to
//                      AssemblyAI and runs the same pipeline as a web upload. The briefing
//                      comes back here (and by email) from the AssemblyAI webhook.
//   any other text     the assistant (agent.ts): answers from the user's own recordings, lists and
//                      ticks off to-dos, drafts follow-up emails and sends them on "send it".
//
// Meta bars general-purpose AI chatbots on the business platform, so the agent answers from
// the recordings and nothing else. askArchive already refuses to go outside them.

import { ALLOWED_EMAILS } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getAccount, isActive } from '../accounts'
import { getAllowance } from '../allowance'
import { runAgent, type AgentResult } from './agent'
import { isMine } from '../todo-labels'
import { askArchive } from '../archive'
import { uploadStream, submit, fetchTranscript, deleteTranscript } from '../aai'
import { briefFor } from '../profile'
import { createSession, updateSession, type Citation, type PenSession } from '../store'
import { startTranscription, AAI_PREFIX } from '../transcribe'
import { fmtHours } from '../plan'
import type { Lang } from '../currency'
import { userLang } from '../user-lang'
import { sendText, sendButtons, openMedia, markRead, type Inbound } from './provider'
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

// Replies in the account's App language. Before a phone is linked there is no account, so the
// country code decides: Brazil gets Portuguese, the rest of Latin America and Spain Spanish.
const EN = {
  help:
    'I\'m Juno Pen.\n\n' +
    '• Send me a recording (the WAV from your pen, or any audio file) and I\'ll send the briefing back here.\n' +
    '• Ask me anything about your calls, like "what did Chris say about the Malibu house?"\n' +
    '• Organise them: "add Carlos to this call", "speaker B is Carlos", "rename it Malibu showing".\n' +
    '• Send "new" to start a fresh conversation.',
  notLinked: (settings: string, home: string) =>
    'Hi, this is Juno Pen. This number isn\'t linked to an account yet.\n\n' +
    `Open ${settings} while signed in and send me the code it shows.\n\n` +
    `No account yet? Start here: ${home}`,
  inactive: (home: string) => `Your Juno Pen account isn't active. You can pick a plan at ${home}.`,
  unsupported: 'I can read recordings, voice notes, photos and text messages. Send me the WAV from your pen, or ask me about a call.',
  heard: '🎙️',
  voiceFailed: 'I couldn\'t make out that voice note. Could you send it again, or type it?',
  photo: '(sent a photo)',
  photoFailed: 'I couldn\'t open that photo. Could you send it again?',
  badCode: (settings: string) => `That code didn't work. Codes last 30 minutes. Get a fresh one at ${settings}.`,
  linked: (email: string) => `Linked to ${email}. ✅`,
  empty: 'That file arrived without its contents. Could you send it again?',
  notAudio: (name: string) => `${name} doesn't look like a recording. Send me the WAV file from your pen.`,
  yourRecording: 'your recording',
  consent: (name: string) => `Got ${name}.\n\nOne tap before I write it up: did everyone on this recording agree to be recorded?`,
  agreed: 'Everyone agreed',
  consentNudge: (name: string) => `Still holding ${name}. I'll write it up as soon as you confirm everyone agreed to be recorded.`,
  consentExpired: (name: string) => `No confirmation came for ${name}, so I let it go and didn't write it up. Send it again anytime if you want the notes.`,
  outOfHours: (hours: string) => `You're out of recording hours for this month. Buy more at ${hours} and send the file again.`,
  readOnly: (url: string) => `Your Juno Pen plan has ended, so your account is read-only: your recordings and notes are still on the website, but I can't take new ones or answer questions. Reactivate at ${url}.`,
  paused: (url: string) => `Your Juno Pen plan is paused, so this recording wasn't processed. Resume it at ${url} and send the file again.`,
  lost: 'I lost track of that file. Could you send it again?',
  cancelled: 'Okay, I won\'t transcribe it. Nothing was kept.',
  tooLate: (home: string) => `That one is already being transcribed, so I couldn't stop it. You'll find it at ${home}.`,
  transcribing: (min: number | null) => `Transcribing now${min ? ` (about ${min} min of audio)` : ''}. I'll send the briefing here in a few minutes.`,
  failed: 'Something went wrong receiving that file, and nothing was transcribed. Try sending it again, or upload it on the website.',
  fresh: 'Fresh start. What do you want to know?',
  titleFallback: 'Your recording',
  todo: '*To do*',
  missed: '*Nearly missed*',
  open: '*Still open*',
  full: (home: string) => `Full note: ${home}\nAsk me anything about this call.`,
  whoWasThere: 'Who was on this call? Tell me their names (and emails, if you want follow-ups) and I\'ll add them, like on the website.',
  redoFailed: (title: string) => `I couldn't rewrite the notes for "${title}". They're unchanged; you can try again on the website.`,
  writeFailed: (name: string, home: string) => `I couldn't write up ${name}. Nothing is lost: open it at ${home} and press "Write the notes" to try again.`,
  agentFailed: 'Sorry, something went wrong on my side and I couldn\'t answer that. Try again in a minute.',
}

const BOT: Record<Lang, typeof EN> = {
  en: EN,
  es: {
    help:
      'Soy Juno Pen.\n\n' +
      '• Mándame una grabación (el WAV de tu lápiz o cualquier audio) y te devuelvo el resumen aquí.\n' +
      '• Pregúntame lo que quieras de tus reuniones, como "¿qué dijo Pedro de la casa en Viña?"\n' +
      '• Escribe "nuevo" para empezar una conversación desde cero.',
    notLinked: (settings, home) =>
      'Hola, soy Juno Pen. Este número todavía no está vinculado a una cuenta.\n\n' +
      `Abre ${settings} con tu sesión iniciada y mándame el código que aparece.\n\n` +
      `¿Todavía no tienes cuenta? Empieza aquí: ${home}`,
    inactive: (home) => `Tu cuenta de Juno Pen no está activa. Puedes elegir un plan en ${home}.`,
    unsupported: 'Puedo leer grabaciones, notas de voz, fotos y mensajes de texto. Mándame el WAV de tu lápiz o pregúntame por una reunión.',
    heard: '🎙️',
    voiceFailed: 'No pude entender esa nota de voz. ¿Me la mandas de nuevo o la escribes?',
    photo: '(mandé una foto)',
    photoFailed: 'No pude abrir esa foto. ¿Me la mandas de nuevo?',
    badCode: (settings) => `Ese código no funcionó. Los códigos duran 30 minutos. Pide uno nuevo en ${settings}.`,
    linked: (email) => `Vinculado a ${email}. ✅`,
    empty: 'Ese archivo llegó vacío. ¿Me lo mandas otra vez?',
    notAudio: (name) => `${name} no parece una grabación. Mándame el archivo WAV de tu lápiz.`,
    yourRecording: 'tu grabación',
    consent: (name) => `Recibí ${name}.\n\nUn toque antes de escribir las notas: ¿todos en esta grabación aceptaron ser grabados?`,
    agreed: 'Todos aceptaron',
    consentNudge: (name) => `Sigo guardando ${name}. Escribo las notas apenas confirmes que todos aceptaron ser grabados.`,
    consentExpired: (name) => `No llegó la confirmación de ${name}, así que la descarté sin escribir notas. Mándamela otra vez cuando quieras las notas.`,
    outOfHours: (hours) => `Se acabaron tus horas de grabación de este mes. Compra más en ${hours} y vuelve a mandar el archivo.`,
    readOnly: (url) => `Tu plan de Juno Pen terminó, así que tu cuenta es solo de lectura: tus grabaciones y notas siguen en el sitio, pero no puedo recibir nuevas ni responder preguntas. Reactívala en ${url}.`,
    paused: (url) => `Tu plan de Juno Pen está en pausa, así que no procesamos esta grabación. Reactívalo en ${url} y vuelve a mandar el archivo.`,
    lost: 'Perdí la pista de ese archivo. ¿Me lo mandas otra vez?',
    cancelled: 'Listo, no lo voy a transcribir. No se guardó nada.',
    tooLate: (home) => `Esa ya se está transcribiendo, así que no pude detenerla. La encuentras en ${home}.`,
    transcribing: (min) => `Transcribiendo${min ? ` (unos ${min} min de audio)` : ''}. Te mando el resumen aquí en unos minutos.`,
    failed: 'Algo falló al recibir ese archivo y no se transcribió nada. Mándalo otra vez o súbelo en la web.',
    fresh: 'Empecemos de nuevo. ¿Qué quieres saber?',
    titleFallback: 'Tu grabación',
    todo: '*Por hacer*',
    missed: '*Casi se te pasa*',
    open: '*Sin resolver*',
    full: (home) => `Nota completa: ${home}\nPregúntame lo que quieras de esta reunión.`,
    whoWasThere: '¿Quiénes estaban en esta reunión? Dime sus nombres (y emails, si quieres hacer seguimiento) y los agrego, como en el sitio web.',
    redoFailed: (title) => `No pude reescribir las notas de "${title}". Quedaron como estaban; puedes intentarlo de nuevo en el sitio web.`,
    writeFailed: (name, home) => `No pude escribir las notas de ${name}. No se perdió nada: ábrela en ${home} y presiona "Escribir las notas" para intentarlo otra vez.`,
    agentFailed: 'Perdón, algo falló de mi lado y no pude responder eso. Inténtalo de nuevo en un minuto.',
  },
  pt: {
    help:
      'Eu sou o Juno Pen.\n\n' +
      '• Me mande uma gravação (o WAV da sua caneta ou qualquer áudio) e eu devolvo o resumo aqui.\n' +
      '• Pergunte qualquer coisa sobre suas reuniões, como "o que o Pedro disse sobre a casa em Floripa?"\n' +
      '• Mande "novo" para começar uma conversa do zero.',
    notLinked: (settings, home) =>
      'Oi, aqui é o Juno Pen. Este número ainda não está vinculado a uma conta.\n\n' +
      `Abra ${settings} com sua conta conectada e me mande o código que aparece.\n\n` +
      `Ainda não tem conta? Comece aqui: ${home}`,
    inactive: (home) => `Sua conta do Juno Pen não está ativa. Você pode escolher um plano em ${home}.`,
    unsupported: 'Eu leio gravações, áudios, fotos e mensagens de texto. Me mande o WAV da sua caneta ou pergunte sobre uma reunião.',
    heard: '🎙️',
    voiceFailed: 'Não consegui entender esse áudio. Pode mandar de novo ou escrever?',
    photo: '(mandei uma foto)',
    photoFailed: 'Não consegui abrir essa foto. Pode mandar de novo?',
    badCode: (settings) => `Esse código não funcionou. Os códigos valem por 30 minutos. Pegue um novo em ${settings}.`,
    linked: (email) => `Vinculado a ${email}. ✅`,
    empty: 'Esse arquivo chegou vazio. Pode mandar de novo?',
    notAudio: (name) => `${name} não parece uma gravação. Me mande o arquivo WAV da sua caneta.`,
    yourRecording: 'sua gravação',
    consent: (name) => `Recebi ${name}.\n\nUm toque antes de escrever as notas: todos nesta gravação concordaram em ser gravados?`,
    agreed: 'Todos concordaram',
    consentNudge: (name) => `Ainda estou com ${name}. Escrevo as notas assim que você confirmar que todos concordaram em ser gravados.`,
    consentExpired: (name) => `Não chegou a confirmação de ${name}, então descartei sem escrever notas. Mande de novo quando quiser as notas.`,
    outOfHours: (hours) => `Suas horas de gravação deste mês acabaram. Compre mais em ${hours} e mande o arquivo de novo.`,
    readOnly: (url) => `Seu plano do Juno Pen terminou, então sua conta é somente leitura: suas gravações e notas continuam no site, mas não posso receber novas nem responder perguntas. Reative em ${url}.`,
    paused: (url) => `Seu plano do Juno Pen está pausado, então esta gravação não foi processada. Retome em ${url} e mande o arquivo de novo.`,
    lost: 'Perdi esse arquivo de vista. Pode mandar de novo?',
    cancelled: 'Tudo bem, não vou transcrever. Nada foi guardado.',
    tooLate: (home) => `Essa já está sendo transcrita, então não consegui parar. Ela está em ${home}.`,
    transcribing: (min) => `Transcrevendo${min ? ` (cerca de ${min} min de áudio)` : ''}. Mando o resumo aqui em alguns minutos.`,
    failed: 'Algo deu errado ao receber esse arquivo e nada foi transcrito. Mande de novo ou envie pelo site.',
    fresh: 'Recomeçando. O que você quer saber?',
    titleFallback: 'Sua gravação',
    todo: '*A fazer*',
    missed: '*Quase passou batido*',
    open: '*Em aberto*',
    full: (home) => `Nota completa: ${home}\nPergunte qualquer coisa sobre esta reunião.`,
    whoWasThere: 'Quem estava nesta reunião? Me diga os nomes (e emails, se quiser fazer follow-up) e eu adiciono, como no site.',
    redoFailed: (title) => `Não consegui reescrever as notas de "${title}". Ficaram como estavam; você pode tentar de novo no site.`,
    writeFailed: (name, home) => `Não consegui escrever as notas de ${name}. Nada se perdeu: abra em ${home} e aperte "Escrever as notas" para tentar de novo.`,
    agentFailed: 'Desculpe, algo deu errado do meu lado e não consegui responder. Tente de novo em um minuto.',
  },
}

/** For a phone with no account yet: +55 Brazil, other Latin American codes and Spain. */
function langForPhone(phone: string): Lang {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('55')) return 'pt'
  if (/^(34|52|5[0-8]|59[0-8])/.test(d)) return 'es'
  return 'en'
}

async function langFor(phone: string, email?: string | null): Promise<Lang> {
  return email ? userLang(email) : langForPhone(phone)
}

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

  // Blue ticks the moment it lands, before the slow part, so the sender sees it was seen.
  // "typing…" too for a question or a file, which always get a reply; a button tap may not
  // (a second tap on "Everyone agreed" is ignored), so it gets the ticks only.
  void markRead(msg.id, msg.kind === 'text' || msg.kind === 'media')

  const code = /^\s*link\s+(\d{6})\s*$/i.exec(msg.text)
  if (msg.kind === 'text' && code) return linkPhone(msg, code[1])

  const L = BOT[await langFor(msg.from, link?.email)]
  if (!link) {
    await sendText(msg.from, L.notLinked(appUrl('/settings/whatsapp'), appUrl()))
    return
  }
  if (!(await allowed(link.email))) {
    // Ended plans are read-only on the website; say that, rather than "pick a plan".
    const ended = (await getAccount(link.email).catch(() => null))?.status === 'cancelled'
    await sendText(msg.from, ended ? L.readOnly(appUrl('/settings/billing')) : L.inactive(appUrl()))
    return
  }

  if (msg.kind === 'media' && msg.voice) return onVoice(msg, link, L)
  if (msg.kind === 'media') return askConsent(msg, L)
  if (msg.kind === 'image') return onImage(msg, link, L)
  if (msg.kind === 'reply') return onReply(msg, link, L)
  if (msg.kind === 'text') return onText(msg, link, L)
  await sendText(msg.from, L.unsupported)
}

async function allowed(email: string): Promise<boolean> {
  if (ALLOWED_EMAILS.includes(email.toLowerCase())) return true
  return isActive(email).catch(() => false)
}

async function linkPhone(msg: Inbound, code: string): Promise<void> {
  const link = await claimCode(code, msg.from)
  if (!link) {
    await sendText(msg.from, BOT[langForPhone(msg.from)].badCode(appUrl('/settings/whatsapp')))
    return
  }
  const L = BOT[await langFor(msg.from, link.email)]
  await sendText(msg.from, `${L.linked(link.email)}\n\n${L.help}`)
}

/* ------------------------------------------------------------------ files */

async function askConsent(msg: Inbound, L: typeof EN): Promise<void> {
  if (!msg.mediaUrl) {
    await sendText(msg.from, L.empty)
    return
  }
  if (msg.fileName && !AUDIO_EXT.test(msg.fileName)) {
    await moveMessage(msg.id, 'received', 'cancelled')
    await sendText(msg.from, L.notAudio(msg.fileName))
    return
  }
  const link = (await getLinkByPhone(msg.from))!
  const allowance = await getAllowance(link.email)
  if (!allowance.canProcess) {
    await moveMessage(msg.id, 'received', 'cancelled')
    await sendText(msg.from, allowance.pausedUntil ? L.paused(appUrl('/settings/billing')) : L.outOfHours(appUrl('/settings/hours')))
    return
  }

  await moveMessage(msg.id, 'received', 'consent')
  // Florida is all-party consent (Fla. Stat. § 934.03) and our users are licensed
  // professionals. Same rule as the web upload: refused until confirmed, never defaulted.
  await sendButtons(
    msg.from,
    L.consent(msg.fileName ?? L.yourRecording),
    // One button on purpose. Not tapping it is the "no": the file is never processed and
    // Vonage drops it after 48 hours.
    [{ id: `consent:${msg.id}`, title: L.agreed }],
  )
}

async function onReply(msg: Inbound, link: Link, L: typeof EN): Promise<void> {
  const [action, id] = (msg.replyId ?? '').split(':')
  const file = id ? await getMessage(id) : null
  if (!file || file.phone !== msg.from) {
    await sendText(msg.from, L.lost)
    return
  }

  if (action === 'cancel') {
    if (await moveMessage(file.id, 'consent', 'cancelled')) {
      await sendText(msg.from, L.cancelled)
    } else if (file.state === 'accepted' || file.state === 'done') {
      // Tapped after "Everyone agreed". Say so rather than let them think it was stopped.
      await sendText(msg.from, L.tooLate(appUrl()))
    }
    return
  }
  if (action !== 'consent') return
  // A double tap lands here twice; only the first one moves the row.
  if (!(await moveMessage(file.id, 'consent', 'accepted'))) return

  try {
    const r = await transcribeFile(link.email, file.payload.mediaUrl ?? '', file.payload.fileName ?? nameFromRaw(file.payload.raw), L)
    await moveMessage(file.id, 'accepted', r.ok ? 'done' : 'cancelled', { session_id: r.session?.id ?? null })
    await sendText(msg.from, r.ok ? L.transcribing(r.minutes) : r.message)
  } catch (e) {
    await moveMessage(file.id, 'accepted', 'failed')
    console.warn(`pen whatsapp: file ${file.id} failed: ${(e as Error).message}`)
    await sendText(msg.from, L.failed)
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
  L: typeof EN,
): Promise<{ ok: true; session: PenSession; minutes: number | null } | { ok: false; session?: PenSession; message: string }> {
  // Checked again: hours may have run out between the file and the tap.
  const allowance = await getAllowance(email)
  if (!allowance.canProcess) {
    return { ok: false, message: allowance.pausedUntil ? L.paused(appUrl('/settings/billing')) : L.outOfHours(appUrl('/settings/hours')) }
  }

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
    return { ok: false, session, message: L.outOfHours(appUrl('/settings/hours')) }
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

/** Voice notes up to this long are something the user is telling Juno, not a meeting. */
const VOICE_NOTE_MAX_SEC = 120

/**
 * A voice note: the user talking to Juno ("add to the García call that they want a pool"). It
 * is transcribed on the spot and answered like a typed message, with what was heard shown
 * first so a mishearing is visible. Longer than two minutes, it is probably a meeting someone
 * recorded with the mic button, and goes the usual way (consent, then notes).
 */
async function onVoice(msg: Inbound, link: Link, L: typeof EN): Promise<void> {
  let text = ''
  let aaiId: string | null = null
  try {
    const media = await openMedia(msg.mediaUrl!)
    const url = await uploadStream(media.body!)
    const t = await submit({ audioUrl: url, languages: ['en', 'es', 'pt'] })
    aaiId = t.id
    // Short audio comes back in a few seconds; give up well inside the function's time.
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      const got = await fetchTranscript(t.id)
      if (got.status === 'error') throw new Error(got.error ?? 'transcription failed')
      if (got.status === 'completed') {
        if ((got.audio_duration ?? 0) > VOICE_NOTE_MAX_SEC) {
          await deleteTranscript(t.id).catch(() => {})
          return askConsent(msg, L)
        }
        text = (got.text ?? '').trim()
        break
      }
    }
  } catch (e) {
    console.warn(`pen whatsapp: voice note ${msg.id} failed: ${(e as Error).message}`)
  } finally {
    // Nothing of a voice note is kept at AssemblyAI; the words live on as the chat message.
    if (aaiId) await deleteTranscript(aaiId).catch(() => {})
  }
  if (!text) {
    await moveMessage(msg.id, 'received', 'failed').catch(() => {})
    await sendText(msg.from, L.voiceFailed)
    return
  }
  return onText({ ...msg, kind: 'text', text }, link, L, { heard: text })
}

/** A photo (a business card, a listing sheet): the assistant reads it, with the caption if any. */
async function onImage(msg: Inbound, link: Link, L: typeof EN): Promise<void> {
  let image: { data: string; mime: string } | null = null
  try {
    const res = await openMedia(msg.mediaUrl!)
    const buf = Buffer.from(await res.arrayBuffer())
    // Claude takes up to 5 MB per image; WhatsApp already compresses photos well below that.
    if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
      const mime = (msg.mime ?? res.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
      if (/^image\/(jpeg|png|webp|gif)$/.test(mime)) image = { data: buf.toString('base64'), mime }
    }
  } catch (e) {
    console.warn(`pen whatsapp: photo ${msg.id} failed: ${(e as Error).message}`)
  }
  if (!image) {
    await moveMessage(msg.id, 'received', 'failed').catch(() => {})
    await sendText(msg.from, L.photoFailed)
    return
  }
  return onText({ ...msg, kind: 'text', text: msg.text.trim() || L.photo }, link, L, { image })
}

async function onText(
  msg: Inbound,
  link: Link,
  L: typeof EN,
  extra: { heard?: string; image?: { data: string; mime: string } } = {},
): Promise<void> {
  const q = msg.text.trim()
  if (!q) return
  // Answered text moves to 'done', so the health check can tell a question that never got a
  // reply (still 'received' minutes later) from one that did.
  const answered = () => moveMessage(msg.id, 'received', 'done').catch(() => false)
  if (/^(help|ayuda|ajuda|\?|hi|hello|hola|oi|olá)$/i.test(q)) {
    await sendText(msg.from, L.help)
    await answered()
    return
  }
  if (/^(new|reset|nuevo|novo)$/i.test(q)) {
    await setChat(link.email, [])
    await sendText(msg.from, L.fresh)
    await answered()
    return
  }

  // "What were the main points?" right after sending a file means that file. Measured on the
  // first sandbox test: without this the archive picked two unrelated calls. The recent one is
  // read first; everything else is still searchable.
  const recent = await latestWhatsAppRecording(link.email)
  let answer: string
  let citations: Citation[]
  let later: AgentResult | null = null
  try {
    const r: AgentResult = agentFor(msg.from)
      ? await runAgent({
          email: link.email,
          msgId: msg.id,
          question: q.slice(0, 2000),
          history: link.chat ?? [],
          agentBrief: await briefFor(link.email).catch(() => undefined),
          recent,
          lang: await userLang(link.email),
          phone: msg.from,
          ...(extra.image ? { image: extra.image } : {}),
        })
      : await askArchive({
          userEmail: link.email,
          question: q.slice(0, 2000),
          history: link.chat ?? [],
          agent: await briefFor(link.email).catch(() => undefined),
          ...(recent ? { mentions: [recent] } : {}),
        }).then((x) => ({ text: x.answer, citations: x.citations }))
    later = r
    answer = r.text
    citations = r.citations
  } catch (e) {
    console.warn(`pen whatsapp: answer failed for ${msg.id}: ${(e as Error).message}`)
    await moveMessage(msg.id, 'received', 'failed').catch(() => {})
    await sendText(msg.from, L.agentFailed)
    return
  }
  const now = Date.now()
  await setChat(link.email, [
    ...(link.chat ?? []),
    { role: 'user', content: extra.image ? `${q} [photo]` : extra.heard ? `${q} [voice note]` : q, ts: now },
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
  await sendText(msg.from, (extra.heard ? `${L.heard} _“${extra.heard}”_\n\n` : '') + answer + sources)
  await answered()
  // Work the reply promised but that is too slow to wait for: contact cards, rewritten notes.
  if (later?.after) await later.after().catch(() => {})
  if (later?.redo) await redoNotes(link.email, later.redo.sessionId, later.redo.type, L)
}

/** Rewrites one recording's notes (asked for on WhatsApp) and sends the new briefing here. */
async function redoNotes(email: string, sessionId: string, type: string | undefined, L: typeof EN): Promise<void> {
  const { getSession } = await import('../store')
  const session = await getSession(email, sessionId)
  if (!session) return
  try {
    const { writeNotes } = await import('../pipeline')
    const r = await writeNotes({ email, session, forceType: type, claim: false })
    if (r === 'taken' || !r.session) throw new Error('notes not written')
    await sendWhatsAppBriefing(r.session, { ask: false })
  } catch (e) {
    console.warn(`pen whatsapp: redo notes ${sessionId} failed: ${(e as Error).message}`)
    const link = await getLinkByEmail(email)
    if (link?.phone) await sendText(link.phone, L.redoFailed(session.title ?? session.source_name ?? L.titleFallback)).catch(() => {})
  }
}

/**
 * Who gets the assistant (agent.ts) rather than the plain Q&A. PEN_AGENT_PHONES is a comma list
 * of numbers (digits only) while it is being tried out; unset means everyone.
 */
function agentFor(phone: string): boolean {
  const list = (process.env.PEN_AGENT_PHONES ?? '').split(',').map((p) => p.replace(/\D/g, '')).filter(Boolean)
  return !list.length || list.includes(phone.replace(/\D/g, ''))
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
export function briefingText(session: PenSession, lang: Lang = 'en'): string {
  const L = BOT[lang]
  const n = session.notes ?? {}
  const done = new Set(Array.isArray(session.action_done) ? session.action_done : [])
  const title = session.title ?? session.source_name ?? L.titleFallback
  const list = (items: string[]) => items.slice(0, 8).map((t) => `• ${t}`).join('\n')
  const parts = [`*${title}*`]
  if (session.duration_sec) parts[0] += ` (${fmtHours(session.duration_sec)})`
  if (n.summary) parts.push(n.summary)
  // The user's own to-dos only (todo-meta.ts); unlabelled ones count as theirs.
  const meta = Array.isArray(session.action_meta) && session.action_meta.length === (n.actions?.length ?? 0) ? session.action_meta : null
  const actions = (n.actions ?? []).filter((_, i) => !done.has(i) && isMine(meta?.[i]))
  if (actions.length) parts.push(`${L.todo}\n` + list(actions.map((a) => [a.action, a.owner, a.due].filter(Boolean).join(' · '))))
  if (n.missed?.length) parts.push(`${L.missed}\n` + list(n.missed.map((m) => m.item)))
  if (n.open_questions?.length) parts.push(`${L.open}\n` + list(n.open_questions))
  parts.push(L.full(appUrl()))
  return parts.join('\n\n')
}

/** Sends the briefing back to the phone a WhatsApp recording came from. Never throws. */
export async function sendWhatsAppBriefing(session: PenSession, opts: { ask?: boolean } = {}): Promise<void> {
  try {
    const link = await getLinkByEmail(session.user_email)
    if (!link?.phone) return
    const L = BOT[await userLang(session.user_email)]
    let text = briefingText(session, await userLang(session.user_email))
    // Nobody on it yet: ask, so the answer ("Carlos and Titi") can go straight onto it.
    if (opts.ask !== false) {
      const { peopleOnSession } = await import('../people')
      if (!(await peopleOnSession(session.user_email, session.id).catch(() => [1])).length) text += `\n\n${L.whoWasThere}`
    }
    await sendText(link.phone, text)
    // In the chat history, so a reply to the briefing ("Carlos and Titi") has its context.
    await setChat(session.user_email, [...(link.chat ?? []), { role: 'assistant', content: text, ts: Date.now() }]).catch(() => {})
  } catch (e) {
    console.warn(`pen whatsapp: briefing not sent for ${session.id}: ${(e as Error).message}`)
  }
}

export async function sendWhatsAppFailure(email: string, sourceName: string): Promise<void> {
  try {
    const link = await getLinkByEmail(email)
    if (!link?.phone) return
    await sendText(link.phone, BOT[await userLang(email)].writeFailed(sourceName, appUrl()))
  } catch {}
}

/**
 * Files waiting on the consent tap (4 sat there for weeks in Sep). Run by /api/pen/recover every
 * 15 min: one reminder after 2 h; at 22 h, still inside WhatsApp's 24-hour reply window, let the
 * file go and say so. Anything already past the window is closed quietly (we can't message it).
 */
export async function sweepConsent(): Promise<{ nudged: number; expired: number }> {
  const H = 60 * 60 * 1000
  const now = Date.now()
  const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('id,phone,email,payload,created_at')
    .eq('state', 'consent').lt('created_at', new Date(now - 2 * H).toISOString())
  let nudged = 0
  let expired = 0
  for (const row of (data ?? []) as { id: string; phone: string; email: string | null; payload: Record<string, unknown> | null; created_at: string }[]) {
    const age = now - Date.parse(row.created_at)
    const L = BOT[await langFor(row.phone, row.email)]
    const name = (row.payload?.fileName as string | undefined) ?? nameFromRaw(row.payload?.raw) ?? L.yourRecording
    if (age > 22 * H) {
      if (!(await moveMessage(row.id, 'consent', 'cancelled'))) continue
      expired++
      if (age < 24 * H) await sendText(row.phone, L.consentExpired(name)).catch(() => {})
    } else if (!row.payload?.nudged) {
      await supabaseAdmin.from('pen_whatsapp_messages').update({ payload: { ...(row.payload ?? {}), nudged: true } }).eq('id', row.id).eq('state', 'consent')
      await sendButtons(row.phone, L.consentNudge(name), [{ id: `consent:${row.id}`, title: L.agreed }]).catch(() => {})
      nudged++
    }
  }
  return { nudged, expired }
}
