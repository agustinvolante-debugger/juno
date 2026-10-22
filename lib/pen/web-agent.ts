// The WhatsApp / iMessage assistant (lib/pen/whatsapp/agent.ts) running in the web chat: POST
// /api/pen/chats when PEN_WEB_AGENT=1 (lib/pen/agent-io.ts is the contract). This file is the
// route's body, so it can be tested without a request: the route checks the session and the
// read-only plan, then hands over to webAgentResponse.
//
// One turn at a time per thread (store.ts takeChatLock). The reply streams as Server-Sent Events:
// progress (one per tool, a short label in the user's language), then done with the saved thread,
// or error. Work promised for after the reply (contact cards, rewritten notes, a split) runs after
// the response (next/server after), and what it has to say lands in the thread (Ctx.notify).

import { after } from 'next/server'
import type { AgentParts, WebAction } from './agent-io'
import type { ArchiveTurn, Mention } from './store'
import type { Lang } from './currency'

/** Test seam: the agent and what it needs are looked up here, so a test can swap them. */
export const deps = {
  runAgent: async (...a: Parameters<typeof import('./whatsapp/agent').runAgent>) => (await import('./whatsapp/agent')).runAgent(...a),
  channelFor: async (email: string) => (await import('./proactive')).channelFor(email),
}

/** PEN_WEB_AGENT=1, and while it is tried, PEN_WEB_AGENT_USERS (comma list; empty = everyone). */
export function webAgentAllowed(email: string): boolean {
  if (process.env.PEN_WEB_AGENT !== '1') return false
  const list = (process.env.PEN_WEB_AGENT_USERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return !list.length || list.includes(email.toLowerCase())
}

export function parseAction(raw: unknown): WebAction | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (a.kind === 'confirm' && typeof a.yes === 'boolean') return { kind: 'confirm', yes: a.yes }
  if (a.kind === 'send_draft') return { kind: 'send_draft' }
  if (a.kind === 'undo' && typeof a.turn === 'number' && Number.isFinite(a.turn)) return { kind: 'undo', turn: a.turn }
  return null
}

/**
 * A button press as the words it stands for, in the user's language. Each matches the same test a
 * typed reply does (BARE_YES / BARE_NO, SEND_IT, UNDO), so a button runs the same code path.
 */
const ACTION_WORDS: Record<Lang, { yes: string; no: string; send: string; undo: string }> = {
  en: { yes: 'Yes', no: 'No', send: 'Send it', undo: 'Undo' },
  es: { yes: 'Sí', no: 'No', send: 'Envíalo', undo: 'Deshacer' },
  pt: { yes: 'Sim', no: 'Não', send: 'Enviar', undo: 'Desfazer' },
}
export function actionQuestion(a: WebAction, lang: Lang): string {
  const w = ACTION_WORDS[lang] ?? ACTION_WORDS.en
  return a.kind === 'confirm' ? (a.yes ? w.yes : w.no) : a.kind === 'send_draft' ? w.send : w.undo
}

