// Juno Pen on WhatsApp: what happens to each message.
//
//   LINK 123456        claims the code from Settings and ties this phone to the account.
//   a file             asks for the all-party consent tap, then streams the file to
//                      AssemblyAI and runs the same pipeline as a web upload. The briefing
//                      comes back here (and by email) from the AssemblyAI webhook.
//   any other text     the assistant (agent.ts): answers from the user's own recordings, lists and
//                      ticks off to-dos, drafts follow-up emails and sends them on "send it".
//                      Texts sent in a row are one turn, answered once (burst.ts), and one turn
//                      runs at a time per person (store.ts takeLock).
//   anything else      inbound.ts: reactions are silent (a 👍 on the question waiting for a yes is
//                      the yes), a location sets the time zone, a contact card is offered to save.
//
// Meta bars general-purpose AI chatbots on the business platform, so the agent answers from
// the recordings and nothing else. askArchive already refuses to go outside them.

import { ALLOWED_EMAILS } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getAccount, isActive } from '../accounts'
import { getAllowance } from '../allowance'
import { runAgent, SEND_IT, type AgentResult } from './agent'
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
import { isImessage } from '../imessage/sendblue'
import { getPending, notePendingOut, setPending, BARE_NO, BARE_YES } from './confirm'
import { decide, isConfirmation, joinTexts, nextBatch, type BurstRow } from './burst'
import { cardLine, route, zoneAt } from './inbound'
import type { ProactiveKind } from '../suggestions-types'
import {
  claimCode,
  claimTexts,
  finishTexts,
  getDraft,
  releaseLock,
  takeLock,
  unansweredTexts,
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
  optIn: 'I\'ll also text you reminders and briefs from your meetings. Reply STOP anytime.',
  welcome: 'You\'re all set. Three things to try:\n• Ask “What did I promise this week?”\n• Say “Remind me Friday at 9 to send the proposal”\n• Or send me a recording, or a voice note.',
  stopAll: 'Done, I won\'t message you first anymore. Reply START to turn it back on. You can still ask me anything.',
  stopKind: (what: string) => `Done, no more ${what}. Reply START to turn everything back on. You can still ask me anything.`,
  startAll: 'Done, I\'ll text you reminders and briefs from your meetings again. Reply STOP anytime.',
  startKind: (what: string) => `Done, ${what} are back on. Reply STOP anytime.`,
  kinds: { offers: 'suggestions after your recordings', meeting_brief: 'meeting briefs', nudges: 'to-do reminders', morning_brief: 'morning briefs', notion: 'Notion offers' } as Record<ProactiveKind, string>,
  empty: 'That file arrived without its contents. Could you send it again?',
  notAudio: (name: string) => `${name} doesn't look like a recording. Send me the WAV file from your pen.`,
  yourRecording: 'your recording',
  consent: (name: string) => `Got ${name}.\n\nOne tap before I write it up: did everyone on this recording agree to be recorded?`,
  agreed: 'Everyone agreed',
  replyYes: 'Reply YES to confirm.',
  consentNudge: (name: string) => `Still holding ${name}. I'll write it up as soon as you confirm everyone agreed to be recorded.`,
  consentExpired: (name: string) => `No confirmation came for ${name}, so I let it go and didn't write it up. Send it again anytime if you want the notes.`,
  outOfHours: () => `You've used this month's recording hours. They reset on the 1st: send the file again then. Questions? hello@tryjunoapp.com`,
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
  convosHead: (n: number, title: string) => `*${n} conversations* in "${title}":`,
  convosProbably: (n: string) => `probably ${n}`,
  convosWith: (n: string) => `with ${n}`,
  convosNoName: 'name not said',
  convosTail: 'To save someone, reply with the number at the end of the line and a name ("4 is Pedro"), or just tell me in your words.',
  splitFailed: (title: string) => `I couldn't split "${title}" into conversations. Try again in a minute, or on the website.`,
  writeFailed: (name: string, home: string) => `I couldn't write up ${name}. Nothing is lost: open it at ${home} and press "Write the notes" to try again.`,
  agentFailed: 'Sorry, something went wrong on my side and I couldn\'t answer that. Try again in a minute.',
  zoneSet: (label: string) => `Got it — using ${label}.`,
  zoneMoved: (what: string, when: string, label: string) => `Moved “${what}” to ${when}, ${label}.`,
  zoneNotMoved: (what: string) => `I couldn't move “${what}”; it's still at its old time.`,
  zoneUnknown: 'I couldn\'t tell the time zone from that location. Which city are you in?',
  saveCard: (line: string) => `Save ${line} to your contacts?`,
  saveCards: (n: number, lines: string) => `Save these ${n} contacts?\n${lines}`,
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
    optIn: 'También te escribiré recordatorios y resúmenes de tus reuniones. Responde STOP cuando quieras.',
    welcome: 'Todo listo. Tres cosas para probar:\n• Pregunta “¿Qué prometí esta semana?”\n• Escribe “Recuérdame el viernes a las 9 enviar la propuesta”\n• O mándame una grabación o una nota de voz.',
    stopAll: 'Listo, ya no te escribiré primero. Responde START para volver a activarlo. Puedes seguir preguntándome lo que quieras.',
    stopKind: (what) => `Listo, no más ${what}. Responde START para volver a activar todo. Puedes seguir preguntándome lo que quieras.`,
    startAll: 'Listo, te volveré a escribir recordatorios y resúmenes de tus reuniones. Responde STOP cuando quieras.',
    startKind: (what) => `Listo, volví a activar ${what}. Responde STOP cuando quieras.`,
    kinds: { offers: 'sugerencias después de tus grabaciones', meeting_brief: 'resúmenes antes de reuniones', nudges: 'recordatorios de tareas', morning_brief: 'resúmenes de la mañana', notion: 'ofertas de Notion' },
    empty: 'Ese archivo llegó vacío. ¿Me lo mandas otra vez?',
    notAudio: (name) => `${name} no parece una grabación. Mándame el archivo WAV de tu lápiz.`,
    yourRecording: 'tu grabación',
    consent: (name) => `Recibí ${name}.\n\nUn toque antes de escribir las notas: ¿todos en esta grabación aceptaron ser grabados?`,
    agreed: 'Todos aceptaron',
    replyYes: 'Responde SÍ para confirmar.',
    consentNudge: (name) => `Sigo guardando ${name}. Escribo las notas apenas confirmes que todos aceptaron ser grabados.`,
    consentExpired: (name) => `No llegó la confirmación de ${name}, así que la descarté sin escribir notas. Mándamela otra vez cuando quieras las notas.`,
    outOfHours: () => `Usaste las horas de grabación de este mes. Se renuevan el día 1: vuelve a mandar el archivo ese día. ¿Dudas? hello@tryjunoapp.com`,
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
    convosHead: (n, title) => `*${n} conversaciones* en "${title}":`,
    convosProbably: (n) => `probablemente ${n}`,
    convosWith: (n) => `con ${n}`,
    convosNoName: 'no se dijo el nombre',
    convosTail: 'Para guardar a alguien, responde con el número al final de la línea y un nombre ("4 es Pedro"), o dímelo con tus palabras.',
    splitFailed: (title) => `No pude separar "${title}" en conversaciones. Inténtalo en un minuto, o en el sitio web.`,
    writeFailed: (name, home) => `No pude escribir las notas de ${name}. No se perdió nada: ábrela en ${home} y presiona "Escribir las notas" para intentarlo otra vez.`,
    agentFailed: 'Perdón, algo falló de mi lado y no pude responder eso. Inténtalo de nuevo en un minuto.',
    zoneSet: (label) => `Listo — uso la ${label}.`,
    zoneMoved: (what, when, label) => `Moví “${what}” a ${when}, ${label}.`,
    zoneNotMoved: (what) => `No pude mover “${what}”; sigue a la hora de antes.`,
    zoneUnknown: 'No pude saber la zona horaria por esa ubicación. ¿En qué ciudad estás?',
    saveCard: (line) => `¿Guardo a ${line} en tus contactos?`,
    saveCards: (n, lines) => `¿Guardo estos ${n} contactos?\n${lines}`,
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
    optIn: 'Também vou te mandar lembretes e resumos das suas reuniões. Responda STOP quando quiser.',
    welcome: 'Tudo pronto. Três coisas para testar:\n• Pergunte “O que eu prometi esta semana?”\n• Escreva “Me lembra sexta às 9 de enviar a proposta”\n• Ou me mande uma gravação ou um áudio.',
    stopAll: 'Pronto, não vou mais te escrever primeiro. Responda START para ativar de novo. Você ainda pode me perguntar qualquer coisa.',
    stopKind: (what) => `Pronto, sem mais ${what}. Responda START para ativar tudo de novo. Você ainda pode me perguntar qualquer coisa.`,
    startAll: 'Pronto, vou voltar a te mandar lembretes e resumos das suas reuniões. Responda STOP quando quiser.',
    startKind: (what) => `Pronto, ${what} ativados de novo. Responda STOP quando quiser.`,
    kinds: { offers: 'sugestões depois das suas gravações', meeting_brief: 'resumos antes das reuniões', nudges: 'lembretes de tarefas', morning_brief: 'resumos da manhã', notion: 'ofertas do Notion' },
    empty: 'Esse arquivo chegou vazio. Pode mandar de novo?',
    notAudio: (name) => `${name} não parece uma gravação. Me mande o arquivo WAV da sua caneta.`,
    yourRecording: 'sua gravação',
    consent: (name) => `Recebi ${name}.\n\nUm toque antes de escrever as notas: todos nesta gravação concordaram em ser gravados?`,
    agreed: 'Todos concordaram',
    replyYes: 'Responda SIM para confirmar.',
    consentNudge: (name) => `Ainda estou com ${name}. Escrevo as notas assim que você confirmar que todos concordaram em ser gravados.`,
    consentExpired: (name) => `Não chegou a confirmação de ${name}, então descartei sem escrever notas. Mande de novo quando quiser as notas.`,
    outOfHours: () => `Você usou as horas de gravação deste mês. Elas renovam no dia 1: mande o arquivo de novo nesse dia. Dúvidas? hello@tryjunoapp.com`,
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
    convosHead: (n, title) => `*${n} conversas* em "${title}":`,
    convosProbably: (n) => `provavelmente ${n}`,
    convosWith: (n) => `com ${n}`,
    convosNoName: 'nome não dito',
    convosTail: 'Para salvar alguém, responda com o número no fim da linha e um nome ("4 é Pedro"), ou me diga com suas palavras.',
    splitFailed: (title) => `Não consegui separar "${title}" em conversas. Tente de novo em um minuto, ou no site.`,
    writeFailed: (name, home) => `Não consegui escrever as notas de ${name}. Nada se perdeu: abra em ${home} e aperte "Escrever as notas" para tentar de novo.`,
    agentFailed: 'Desculpe, algo deu errado do meu lado e não consegui responder. Tente de novo em um minuto.',
    zoneSet: (label) => `Certo — vou usar o ${label}.`,
    zoneMoved: (what, when, label) => `Mudei “${what}” para ${when}, ${label}.`,
    zoneNotMoved: (what) => `Não consegui mudar “${what}”; continua no horário de antes.`,
    zoneUnknown: 'Não consegui saber o fuso horário por essa localização. Em que cidade você está?',
    saveCard: (line) => `Salvo ${line} nos seus contatos?`,
    saveCards: (n, lines) => `Salvo estes ${n} contatos?\n${lines}`,
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

/**
 * The first message ever from this iMessage number: an email to the owners (PEN_SIGNUP_NOTIFY),
 * with who it is if their number is linked, and how many of the free plan's 10 contacts are in
 * use. Says what kind of message it was, never what it said.
 */
async function newImessageAlert(msg: Inbound, link: Link | null): Promise<void> {
  const { count } = await supabaseAdmin.from('pen_whatsapp_messages').select('id', { count: 'exact', head: true }).eq('phone', msg.from).neq('id', msg.id)
  if (count) return
  const { data: phones } = await supabaseAdmin.from('pen_whatsapp_messages').select('phone').like('phone', 'im:%')
  const contacts = new Set((phones ?? []).map((r) => r.phone as string)).size
  const tail = `…${msg.from.slice(-4)}`
  let who = link?.email ?? null
  if (link?.email) {
    const name = (await import('../profile').then((m) => m.getProfile(link.email)).catch(() => null))?.name?.trim()
    if (name) who = `${name} (${link.email})`
  }
  const { notifyNote } = await import('../notify-owner')
  await notifyNote(
    `New on iMessage: ${who ?? 'an unlinked number'} (${tail})`,
    [
      who ? `${who} texted Juno on iMessage for the first time, from the number ending ${tail}.` : `A number ending ${tail} texted Juno on iMessage. It isn't linked to an account yet: they need to send the LINK code from Settings, WhatsApp & iMessage.`,
      `First message: ${msg.kind === 'media' ? (msg.voice ? 'a voice note' : 'a recording') : msg.kind === 'image' ? 'a photo' : 'a text'}.`,
      `iMessage contacts so far: ${contacts} of the free plan's 10.`,
    ].join(' '),
  )
}

/** A plain yes in any of the app languages ("yes", "sí", "sim", "everyone agreed"…). */
const YES = /^\s*(yes|yep|yeah|y|ok|okay|s[ií]|sim|claro|todos (aceptaron|concordaram)|everyone agreed)\s*[.!👍]*\s*$/i

/** The newest recording on this iMessage sender still waiting for the consent "yes". */
async function pendingConsent(phone: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('id').eq('phone', phone).eq('state', 'consent').order('created_at', { ascending: false }).limit(1)
  return (data?.[0]?.id as string | undefined) ?? null
}

/** What one webhook call may spend in after() (maxDuration 300 on both routes), with room to spare. */
const TURN_BUDGET_MS = 270 * 1000

/**
 * Everything that arrives at the inbound webhook ends up here, after the 200 has gone back.
 * `at`: when it arrived (ms), stored as created_at; a webhook carrying several messages passes
 * t0 + index so their order is kept while they run side by side.
 */
export async function handleInbound(msg: Inbound, opts: { at?: number } = {}): Promise<void> {
  const at = opts.at ?? Date.now()
  const deadline = Date.now() + TURN_BUDGET_MS
  const link = await getLinkByPhone(msg.from)

  // Recorded before anything else so a Vonage retry of the same message is a no-op.
  const fresh = await recordInbound({
    id: msg.id,
    phone: msg.from,
    email: link?.email ?? null,
    kind: msg.kind,
    state: 'received',
    payload: { mediaUrl: msg.mediaUrl, fileName: msg.fileName, raw: msg.raw, ...(msg.kind === 'text' ? { text: msg.text } : {}) },
    created_at: new Date(at).toISOString(),
  })
  if (!fresh) return
  const turn = { at, deadline }

  // iMessage is a test with a 10-contact cap: tell the owners the first time a number shows up.
  if (isImessage(msg.from)) await newImessageAlert(msg, link).catch((e) => console.warn(`pen imessage: alert failed: ${(e as Error).message}`))

  // A reaction, a sticker, a system notice: nothing to say, whatever the account's state, so this
  // comes before the link checks. A 👍 on the question waiting for a yes is the yes (inbound.ts).
  if (msg.kind === 'reaction' || msg.kind === 'other') {
    const pending = msg.kind === 'reaction' && link ? await getPending(link.email).catch(() => null) : null
    const r = route(msg, pending)
    if (r === 'yes' && link && (await allowed(link.email))) {
      void markRead(msg.id, true, msg.from)
      const L = BOT[await langFor(msg.from, link.email)]
      return inTurn(msg.from, deadline, () => onText({ ...msg, kind: 'text', text: '👍' }, link, L, { sentAt: at }))
    }
    if (r !== 'cant_read') {
      await moveMessage(msg.id, 'received', 'done').catch(() => false)
      return
    }
  }

  // Blue ticks the moment it lands, before the slow part, so the sender sees it was seen.
  // "typing…" too for a question or a file, which always get a reply; a button tap may not
  // (a second tap on "Everyone agreed" is ignored), so it gets the ticks only.
  void markRead(msg.id, msg.kind === 'text' || msg.kind === 'media' || msg.kind === 'image' || msg.kind === 'location' || msg.kind === 'contacts', msg.from)

  const code = /^\s*link\s+(\d{6})\s*$/i.exec(msg.text)
  if (msg.kind === 'text' && code) return linkPhone(msg, code[1])

  const L = BOT[await langFor(msg.from, link?.email)]
  if (!link) {
    await sendText(msg.from, L.notLinked(appUrl('/settings/connections#whatsapp'), appUrl()))
    return
  }
  // STOP / START work on any account, active or not: being able to turn messages off can't
  // depend on a plan. Whole-message commands only.
  if (msg.kind === 'text') {
    const cmd = proactiveCommand(msg.text)
    if (cmd) return onProactiveCommand(msg, link, L, cmd)
  }
  if (!(await allowed(link.email))) {
    // Ended plans are read-only on the website; say that, rather than "pick a plan".
    const ended = (await getAccount(link.email).catch(() => null))?.status === 'cancelled'
    await sendText(msg.from, ended ? L.readOnly(appUrl('/settings/billing')) : L.inactive(appUrl()))
    return
  }

  if (msg.kind === 'media' && msg.voice) return onVoice(msg, link, L, turn)
  if (msg.kind === 'media') return askConsent(msg, L)
  if (msg.kind === 'image') return onImage(msg, link, L, turn)
  // A tap on a proactive template's quick reply ("Yes, brief me", "Remind me later") carries a
  // proactive:/reminder: payload, not a file id: it is the user answering, so the agent reads
  // the button text with the chat history (where the proactive message was written).
  if (msg.kind === 'reply' && /^(proactive|reminder):/.test(msg.replyId ?? '') && msg.text.trim()) return inTurn(msg.from, deadline, () => onText({ ...msg, kind: 'text' }, link, L, { sentAt: at }))
  if (msg.kind === 'reply') return onReply(msg, link, L)
  // iMessage has no buttons: a "yes" right after a recording is the consent tap.
  if (msg.kind === 'text' && isImessage(msg.from) && YES.test(msg.text)) {
    const pending = await pendingConsent(msg.from)
    if (pending) return onReply({ ...msg, kind: 'reply', replyId: `consent:${pending}` }, link, L)
  }
  if (msg.kind === 'text') return onTextBurst(msg, link, L, turn)
  if (msg.kind === 'location') return onLocation(msg, link, L)
  if (msg.kind === 'contacts') return onContacts(msg, link, L)
  // What is left is media Juno can't read (route: 'cant_read').
  return cantRead(msg, L)
}

/* --------------------------------------------- locations, cards, the rest */

const DAY_MS = 24 * 60 * 60 * 1000

/** "I can read recordings, voice notes…": for media Juno can't read, at most once a day per sender. */
async function cantRead(msg: Inbound, L: typeof EN): Promise<void> {
  const { count } = await supabaseAdmin.from('pen_whatsapp_messages').select('id', { count: 'exact', head: true })
    .eq('phone', msg.from).eq('payload->>told', 'unsupported').gt('created_at', new Date(Date.now() - DAY_MS).toISOString())
  const raw = (await getMessage(msg.id))?.payload ?? {}
  await supabaseAdmin.from('pen_whatsapp_messages').update({ state: 'done', ...(count ? {} : { payload: { ...raw, told: 'unsupported' } }) }).eq('id', msg.id)
  if (!count) await sendText(msg.from, L.unsupported)
}

/** A turn the bot answered itself, in the chat history, so the assistant knows it happened. */
async function remember(link: Link, user: string, assistant: string): Promise<void> {
  const fresh = (await getLinkByEmail(link.email).catch(() => null)) ?? link
  const now = Date.now()
  await setChat(link.email, [...(fresh.chat ?? []), { role: 'user', content: user, ts: now }, { role: 'assistant', content: assistant, ts: now + 1 }]).catch(() => {})
}

/**
 * A shared location: the time zone there, as if the user had said "I'm in …" (set_timezone, so it
 * counts as confirmed). Right after "still in Santiago?", what was just set moves to the same local
 * time there, as with a typed answer.
 */
async function onLocation(msg: Inbound, link: Link, L: typeof EN): Promise<void> {
  const loc = msg.location!
  const tz = zoneAt(loc.lat, loc.lng)
  const said = `[shared a location${loc.name || loc.address ? `: ${[loc.name, loc.address].filter(Boolean).join(', ')}` : ''}]`
  if (!tz) {
    await sendText(msg.from, L.zoneUnknown)
    await remember(link, said, L.zoneUnknown)
    await moveMessage(msg.id, 'received', 'done').catch(() => false)
    return
  }
  const lang = await userLang(link.email)
  const { setTimezone } = await import('./tools/timezone')
  const { zoneTimeLabel } = await import('../timezone')
  const ctx = {
    email: link.email, msgId: msg.id, question: said, history: [], recent: null, userName: null, phone: msg.from, lang,
    citations: [], drafted: null, sent: false, enrich: new Set<string>(), later: [],
  }
  const r = (await setTimezone(ctx, { zone: tz })) as { moved?: Record<string, string>[]; error?: string }
  const lines = [L.zoneSet(zoneTimeLabel(tz, lang))]
  for (const m of r.moved ?? []) {
    const what = m.reminder ?? m.event ?? m.what ?? ''
    if (m.error || !m.local_time) lines.push(L.zoneNotMoved(what))
    else lines.push(L.zoneMoved(what, m.local_time, m.zone_label) + (m.new_link_message ? `\n${m.new_link_message}` : ''))
  }
  const text = lines.join('\n')
  await sendText(msg.from, text)
  await remember(link, said, text)
  await moveMessage(msg.id, 'received', 'done').catch(() => false)
}

/**
 * A contact card (or several): Juno offers to save them, and one yes saves them all (it is Juno's
 * suggestion, so it asks; confirm.ts save_contacts). A 👍 on the offer works too.
 */
async function onContacts(msg: Inbound, link: Link, L: typeof EN): Promise<void> {
  const cards = (msg.contacts ?? []).slice(0, 10)
  const text = cards.length === 1 ? L.saveCard(cardLine(cards[0])) : L.saveCards(cards.length, cards.map((c) => `• ${cardLine(c)}`).join('\n'))
  await setPending(link.email, { kind: 'save_contacts', args: { cards }, summary: text, msgId: msg.id, createdAt: new Date().toISOString() })
  const ids = await sendText(msg.from, text)
  await remember(link, `[sent ${cards.length === 1 ? 'a contact card' : `${cards.length} contact cards`}: ${cards.map((c) => c.name).join(', ')}]`, text)
  await notePendingOut(link.email, msg.id, ids, text).catch(() => {})
  await moveMessage(msg.id, 'received', 'done').catch(() => false)
}

async function allowed(email: string): Promise<boolean> {
  if (ALLOWED_EMAILS.includes(email.toLowerCase())) return true
  return isActive(email).catch(() => false)
}

async function linkPhone(msg: Inbound, code: string): Promise<void> {
  const link = await claimCode(code, msg.from)
  if (!link) {
    await sendText(msg.from, BOT[langForPhone(msg.from)].badCode(appUrl('/settings/connections#whatsapp')))
    return
  }
  // The LINK message came in before there was a link, so it was stored without the email; with
  // it, channelFor sees the window this message just opened.
  await supabaseAdmin.from('pen_whatsapp_messages').update({ email: link.email }).eq('id', msg.id).is('email', null).then(() => {}, () => {})
  await sendText(msg.from, linkedReply(await langFor(msg.from, link.email), link.email))
}

/**
 * The reply to a LINK that worked: linked, three things to try (16 Oct, the one-tap link from
 * the app lands here, so this is the user's first message from Juno), and the opt-in Meta asks
 * for before Juno writes first (plan section I). The full help is one "help" away.
 */
export function linkedReply(lang: Lang, email: string): string {
  const L = BOT[lang]
  return `${L.linked(email)}\n\n${L.welcome}\n\n${L.optIn}`
}

/* -------------------------------------------------------------- STOP/START */

type ProactiveCommand = { on: boolean; kind?: ProactiveKind }

const STOP_WORDS = 'stop|para|parar|basta|pare|sair|detener|unsubscribe'
// "para" / "pare" / "parar" are everyday words too ("para todos", "para isso", "para mañana"):
// they stop only alone or with an exact kind name, never with "all / that".
const SOFT_STOP = /^(para|pare|parar)$/
const START_WORDS = 'start|empezar|activar|iniciar|reanudar|come[cç]ar|voltar|ativar'
// What each kind is called in a command, in the three languages ("stop morning brief").
const KIND_WORDS: [ProactiveKind, string][] = [
  ['morning_brief', 'morning briefs?|morning|resumen(es)? (de la )?ma[ñn]ana|resumen(es)? matutinos?|resumos? da manh[ãa]'],
  ['meeting_brief', 'meeting briefs?|briefs?|resumen(es)? (de|antes de) (las )?reuniones|resumos? (das|antes das) reuni[õo]es'],
  ['nudges', 'reminders?|nudges?|follow[- ]?ups?|recordatorios?|lembretes?'],
  ['offers', 'offers?|suggestions?|sugerencias?|sugest[õo]es'],
  ['notion', 'notion( offers?)?'],
]

/** STOP / START, all or one kind, only when that is the whole message. */
export function proactiveCommand(text: string): ProactiveCommand | null {
  const t = text.trim().toLowerCase().replace(/[.!¡]+$/g, '').replace(/\s+/g, ' ')
  const m = new RegExp(`^(${STOP_WORDS}|${START_WORDS})(?: (?:the |los |las |de |os |as |com |con )?(.+))?$`).exec(t)
  if (!m) return null
  const on = new RegExp(`^(${START_WORDS})$`).test(m[1])
  if (!m[2]) return { on }
  if (/^(it|that|all|everything|eso|esto|todo|todos|isso|tudo|messages?|mensajes?|mensagens?)$/.test(m[2])) return SOFT_STOP.test(m[1]) ? null : { on }
  const kind = KIND_WORDS.find(([, re]) => new RegExp(`^(${re})$`).test(m[2]))?.[0]
  return kind ? { on, kind } : null
}

async function onProactiveCommand(msg: Inbound, link: Link, L: typeof EN, cmd: ProactiveCommand): Promise<void> {
  const { setPrefs } = await import('../proactive')
  await setPrefs(link.email, cmd.on, cmd.kind)
  const reply = cmd.on ? (cmd.kind ? L.startKind(L.kinds[cmd.kind]) : L.startAll) : cmd.kind ? L.stopKind(L.kinds[cmd.kind]) : L.stopAll
  await sendText(msg.from, reply)
  await moveMessage(msg.id, 'received', 'done').catch(() => false)
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
    await sendText(msg.from, allowance.pausedUntil ? L.paused(appUrl('/settings/billing')) : L.outOfHours())
    return
  }

  await moveMessage(msg.id, 'received', 'consent')
  // Florida is all-party consent (Fla. Stat. § 934.03) and our users are licensed
  // professionals. Same rule as the web upload: refused until confirmed, never defaulted.
  await sendButtons(
    msg.from,
    L.consent(msg.fileName ?? L.yourRecording) + (isImessage(msg.from) ? `\n\n${L.replyYes}` : ''),
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
    return { ok: false, message: allowance.pausedUntil ? L.paused(appUrl('/settings/billing')) : L.outOfHours() }
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
    return { ok: false, session, message: L.outOfHours() }
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
async function onVoice(msg: Inbound, link: Link, L: typeof EN, turn: Turn): Promise<void> {
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
  return inTurn(msg.from, turn.deadline, () => onText({ ...msg, kind: 'text', text }, link, L, { heard: text, sentAt: turn.at }))
}

/** A photo (a business card, a listing sheet): the assistant reads it, with the caption if any. */
async function onImage(msg: Inbound, link: Link, L: typeof EN, turn: Turn): Promise<void> {
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
  return inTurn(msg.from, turn.deadline, () => onText({ ...msg, kind: 'text', text: msg.text.trim() || L.photo }, link, L, { image, sentAt: turn.at }))
}

type Turn = { at: number; deadline: number }
/** Slow work a reply promised (contact cards, rewritten notes, a split): run after the turn lets go. */
type Later = () => Promise<void>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const LOCK_POLL_MS = 700

/**
 * One assistant turn at a time per person. Waits for the turn before (lock in store.ts) until the
 * deadline; past it, answers anyway (a reply in parallel beats a message never answered). The
 * reply's slow follow-up work runs after the lock is let go, so the next message isn't held up.
 */
async function inTurn(from: string, deadline: number, run: () => Promise<Later | void>): Promise<void> {
  let token: string | null = null
  for (;;) {
    token = await takeLock(from).catch((e) => {
      console.warn(`pen whatsapp: turn lock: ${(e as Error).message}`)
      return 'none'
    })
    if (token || Date.now() + LOCK_POLL_MS > deadline) break
    await sleep(LOCK_POLL_MS)
  }
  if (!token) console.warn(`pen whatsapp: answering …${from.slice(-4)} without the turn lock (still held at the deadline)`)
  let later: Later | void = undefined
  try {
    later = await run()
  } finally {
    if (token && token !== 'none') await releaseLock(from, token).catch(() => {})
  }
  if (later) await later().catch((e) => console.warn(`pen whatsapp: after-reply work failed: ${(e as Error).message}`))
}

/** Whether a text answers what is already on screen (burst.ts isConfirmation), from the stored ask/draft. */
async function confirmationTest(email: string): Promise<(r: BurstRow) => boolean> {
  const [p, d] = await Promise.all([getPending(email).catch(() => null), getDraft(email).catch(() => null)])
  return (r) =>
    isConfirmation(r, {
      yesNo: BARE_YES.test(r.text) || BARE_NO.test(r.text),
      sendIt: SEND_IT.test(r.text),
      pendingAt: p?.createdAt ?? null,
      draftAt: d?.toEmail ? d.createdAt : null,
    })
}

/**
 * A text: waits for the burst to end (burst.ts decide), steps aside if a newer text came in, then
 * takes the turn and answers everything still unanswered as one message. A bare yes / "send it"
 * to what is already on screen, with no unanswered text before it, skips the wait.
 */
async function onTextBurst(msg: Inbound, link: Link, L: typeof EN, turn: Turn): Promise<void> {
  const me = (rows: BurstRow[]) => rows.find((r) => r.id === msg.id)
  let rows = await unansweredTexts(msg.from)
  const mine = me(rows)
  if (!mine) return
  const earlier = rows.filter((r) => r.id !== msg.id && Date.parse(r.created_at) <= Date.parse(mine.created_at))
  const immediate = !earlier.length && (await confirmationTest(link.email))(mine)
  if (!immediate) {
    for (;;) {
      const d = decide(rows, msg.id, Date.now())
      if (d.act === 'gone' || d.act === 'yield') return
      if (d.act === 'answer' || Date.now() + d.ms > turn.deadline) break
      await sleep(d.ms)
      rows = await unansweredTexts(msg.from)
    }
  }
  await inTurn(msg.from, turn.deadline, async () => {
    const jobs: Later[] = []
    // Under the lock: answer, in order, until this message has been answered. Usually one turn;
    // two when a bare yes is waiting at the front (it goes alone, then the rest).
    for (let i = 0; i < 4 && Date.now() < turn.deadline; i++) {
      let queue = await unansweredTexts(msg.from)
      if (!me(queue)) break
      // Got the turn after waiting for the one before: let a burst that is still coming finish.
      const test = await confirmationTest(link.email)
      while (!test(queue[0])) {
        const newest = queue[queue.length - 1]
        const d = decide(queue, newest.id, Date.now())
        if (d.act !== 'wait' || Date.now() + d.ms > turn.deadline) break
        await sleep(d.ms)
        queue = await unansweredTexts(msg.from)
        if (!me(queue)) break
      }
      const batch = await claimTexts(nextBatch(queue, test).map((r) => r.id))
      if (!batch.length) break
      const last = batch[batch.length - 1]
      if (!joinTexts(batch)) {
        await finishTexts(batch.map((r) => r.id), 'done')
        continue
      }
      void markRead(last.id, true, msg.from)
      const ids = batch.map((r) => r.id)
      try {
        const later = await onText({ ...msg, id: last.id, text: joinTexts(batch) }, link, L, { sentAt: Date.parse(last.created_at), batch: ids })
        if (later) jobs.push(later)
      } catch (e) {
        // Not left 'answering': failed, so the health check reports it.
        await finishTexts(ids, 'failed').catch(() => {})
        throw e
      }
    }
    return jobs.length ? async () => { for (const j of jobs) await j() } : undefined
  })
}

/**
 * One assistant turn. `batch`: the text messages it answers (claimed 'answering' by onTextBurst),
 * marked done together; without it, msg alone ('received' → 'done'). Returns the reply's slow
 * follow-up work for inTurn to run once the turn is over.
 */
async function onText(
  msg: Inbound,
  link: Link,
  L: typeof EN,
  extra: { heard?: string; image?: { data: string; mime: string }; sentAt?: number; batch?: string[] } = {},
): Promise<Later | void> {
  const q = msg.text.trim()
  if (!q) return
  // Answered text moves to 'done', so the health check can tell a question that never got a
  // reply (still 'received' minutes later) from one that did.
  const answered = () => (extra.batch ? finishTexts(extra.batch, 'done').catch(() => {}) : moveMessage(msg.id, 'received', 'done').catch(() => false))
  const failed = () => (extra.batch ? finishTexts(extra.batch, 'failed').catch(() => {}) : moveMessage(msg.id, 'received', 'failed').catch(() => {}))
  if (/^(help|ayuda|ajuda|\?|hi|hello|hola|oi|olá)$/i.test(q)) {
    await sendText(msg.from, L.help)
    await answered()
    return
  }
  // The turn before may have just finished: its chat history is read now, not when this arrived.
  link = (await getLinkByEmail(link.email).catch(() => null)) ?? link
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
          ...(extra.sentAt ? { sentAt: extra.sentAt } : {}),
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
    await failed()
    await sendText(msg.from, L.agentFailed)
    return
  }
  const now = Date.now()
  // Read again: a briefing or reminder may have been added to the chat while the agent worked.
  const chat = (await getLinkByEmail(link.email).catch(() => null))?.chat ?? link.chat ?? []
  await setChat(link.email, [
    ...chat,
    { role: 'user', content: extra.image ? `${q} [photo]` : extra.heard ? `${q} [voice note]` : q, ts: now },
    // memo: the email thread ids this turn looked at (agent.ts), for "reply to that" next; never sent.
    { role: 'assistant', content: later?.memo ? `${answer}\n\n${later.memo}` : answer, citations, ts: now + 1 },
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
  const out = (extra.heard ? `${L.heard} _“${extra.heard}”_\n\n` : '') + answer + sources
  const outIds = await sendText(msg.from, out)
  // If this reply asked something, a 👍 on it is the yes (inbound.ts).
  await notePendingOut(link.email, msg.id, outIds, out).catch(() => {})
  await answered()
  // Work the reply promised but that is too slow to wait for: contact cards, rewritten notes.
  const done = later
  if (!done?.after && !done?.redo && !done?.split) return
  return async () => {
    if (done.after) await done.after().catch(() => {})
    if (done.redo) await redoNotes(link.email, done.redo.sessionId, done.redo.type, L)
    if (done.split) await splitAndList(link.email, done.split, msg.from, L)
  }
}

/** Splits an event recording (asked for in the chat) and sends the conversations back, numbered. */
async function splitAndList(email: string, sessionId: string, to: string, L: typeof EN): Promise<void> {
  const { getSession } = await import('../store')
  const session = await getSession(email, sessionId)
  if (!session) return
  const title = session.title ?? session.source_name ?? L.titleFallback
  try {
    const { splitEvent } = await import('../conference')
    const { emailConversations } = await import('../briefing')
    if (!(await splitEvent(email, session))) throw new Error('split failed')
    const list = await emailConversations(session)
    if (!list.length) throw new Error('no conversations')
    // The number at the END of each line, as a handle for "41 is Pedro"; the time and topic lead.
    const lines = list.map((c, i) => `• ${c.when} · ${c.topic} · ${c.confirmed ? L.convosWith(c.confirmed) : c.likely ? L.convosProbably(c.likely) : L.convosNoName} · ${i + 1}`)
    const { eventName } = await import('../name-hints')
    await sendText(to, `${L.convosHead(list.length, eventName(title) || title)}\n\n${lines.join('\n')}\n\n${L.convosTail}`)
  } catch (e) {
    console.warn(`pen whatsapp: split ${sessionId} failed: ${(e as Error).message}`)
    await sendText(to, L.splitFailed(title)).catch(() => {})
  }
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
    // A recording sent by iMessage is answered on iMessage (the message row remembers the sender).
    const { data: via } = await supabaseAdmin.from('pen_whatsapp_messages').select('phone').eq('session_id', session.id).limit(1)
    const to = via?.[0]?.phone && isImessage(via[0].phone as string) ? (via[0].phone as string) : link.phone
    await sendText(to, text)
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
