// The WhatsApp assistant: answers from the user's recordings, and acts on them.
//
//   search_recordings   a question for the archive (askArchive, on Sonnet here)
//   open_todos          open actions, optionally for one person
//   mark_todo           tick an action off, or put it back
//   get_recording       one recording's notes, to write an email from
//   find_person         a contact and their saved email
//   save_draft          writes the follow-up email; the code, not the model, shows it
//   send_draft          sends the draft shown in an EARLIER message
//   set_reminder        "remind me in 15 min to ..." (within 24 h: Meta's free-form window)
//   list_reminders / cancel_reminder
//
// Two guarantees are enforced here rather than asked of the model. What the user sees is what
// gets sent: the draft preview is appended by this file from the saved draft, not retyped by
// the model. And nothing is sent in the turn that wrote it: send_draft refuses a draft whose
// msgId is the current message, so "draft and send" in one breath always stops at the draft.
//
// Meta bars general-purpose AI chatbots on WhatsApp Business (§4.7), so the system prompt keeps
// it to the user's recordings, to-dos and follow-ups.

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { askArchive } from '../archive'
import { getSession, updateSession, type ArchiveTurn, type Citation, type PenNotes } from '../store'
import { cleanEmail, upsertByName } from '../people'
import { foldName } from '../speakers'
import { sendFollowUp } from '../follow-up'
import { getProfile } from '../profile'
import { addReminder, cancelReminder, pendingReminders, MAX_AHEAD_MS } from '../reminders'
import type { Lang } from '../currency'
import { getDraft, setDraft, type Draft } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-5-5'
/** Tool rounds per message. A normal turn uses one to three. */
const MAX_ROUNDS = 8

export type AgentResult = { text: string; citations: Citation[] }