/** What the user sees while a tool runs. Unlisted tools: the generic one. */
const LABELS: Record<Lang, Record<string, string>> = {
  en: {
    _: 'Working on it…', search: 'Searching your recordings…', todos: 'Checking your to-dos…', todo: 'Updating your to-dos…', recording: 'Opening the recording…',
    people: 'Looking up your contacts…', person: 'Updating your contacts…', draft: 'Writing the email…', send: 'Sending the email…', reminder: 'Setting the reminder…',
    calendar: 'Adding to your calendar…', events: 'Checking your calendar…', event: 'Updating your calendar…', doc: 'Creating the document…', sheet: 'Creating the sheet…',
    notion: 'Sending to Notion…', connect: 'Getting the connect link…', mail: 'Reading your email…', notes: 'Updating the notes…', organise: 'Updating your recordings…',
    zone: 'Updating your time zone…', confirm: 'Doing it…', granola: 'Importing from Granola…', brief: 'Preparing the brief…',
  },
  es: {
    _: 'Trabajando en ello…', search: 'Buscando en tus grabaciones…', todos: 'Revisando tus pendientes…', todo: 'Actualizando tus pendientes…', recording: 'Abriendo la grabación…',
    people: 'Buscando en tus contactos…', person: 'Actualizando tus contactos…', draft: 'Escribiendo el correo…', send: 'Enviando el correo…', reminder: 'Creando el recordatorio…',
    calendar: 'Agregando a tu calendario…', events: 'Revisando tu calendario…', event: 'Actualizando tu calendario…', doc: 'Creando el documento…', sheet: 'Creando la planilla…',
    notion: 'Enviando a Notion…', connect: 'Preparando el enlace para conectar…', mail: 'Leyendo tu correo…', notes: 'Actualizando las notas…', organise: 'Actualizando tus grabaciones…',
    zone: 'Actualizando tu zona horaria…', confirm: 'Haciéndolo…', granola: 'Importando desde Granola…', brief: 'Preparando el resumen…',
  },
  pt: {
    _: 'Trabalhando nisso…', search: 'Buscando nas suas gravações…', todos: 'Vendo suas tarefas…', todo: 'Atualizando suas tarefas…', recording: 'Abrindo a gravação…',
    people: 'Buscando nos seus contatos…', person: 'Atualizando seus contatos…', draft: 'Escrevendo o e-mail…', send: 'Enviando o e-mail…', reminder: 'Criando o lembrete…',
    calendar: 'Adicionando à sua agenda…', events: 'Vendo sua agenda…', event: 'Atualizando sua agenda…', doc: 'Criando o documento…', sheet: 'Criando a planilha…',
    notion: 'Enviando para o Notion…', connect: 'Preparando o link para conectar…', mail: 'Lendo seu e-mail…', notes: 'Atualizando as notas…', organise: 'Atualizando suas gravações…',
    zone: 'Atualizando seu fuso horário…', confirm: 'Fazendo…', granola: 'Importando do Granola…', brief: 'Preparando o resumo…',
  },
}
const TOOL_LABEL: Record<string, string> = {
  search_recordings: 'search', open_todos: 'todos', missed_items: 'todos', mark_todo: 'todo', add_todo: 'todo', update_todo: 'todo', mark_missed: 'todo',
  get_recording: 'recording', list_recordings: 'recording', recording_people: 'recording', recording_conversations: 'recording', read_conversation: 'recording',
  find_person: 'people', person_brief: 'brief', add_person: 'person', remove_person: 'person', save_contact: 'person', edit_person: 'person', merge_people: 'person',
  delete_person: 'person', name_speaker: 'person', name_conversation: 'person', save_draft: 'draft', set_draft_from: 'draft', set_mail_app: 'draft', reply_in_thread: 'draft',
  send_draft: 'send', send_briefing: 'send', set_reminder: 'reminder', list_reminders: 'reminder', cancel_reminder: 'reminder', add_to_calendar: 'calendar',
  invite_to_meeting: 'calendar', find_events: 'events', list_events: 'events', find_meeting: 'events', move_event: 'event', delete_event: 'event', add_meet_link: 'event',
  create_doc: 'doc', send_to_google_docs: 'doc', draft_deliverable: 'doc', create_sheet: 'sheet', export_todos_sheet: 'sheet', export_contacts_sheet: 'sheet',
  send_to_notion: 'notion', connect_app: 'connect', search_email: 'mail', read_thread: 'mail', redo_notes: 'notes', redo_notes_as: 'notes', add_note: 'notes',
  translate_transcript: 'notes', update_recording: 'organise', combine_recordings: 'organise', separate_recordings: 'organise', combine_day: 'organise',
  split_conversations: 'organise', split_recording: 'organise', join_split: 'organise', delete_recording: 'organise', set_client: 'organise', set_timezone: 'zone', confirm_pending: 'confirm', import_granola: 'granola',
}
export function progressLabel(tool: string, lang: Lang): string {
  const L = LABELS[lang] ?? LABELS.en
  return L[TOOL_LABEL[tool] ?? '_'] ?? L._
}

/**
 * The thread as the agent reads it: the last 12 turns, each assistant turn with its memo (the
 * draft as it was shown, email thread ids) so "change the second paragraph" has the draft.
 */
export function historyForAgent(turns: ArchiveTurn[]): ArchiveTurn[] {
  return turns.slice(-12).map((t) => (t.role === 'assistant' && t.parts?.memo ? { ...t, content: `${t.content}\n\n${t.parts.memo}` } : t))
}

type Tag = { id: string; kind: 'recording' | 'person'; label: string }

export type WebAgentBody = { id?: string; question?: string; mentions?: unknown; action?: unknown }

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/** Runs after the response; outside a request (tests, scripts) it just runs. */
function later(job: () => Promise<void>): void {
  try {
    after(job)
  } catch {
    void job().catch(() => {})
  }
}

/**
 * The route's agent path. Validation and the thread lock answer with JSON (before any stream);
 * from then on everything is an SSE event, errors included.
 */
export async function webAgentResponse(email: string, b: WebAgentBody, tags: Tag[]): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const { createChat, getChat, setMessages, titleFromQuestion, appendToChat } = await import('./chats')
  const { takeChatLock, releaseChatLock } = await import('./whatsapp/store')
  const { userLang } = await import('./user-lang')
  const action = parseAction(b.action)
  const typed = (b.question ?? '').trim()
  if (!typed && !action) return json({ error: 'Type a question first.' }, 400)
  if (typed.length > 2000) return json({ error: 'That question is too long — try trimming it.' }, 400)
  if (action && !b.id) return json({ error: 'That conversation no longer exists.' }, 404)

  const lang = await userLang(email).catch((): Lang => 'en')
  const question = action ? actionQuestion(action, lang) : typed
  const chat = b.id ? await getChat(email, b.id) : await createChat(email, titleFromQuestion(question))
  if (!chat) return json({ error: 'That conversation no longer exists.' }, 404)
  const token = await takeChatLock(chat.id)
  if (!token) return json({ error: 'Juno is still answering your last message in this chat. Try again in a moment.' }, 409)

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (event: string, data: unknown) => {
        if (!open) return
        try {
          controller.enqueue(enc.encode(sse(event, data)))
        } catch {
          open = false // the browser went away; the turn still finishes and is saved
        }
      }
      let job: (() => Promise<void>) | null = null
      try {
        const history = Array.isArray(chat.messages) ? chat.messages : []
        const ch = await deps.channelFor(email).catch(() => null)
        const { webStore } = await import('./whatsapp/state')
        const { webText } = await import('./whatsapp/agent')
        const { briefFor } = await import('./profile')
        const now = Date.now()
        // The assistant turn's ts is the turn's msgId: drafts, questions and undo are keyed by it.
        const msgId = String(now + 1)
        const notify = async (text: string) => appendToChat(email, chat.id, { role: 'assistant', content: webText(text), ts: Date.now() })
        const r = await deps.runAgent({
          email,
          msgId,
          question,
          history: historyForAgent(history),
          agentBrief: await briefFor(email).catch(() => undefined),
          recent: tags.find((t) => t.kind === 'recording')?.id ?? null,
          lang,
          channel: 'web',
          ...(ch?.to ? { phone: ch.to, reach: { imessage: ch.imessage, lastInbound: ch.lastInbound } } : {}),
          store: webStore(email, chat.id),
          notify,
          ...(action?.kind === 'undo' ? { undoTurn: String(action.turn) } : {}),
          onTool: (name) => send('progress', { label: progressLabel(name, lang) }),
        })
        const mentioned: Mention[] = tags.filter((t) => t.kind === 'recording').map((t) => ({ id: t.id, title: t.label, label: t.label, kind: 'recording' as const }))
        const parts: AgentParts = r.parts ?? {}
        // Read again: an after-reply note from an earlier turn may have landed meanwhile.
        const fresh = (await getChat(email, chat.id).catch(() => null))?.messages ?? history
        const messages: ArchiveTurn[] = [
          ...fresh,
          { role: 'user', content: question, ...(mentioned.length ? { mentions: mentioned } : {}), ts: now },
          { role: 'assistant', content: r.text, citations: r.citations, parts, ts: now + 1 },
        ]
        const saved = await setMessages(email, chat.id, messages)
        send('done', { chat: saved })
        if (r.after || r.redo || r.split) {
          job = async () => {
            if (r.after) await r.after().catch(() => {})
            const bot = await import('./whatsapp/bot')
            const L = bot.botCopy(lang)
            if (r.redo) await bot.redoNotes(email, r.redo.sessionId, r.redo.type, L, notify)
            if (r.split) await bot.splitAndList(email, r.split, '', L, notify)
          }
        }
      } catch (e) {
        console.warn(`pen web agent: turn failed: ${(e as Error).message}`)
        send('error', { error: (e as Error).message || 'Something went wrong. Try again.' })
      } finally {
        await releaseChatLock(chat.id, token).catch(() => {})
        if (open) {
          try {
            controller.close()
          } catch {}
        }
        if (job) later(job)
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  })
}