type Ctx = {
  email: string
  msgId: string
  question: string
  history: ArchiveTurn[]
  agentBrief?: string
  recent: string | null
  userName: string | null
  phone: string
  lang: Lang
  /** Set by search_recordings; the last search's citations become the sources footer. */
  citations: Citation[]
  /** Set by save_draft, so the preview is appended to the reply. */
  drafted: Draft | null
  sent: boolean
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_recordings',
    description:
      'Answer a question from the user\'s recorded meetings (what was said, decided, promised, by whom). ' +
      'Returns an answer with [n] citation markers. Use for any question about the content of their calls.',
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'The question, self-contained (resolve "he", "that house" from the chat).' } },
      required: ['question'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_todos',
    description:
      'List open to-dos (action items not yet ticked off) across the user\'s recordings. Pass a person or client name to ' +
      'narrow to recordings with them or actions mentioning them. Each item has a ref for mark_todo and an owner: ' +
      '"what do I owe X" means items owned by the user, not by X.',
    input_schema: {
      type: 'object',
      properties: { person: { type: 'string', description: 'Name to filter by, e.g. "Garcia". Omit for all open to-dos.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'mark_todo',
    description:
      'Tick a to-do off (done=true) or put it back (done=false). Use the ref from open_todos. If more than one item could ' +
      'match what the user said, ask which one instead of guessing.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string' }, done: { type: 'boolean' } },
      required: ['ref', 'done'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_recording',
    description: 'One recording\'s title, date, people and extracted notes. Use before drafting an email about it.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_person',
    description: 'Look up a contact by name: their saved email, role and company.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_draft',
    description:
      'Save a follow-up email draft. It is shown to the user automatically, word for word, below your reply: do not ' +
      'repeat the draft in your text. Replaces any earlier draft. If you do not know the recipient\'s email, leave ' +
      'to_email empty: the tool looks it up, and if none is saved you must ask the user for it. When the user gives an ' +
      'email address, call save_draft again with it (it is saved to their contact).',
    input_schema: {
      type: 'object',
      properties: {
        to_name: { type: 'string', description: 'Recipient name as the user knows them.' },
        to_email: { type: 'string', description: 'Recipient email, or "" if unknown.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text, blank lines between paragraphs, signed with the user\'s first name.' },
        session_id: { type: 'string', description: 'The recording it follows up on, or "".' },
      },
      required: ['to_name', 'to_email', 'subject', 'body', 'session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_reminder',
    description:
      'Set a WhatsApp reminder for the user. Give either in_minutes (for "in 15 min", "in 2 hours") or at (an ISO 8601 ' +
      'time WITH offset, for clock times). Only up to 23 hours ahead. Write the reminder text as the user will want to ' +
      'read it, in their language.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to remind them of, e.g. "Check your recordings".' },
        in_minutes: { type: 'number', description: 'Minutes from now, or 0 if using at.' },
        at: { type: 'string', description: 'ISO 8601 with offset, e.g. 2026-09-30T17:00:00-07:00, or "".' },
      },
      required: ['text', 'in_minutes', 'at'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_reminders',
    description: 'The user\'s reminders that have not fired yet, with ids for cancel_reminder.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by id (from list_reminders).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_draft',
    description:
      'Send the saved draft. Only when the user has seen the draft and clearly said to send it ("send it", "mándalo", ' +
      '"pode enviar"). Never in the same turn you saved or changed the draft.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

function system(ctx: Ctx, pending: Draft | null): string {
  const today = new Date().toISOString().slice(0, 10)
  return (
    `You are Juno Pen on WhatsApp: the user's assistant for their own recorded meetings. Today is ${today}.\n\n` +
    'What you do: answer questions from their recordings, list and tick off their to-dos, draft and send ' +
    'follow-up emails about their meetings, and set reminders. Nothing else: you are not a general chatbot. If asked ' +
    'for something outside that, say briefly that you only help with their calls.\n\n' +
    `Now: ${nowLine(ctx.phone)}\n` +
    '- Reminders can be at most 23 hours ahead (WhatsApp only lets Juno message within a day of their last message). ' +
    'For later ones, say so and suggest they ask again closer to the time. For a clock time with no timezone given, ' +
    'use the one above; if it says unknown, ask.\n\n' +
    'Rules:\n' +
    '- Earlier assistant turns in this chat were made with these same tools; their tool calls just are not shown. ' +
    'Treat them as reliable unless the user corrects them.\n' +
    '- Facts come only from the tools. Never invent a name, number, date, price, address or commitment.\n' +
    '- Reply in the language of the user\'s LATEST message, even when the recordings, tool results or earlier ' +
    'turns are in another language.\n' +
    '- WhatsApp formatting: short paragraphs, *bold* sparingly, "• " for lists. No headings, no markdown links.\n' +
    '- When you answer from search_recordings, keep its [n] markers exactly as they are.\n' +
    '- After marking a to-do, confirm in one line which one.\n' +
    '- Emails: write like a busy professional to someone they know. Four to eight sentences, a concrete next step. ' +
    'Leave a visible gap like [date] rather than guessing a missing detail. Sign with the user\'s first name.\n' +
    '- After save_draft, write at most one short intro line (or ask for the missing email), and do not tell them how to send it. The draft and a ' +
    '"reply send it" hint are shown below your reply automatically.\n' +
    '- send_draft only on a clear go-ahead for a draft the user has already seen.\n' +
    (ctx.userName ? `\nThe user is ${ctx.userName}. In to-dos, an owner with their name (or "me", "I") is them.\n` : '') +
    (ctx.agentBrief ? `\nAbout the user:\n${ctx.agentBrief}\n` : '') +
    (pending
      ? `\nPending draft (shown to the user earlier): to ${pending.toName}${pending.toEmail ? ` <${pending.toEmail}>` : ' (no email yet)'}, subject "${pending.subject}".\n`
      : '\nNo draft is pending.\n')
  )
}

/* ------------------------------------------------------------------ tools */

type SessionRow = {
  id: string
  title: string | null
  client_name: string | null
  notes: PenNotes | null
  action_done: number[] | null
  recorded_at: string | null
  created_at: string
}

async function openTodos(ctx: Ctx, person?: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,notes,action_done,recorded_at,created_at')
    .eq('user_email', ctx.email)
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as SessionRow[]

  // A person matches a recording by client, by a name the notes heard, by a linked contact, or
  // by a mention in the action itself. Folded, so "Garcia" finds "García".
  const want = person ? foldName(person) : ''
  let linked = new Set<string>()
  if (want) {
    const { data: links } = await supabaseAdmin
      .from('pen_session_people')
      .select('session_id,pen_people(name)')
      .eq('user_email', ctx.email)
    linked = new Set(
      ((links ?? []) as unknown as { session_id: string; pen_people: { name: string } | null }[])
        .filter((l) => l.pen_people && foldName(l.pen_people.name).includes(want))
        .map((l) => l.session_id),
    )
  }
  const has = (s: string | null | undefined) => !!s && foldName(s).includes(want)

  const items: Record<string, unknown>[] = []
  for (const r of rows) {
    const n = r.notes ?? {}
    const done = new Set(Array.isArray(r.action_done) ? r.action_done : [])
    const onRecording =
      !want || linked.has(r.id) || has(r.client_name) || has(r.title) || (n.people ?? []).some((p) => has(p.name))
    ;(n.actions ?? []).forEach((a, i) => {
      if (done.has(i)) return
      if (!onRecording && !has(a.action) && !has(a.owner)) return
      items.push({
        ref: `${r.id}#${i}`,
        action: a.action,
        owner: a.owner || '',
        due: a.due || '',
        priority: a.priority ?? 'normal',
        recording: r.title ?? 'Untitled',
        date: (r.recorded_at ?? r.created_at).slice(0, 10),
      })
    })
  }
  return { count: items.length, todos: items.slice(0, 40), ...(items.length > 40 ? { note: `showing 40 of ${items.length}` } : {}) }
}

async function markTodo(ctx: Ctx, ref: string, done: boolean): Promise<unknown> {
  const m = /^([0-9a-f-]{36})#(\d+)$/i.exec(ref.trim())
  if (!m) return { error: 'bad ref: use one from open_todos' }
  const session = await getSession(ctx.email, m[1])
  const index = Number(m[2])
  const action = session?.notes?.actions?.[index]
  if (!session || !action) return { error: 'no such to-do' }
  const set = new Set(Array.isArray(session.action_done) ? session.action_done : [])
  if (done) set.add(index)
  else set.delete(index)
  await updateSession(session.id, { action_done: Array.from(set).sort((a, b) => a - b) })
  return { ok: true, done, action: action.action, recording: session.title ?? 'Untitled' }
}

async function getRecording(ctx: Ctx, id: string): Promise<unknown> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'bad session_id' }
  const s = await getSession(ctx.email, id)
  if (!s) return { error: 'no such recording' }
  const { data: people } = await supabaseAdmin
    .from('pen_session_people')
    .select('pen_people(name,email,role,company)')
    .eq('user_email', ctx.email)
    .eq('session_id', id)
  return {
    session_id: s.id,
    title: s.title ?? s.source_name,
    date: (s.recorded_at ?? s.created_at).slice(0, 10),
    client: s.client_name,
    contacts: ((people ?? []) as unknown as { pen_people: unknown }[]).map((p) => p.pen_people).filter(Boolean),
    their_own_notes: s.user_notes?.slice(0, 3000) ?? null,
    notes: s.notes,
  }
}

async function findPerson(ctx: Ctx, name: string): Promise<unknown> {
  const want = foldName(name)
  if (!want) return { people: [] }
  const { data, error } = await supabaseAdmin.from('pen_people').select('name,email,role,company').eq('user_email', ctx.email)
  if (error) throw new Error(error.message)
  const hits = ((data ?? []) as { name: string; email: string | null; role: string | null; company: string | null }[])
    .filter((p) => foldName(p.name).includes(want) || want.includes(foldName(p.name)))
    .slice(0, 5)
  return { people: hits }
}

async function saveDraft(
  ctx: Ctx,
  i: { to_name: string; to_email: string; subject: string; body: string; session_id: string },
): Promise<unknown> {
  const toName = i.to_name.trim().slice(0, 120)
  if (!toName || !i.subject.trim() || !i.body.trim()) return { error: 'to_name, subject and body are required' }
  let toEmail = i.to_email.trim() ? cleanEmail(i.to_email) : null
  if (i.to_email.trim() && !toEmail) return { error: `"${i.to_email}" is not a valid email address; ask the user` }

  if (toEmail) {
    // Given by the user in the chat: remember it on their contact (fills a blank, never overwrites).
    await upsertByName(ctx.email, toName, toEmail).catch(() => {})
  } else {
    const found = (await findPerson(ctx, toName)) as { people: { name: string; email: string | null }[] }
    const withEmail = found.people.filter((p) => p.email)
    if (withEmail.length === 1) toEmail = withEmail[0].email
    else if (withEmail.length > 1) {
      return { error: 'several contacts match', matches: withEmail.map((p) => `${p.name} <${p.email}>`), next: 'ask the user which one' }
    }
  }

  const sessionId = /^[0-9a-f-]{36}$/i.test(i.session_id) && (await getSession(ctx.email, i.session_id)) ? i.session_id : null
  const draft: Draft = {
    msgId: ctx.msgId,
    toName,
    toEmail,
    subject: i.subject.trim().slice(0, 200),
    body: i.body.trim().slice(0, 8000),
    sessionId,
    createdAt: new Date().toISOString(),
  }
  await setDraft(ctx.email, draft)
  ctx.drafted = draft
  return toEmail
    ? { ok: true, shown_to_user: true, to: `${toName} <${toEmail}>` }
    : { ok: true, shown_to_user: true, to: toName, missing: `No email saved for ${toName}. Ask the user for it.` }
}

async function sendDraft(ctx: Ctx): Promise<unknown> {
  const d = await getDraft(ctx.email)
  if (!d) return { error: 'no draft to send (none saved, or it is over a day old)' }
  if (d.msgId === ctx.msgId || ctx.drafted) {
    return { error: 'the user has not seen this version yet; show it and wait for them to say send' }
  }
  if (!d.toEmail) return { error: `no email address for ${d.toName}; ask the user for it` }
  if (ctx.sent) return { error: 'already sent in this turn' }
  const r = await sendFollowUp({ userEmail: ctx.email, toEmail: d.toEmail, subject: d.subject, body: d.body, sessionId: d.sessionId })
  if (!r.ok) return { error: `not sent: ${r.error}` }
  ctx.sent = true
  await setDraft(ctx.email, null)
  return { ok: true, sent_to: `${d.toName} <${d.toEmail}>`, subject: d.subject, note: 'A copy went to the user by BCC; replies go to their inbox.' }
}

/** A timezone guess from the phone's country code. The US spans six zones, so +1 is left unknown. */
function zoneFor(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  const table: [string, string][] = [
    ['56', 'America/Santiago'], ['55', 'America/Sao_Paulo'], ['54', 'America/Argentina/Buenos_Aires'], ['52', 'America/Mexico_City'],
    ['57', 'America/Bogota'], ['51', 'America/Lima'], ['34', 'Europe/Madrid'], ['44', 'Europe/London'],
  ]
  return table.find(([p]) => d.startsWith(p))?.[1] ?? null
}

function nowLine(phone: string): string {
  const now = new Date()
  const zone = zoneFor(phone)
  const local = zone ? now.toLocaleString('sv-SE', { timeZone: zone, hour12: false }).slice(0, 16) : null
  return `${now.toISOString().slice(0, 16)}Z (UTC).` + (local ? ` The user's likely timezone is ${zone}, where it is ${local}.` : ' The user\'s timezone is unknown.')
}

async function setReminder(ctx: Ctx, i: { text: string; in_minutes: number; at: string }): Promise<unknown> {
  const text = i.text.trim()
  if (!text) return { error: 'text is required' }
  let due: Date
  if (i.at.trim()) {
    if (!/[+-]\d\d:?\d\d$|Z$/.test(i.at.trim())) return { error: 'at needs a timezone offset' }
    due = new Date(i.at)
  } else {
    due = new Date(Date.now() + Math.round(i.in_minutes) * 60 * 1000)
  }
  if (Number.isNaN(due.getTime())) return { error: 'could not read that time' }
  if (due.getTime() < Date.now() + 30 * 1000) return { error: 'that time has already passed' }
  if (due.getTime() - Date.now() > MAX_AHEAD_MS) return { error: 'more than 23 hours ahead; WhatsApp only allows reminders within a day' }
  const r = await addReminder({ email: ctx.email, phone: ctx.phone, text, dueAt: due, lang: ctx.lang })
  const zone = zoneFor(ctx.phone)
  return {
    ok: true,
    id: r.id,
    due_utc: r.due_at,
    ...(zone ? { due_local: new Date(r.due_at).toLocaleString('sv-SE', { timeZone: zone, hour12: false }).slice(0, 16) + ` ${zone}` } : {}),
  }
}

async function searchRecordings(ctx: Ctx, question: string): Promise<unknown> {
  const { answer, citations } = await askArchive({
    userEmail: ctx.email,
    question: question.slice(0, 2000),
    history: ctx.history,
    agent: ctx.agentBrief,
    model: MODEL,
    // Low: this stage reports what the transcripts say. At the default it took 50s on a real
    // archive, twice as long as WhatsApp shows "typing…".
    effort: 'low',
    ...(ctx.recent ? { mentions: [ctx.recent] } : {}),
  })
  ctx.citations = citations
  return { answer, sources: citations.map((c) => ({ marker: c.marker, recording: c.title, session_id: c.session_id })) }
}

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<unknown> {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (name) {
    case 'search_recordings':
      return searchRecordings(ctx, str('question') || ctx.question)
    case 'open_todos':
      return openTodos(ctx, str('person') || undefined)
    case 'mark_todo':
      return markTodo(ctx, str('ref'), input.done !== false)
    case 'get_recording':
      return getRecording(ctx, str('session_id'))
    case 'find_person':
      return findPerson(ctx, str('name'))
    case 'save_draft':
      return saveDraft(ctx, {
        to_name: str('to_name'),
        to_email: str('to_email'),
        subject: str('subject'),
        body: str('body'),
        session_id: str('session_id'),
      })
    case 'send_draft':
      return sendDraft(ctx)
    case 'set_reminder':
      return setReminder(ctx, { text: str('text'), in_minutes: Number(input.in_minutes) || 0, at: str('at') })
    case 'list_reminders':
      return { reminders: await pendingReminders(ctx.email) }
    case 'cancel_reminder':
      return (await cancelReminder(ctx.email, str('id'))) ? { ok: true } : { error: 'no such pending reminder' }
    default:
      return { error: `unknown tool ${name}` }
  }
}

/* ------------------------------------------------------------------- loop */

const HINT: Record<Lang, { to: string; subject: string; send: string; noEmail: string }> = {
  en: { to: 'To', subject: 'Subject', send: 'Reply *send it* to send, or tell me what to change.', noEmail: 'Send me their email and I\'ll add it.' },
  es: { to: 'Para', subject: 'Asunto', send: 'Responde *envíalo* para mandarlo, o dime qué cambiar.', noEmail: 'Mándame su email y lo agrego.' },
  pt: { to: 'Para', subject: 'Assunto', send: 'Responda *enviar* para mandar, ou me diga o que mudar.', noEmail: 'Me mande o email e eu adiciono.' },
}

export function draftPreview(d: Draft, lang: Lang = 'en'): string {
  const h = HINT[lang]
  return (
    `✉️ *${h.to}:* ${d.toName}${d.toEmail ? ` <${d.toEmail}>` : ''}\n*${h.subject}:* ${d.subject}\n\n${d.body}\n\n` +
    `_${d.toEmail ? h.send : h.noEmail}_`
  )
}

/** A bare go-ahead. Handled in code, so a send never depends on the model choosing to call a tool. */
const SEND_IT = /^\s*(send( it| the email)?|yes,? send( it)?|env[ií]a(lo)?|m[aá]nd(a|alo)|s[ií],? (env[ií]alo|m[aá]ndalo)|pode enviar|envia(r)?|manda(r)?)\s*[.!👍]*\s*$/i

const SENT: Record<Lang, (to: string, subject: string) => string> = {
  en: (to, s) => `Sent to ${to}: "${s}". A copy is in your inbox, and replies will go to you.`,
  es: (to, s) => `Enviado a ${to}: "${s}". Tienes una copia en tu correo y las respuestas te llegan a ti.`,
  pt: (to, s) => `Enviado para ${to}: "${s}". Uma cópia está no seu email e as respostas vão para você.`,
}

export async function runAgent(opts: {
  email: string
  msgId: string
  question: string
  history: ArchiveTurn[]
  agentBrief?: string
  recent: string | null
  lang: Lang
  phone: string
}): Promise<AgentResult> {
  const userName = (await getProfile(opts.email).catch(() => null))?.name?.trim() || null
  const ctx: Ctx = { ...opts, userName, citations: [], drafted: null, sent: false }
  const pending = await getDraft(opts.email).catch(() => null)

  if (pending?.toEmail && SEND_IT.test(opts.question)) {
    const r = (await sendDraft(ctx)) as { ok?: boolean; error?: string }
    if (r.ok) return { text: SENT[opts.lang](`${pending.toName} <${pending.toEmail}>`, pending.subject), citations: [] }
    // Not sent (daily cap, provider error): let the model explain it in context.
  }

  const messages: Anthropic.MessageParam[] = [
    ...opts.history.slice(-12).map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
    { role: 'user', content: opts.question },
  ]
  // The API wants the first turn to be the user's; a trimmed history can start mid-exchange.
  while (messages.length && messages[0].role !== 'user') messages.shift()

  let text = ''
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Medium: a WhatsApp reply should arrive while "typing…" is still showing.
      output_config: { effort: 'medium' },
      system: system(ctx, pending),
      tools: TOOLS,
      messages,
    })
    text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
    if (res.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: res.content })
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const results: Anthropic.ToolResultBlockParam[] = []
    // One at a time: save_draft then send_draft in the same round must see each other.
    for (const c of calls) {
      try {
        const out = await runTool(ctx, c.name, (c.input ?? {}) as Record<string, unknown>)
        const isError = !!out && typeof out === 'object' && 'error' in out
        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(isError ? { is_error: true } : {}) })
      } catch (e) {
        console.warn(`pen whatsapp agent: ${c.name} failed: ${(e as Error).message}`)
        results.push({ type: 'tool_result', tool_use_id: c.id, content: `failed: ${(e as Error).message}`, is_error: true })
      }
    }
    // Tool results are often in the recordings' language; the reply follows the question's.
    messages.push({
      role: 'user',
      content: [...results, { type: 'text', text: `(Reply in the language of my message: "${opts.question.slice(0, 120)}")` }],
    })
  }

  if (ctx.drafted) text = `${text ? `${text}\n\n` : ''}${draftPreview(ctx.drafted, opts.lang)}`
  // Sources only if the reply actually carries the markers.
  const citations = ctx.citations.filter((c) => text.includes(`[${c.marker}]`))
  return { text: text || '…', citations }
}
