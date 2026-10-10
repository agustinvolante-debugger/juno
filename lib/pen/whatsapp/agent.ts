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
//   list_recordings     recent recordings with ids, so "the call with Carlos" can be acted on
//   recording_people    who is on a recording: contacts, speaker labels (with sample lines), names heard
//   add_person / remove_person   the web's People section: link a contact to a recording
//   name_speaker        the web's "Who's who": Speaker B is Carlos (or me)
//   update_recording    rename it, change its category
//   redo_notes          rewrite the notes (after naming speakers); runs after the reply is sent
//
// Two guarantees are enforced here rather than asked of the model. What the user sees is what
// gets sent: the draft preview is appended by this file from the saved draft, not retyped by
// the model. And nothing is sent in the turn that wrote it: send_draft refuses a draft whose
// msgId is the current message, so "draft and send" in one breath always stops at the draft.
//
// Meta bars general-purpose AI chatbots on WhatsApp Business (§4.7), so the system prompt keeps
// it to the user's recordings, to-dos and follow-ups.

import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { penAnthropic } from '../anthropic'
import { supabaseAdmin } from '@/lib/supabase'
import { askArchive } from '../archive'
import { getSession, updateSession, type ArchiveTurn, type Citation, type PenNotes } from '../store'
import { cleanEmail, cleanName, upsertByName, linkPerson, unlinkPerson, peopleOnSession, enrichPerson, suggestionsFrom } from '../people'
import { foldName, speakerName, type SpeakerMap } from '../speakers'
import { COMMON_TYPES } from '../categories'
import { sendFollowUp } from '../follow-up'
import { getProfile } from '../profile'
import { addReminder, cancelReminder, pendingReminders, MAX_AHEAD_MS } from '../reminders'
import type { Lang } from '../currency'
import { isMine, type ActionMeta } from '../todo-labels'
import { getDraft, setDraft, type Draft } from './store'

const anthropic = penAnthropic('whatsapp-agent')
const MODEL = 'claude-sonnet-5-5'
/** Tool rounds per message. A normal turn uses one to three. */
const MAX_ROUNDS = 8

/** `redo`: a recording whose notes the user asked to rewrite. Too slow for the reply, so the
 *  caller does it after sending the text, and sends the new briefing when it is done. */
export type AgentResult = { text: string; citations: Citation[]; redo?: { sessionId: string; type?: string }; after?: () => Promise<void> }

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
  redo?: { sessionId: string; type?: string }
  recentTitle?: string | null
  /** Contacts added this turn, whose cards are refreshed after the reply. */
  enrich: Set<string>
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
      'List the user\'s open to-dos (not yet ticked off) across their recordings. By default only the ones that are ' +
      'the user\'s own (or shared); set include_others to see what other people on the calls owe. Pass a person or ' +
      'client name to narrow to recordings with them. Each item has a ref for mark_todo, due_date (resolved) and ' +
      'waiting (who is waiting on the user for it).',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Name to filter by, e.g. "Garcia". Omit for all.' },
        include_others: { type: 'boolean', description: 'Also list items other people owe. Default false.' },
      },
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
  {
    name: 'list_recordings',
    description:
      'The user\'s recordings, newest first, with session_id, title, date, category and the contacts on each. ' +
      'Pass a word to narrow (a name, a title word, a date like 2026-10-09), or "" for the latest. Use it to find ' +
      'the session_id for any action on a recording.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'recording_people',
    description:
      'Who is on one recording: the contacts linked to it, each speaker label (A, B, C) with its current name and ' +
      'two sample lines, and names the notes heard that are not linked yet. Use before add_person or name_speaker.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_person',
    description:
      'Add a person to a recording, as on the website\'s People section: creates the contact if the name is new ' +
      '(an existing contact with that name is reused) and links it. Give their email if the user gave one, else "". ' +
      'Call once per person.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        name: { type: 'string', description: 'Full name as the user wrote it.' },
        email: { type: 'string', description: 'Email address, or "".' },
      },
      required: ['session_id', 'name', 'email'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_person',
    description: 'Take a contact off a recording (the contact itself is kept).',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' }, name: { type: 'string' } },
      required: ['session_id', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'name_speaker',
    description:
      'Say who a speaker label is, as on the website\'s "Who\'s who": "Speaker B is Carlos". Set is_me when it is ' +
      'the user. The person is also added to the recording as a contact. Only use labels recording_people returned; ' +
      'if the user did not say which label, use the sample lines to decide, and ask if it is not clear.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        label: { type: 'string', description: 'The speaker label, e.g. "B".' },
        name: { type: 'string', description: 'Their name, or "" when is_me.' },
        is_me: { type: 'boolean' },
      },
      required: ['session_id', 'label', 'name', 'is_me'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_recording',
    description:
      'Rename a recording and/or change its category. "" leaves a field as it is. Changing the category only ' +
      'relabels it; to rewrite the notes for the new category, also call redo_notes.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        title: { type: 'string' },
        category: { type: 'string', description: `Prefer one of: ${COMMON_TYPES.join(', ')}.` },
      },
      required: ['session_id', 'title', 'category'],
      additionalProperties: false,
    },
  },
  {
    name: 'redo_notes',
    description:
      'Rewrite a recording\'s notes from its transcript, using the speaker names and category as they are now. ' +
      'Takes a minute or two: it runs after your reply, and the new briefing is sent here when it is ready, so tell ' +
      'the user that. Only when the user asks for it or agrees to it.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
]

function system(ctx: Ctx, pending: Draft | null): string {
  const today = new Date().toISOString().slice(0, 10)
  return (
    `You are Juno Pen on WhatsApp: the user's assistant for their own recorded meetings. Today is ${today}.\n\n` +
    'What you do: answer questions from their recordings, list and tick off their to-dos, draft and send ' +
    'follow-up emails about their meetings, set reminders, and organise their recordings the way the website does: ' +
    'add or remove the people on a call, say which speaker is who, rename a recording or change its category, and ' +
    'rewrite its notes. Nothing else: you are not a general chatbot. If asked for something outside that, say ' +
    'briefly that you only help with their calls.\n\n' +
    (ctx.recent
      ? `"This call", "the recording", "it" with no other recording named means the one they sent here last: session_id ${ctx.recent}${ctx.recentTitle ? `, "${ctx.recentTitle}"` : ''}.\n\n`
      : '') +
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
    '- After changing a recording (people, speakers, title, category), confirm exactly what changed and on which ' +
    'recording, in one or two lines, so a misheard name is caught at once. Never claim a change a tool did not confirm.\n' +
    '- When the user lists who was on a call ("Carlos and Titi"), add each with add_person. If it is clear from ' +
    'recording_people which speaker each one is, name the speakers too; then offer to rewrite the notes with the names.\n' +
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
  action_meta?: ActionMeta[] | null
  recorded_at: string | null
  created_at: string
}

async function openTodos(ctx: Ctx, person?: string, includeOthers = false): Promise<unknown> {
  const query = (cols: string) =>
    supabaseAdmin.from('pen_sessions').select(cols).eq('user_email', ctx.email).order('created_at', { ascending: false }).limit(400)
  let res = await query('id,title,client_name,notes,action_done,action_meta,recorded_at,created_at')
  // Before the action_meta ALTER runs: no labels, so everything counts as the user's.
  if (res.error && /action_meta/.test(res.error.message)) res = await query('id,title,client_name,notes,action_done,recorded_at,created_at')
  if (res.error) throw new Error(res.error.message)
  const rows = (res.data ?? []) as unknown as SessionRow[]

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
  let othersSkipped = 0
  for (const r of rows) {
    const n = r.notes ?? {}
    const done = new Set(Array.isArray(r.action_done) ? r.action_done : [])
    const acts = n.actions ?? []
    const meta = Array.isArray(r.action_meta) && r.action_meta.length === acts.length ? r.action_meta : null
    const onRecording =
      !want || linked.has(r.id) || has(r.client_name) || has(r.title) || (n.people ?? []).some((p) => has(p.name))
    acts.forEach((a, i) => {
      if (done.has(i)) return
      if (!onRecording && !has(a.action) && !has(a.owner) && !has(meta?.[i]?.waiting)) return
      const m = meta?.[i] ?? null
      if (!includeOthers && !isMine(m)) {
        othersSkipped++
        return
      }
      items.push({
        ref: `${r.id}#${i}`,
        action: a.action,
        whose: m?.mine ?? 'unlabelled',
        owner: a.owner || '',
        due_date: m?.due_date ?? null,
        due_said: a.due || '',
        waiting: m?.waiting ?? null,
        priority: a.priority ?? 'normal',
        recording: r.title ?? 'Untitled',
        date: (r.recorded_at ?? r.created_at).slice(0, 10),
      })
    })
  }
  return {
    count: items.length,
    todos: items.slice(0, 40),
    ...(items.length > 40 ? { note: `showing 40 of ${items.length}` } : {}),
    ...(othersSkipped ? { others_not_shown: othersSkipped } : {}),
  }
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
    id: crypto.randomBytes(12).toString('base64url'),
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

/* ------------------------------------------------- organising recordings */

const UUID = /^[0-9a-f-]{36}$/i

async function ownSession(ctx: Ctx, id: string) {
  return UUID.test(id.trim()) ? getSession(ctx.email, id.trim()) : null
}

async function listRecordings(ctx: Ctx, query: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,source_name,meeting_type,client_name,recorded_at,created_at,source_channel')
    .eq('user_email', ctx.email)
    .neq('source_channel', 'sample')
    .or('merge_index.is.null,merge_index.eq.0')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  type Row = { id: string; title: string | null; source_name: string | null; meeting_type: string | null; client_name: string | null; recorded_at: string | null; created_at: string }
  const rows = (data ?? []) as Row[]
  const { data: links } = await supabaseAdmin.from('pen_session_people').select('session_id,pen_people(name)').eq('user_email', ctx.email)
  const people = new Map<string, string[]>()
  for (const l of (links ?? []) as unknown as { session_id: string; pen_people: { name: string } | null }[]) {
    if (l.pen_people) people.set(l.session_id, [...(people.get(l.session_id) ?? []), l.pen_people.name])
  }
  const want = foldName(query)
  const hits = rows.filter((r) => {
    if (!want) return true
    const date = (r.recorded_at ?? r.created_at).slice(0, 10)
    return [r.title, r.source_name, r.client_name, r.meeting_type, date, ...(people.get(r.id) ?? [])].some((v) => !!v && foldName(v).includes(want))
  })
  return {
    recordings: hits.slice(0, 12).map((r) => ({
      session_id: r.id,
      title: r.title ?? r.source_name ?? 'Untitled',
      date: (r.recorded_at ?? r.created_at).slice(0, 10),
      category: r.meeting_type,
      people: people.get(r.id) ?? [],
    })),
    ...(hits.length > 12 ? { note: `12 of ${hits.length}; narrow the query` } : {}),
  }
}

async function recordingPeople(ctx: Ctx, id: string): Promise<unknown> {
  const s = await ownSession(ctx, id)
  if (!s) return { error: 'no such recording' }
  const linked = await peopleOnSession(ctx.email, s.id)
  const map = (s.speaker_map ?? null) as SpeakerMap | null
  const utts = s.transcript?.utterances ?? []
  const byLabel = new Map<string, string[]>()
  utts.forEach((u, i) => {
    const text = (s.transcript_edits?.[String(i)] ?? u.text).trim()
    const list = byLabel.get(u.speaker) ?? []
    list.push(text)
    byLabel.set(u.speaker, list)
  })
  return {
    session_id: s.id,
    title: s.title ?? s.source_name,
    contacts: linked.map((p) => ({ name: p.name, email: p.email })),
    speakers: [...byLabel.entries()].map(([label, lines]) => ({
      label,
      now_called: speakerName(map, label),
      is_me: map?.[label]?.me === true,
      lines: lines.length,
      // The longest two say the most about who is talking.
      samples: [...lines].sort((a, b) => b.length - a.length).slice(0, 2).map((t) => t.slice(0, 200)),
    })),
    heard_not_linked: suggestionsFrom(s.notes, linked, ctx.userName).map((x) => (x.role ? `${x.name} (${x.role})` : x.name)),
  }
}

async function addPerson(ctx: Ctx, i: { session_id: string; name: string; email: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording; find it with list_recordings' }
  const name = cleanName(i.name)
  if (!name) return { error: 'a name is required' }
  const email = i.email.trim() ? cleanEmail(i.email) : null
  if (i.email.trim() && !email) return { error: `"${i.email}" is not a valid email address; ask the user` }
  const person = await upsertByName(ctx.email, name, email)
  await linkPerson(ctx.email, s.id, person.id, 'user')
  // The contact card fills in from the notes after the reply, as on the website.
  ctx.enrich.add(person.id)
  return {
    ok: true,
    added: person.name,
    email: person.email,
    ...(email && person.email && person.email !== email ? { note: `kept the email already saved (${person.email}); the website can change it` } : {}),
    recording: s.title ?? s.source_name,
  }
}

async function removePerson(ctx: Ctx, i: { session_id: string; name: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording' }
  const want = foldName(i.name)
  const linked = await peopleOnSession(ctx.email, s.id)
  const hits = linked.filter((p) => foldName(p.name).includes(want) || want.includes(foldName(p.name)))
  if (!hits.length) return { error: 'nobody by that name is on this recording', on_it: linked.map((p) => p.name) }
  if (hits.length > 1) return { error: 'several match', matches: hits.map((p) => p.name), next: 'ask the user which one' }
  await unlinkPerson(ctx.email, s.id, hits[0].id)
  return { ok: true, removed: hits[0].name, recording: s.title ?? s.source_name }
}

async function nameSpeaker(ctx: Ctx, i: { session_id: string; label: string; name: string; is_me: boolean }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording' }
  const label = i.label.trim().replace(/^speaker\s+/i, '').toUpperCase()
  const labels = new Set((s.transcript?.utterances ?? []).map((u) => u.speaker))
  if (!labels.has(label)) return { error: `no speaker ${label} in this recording`, labels: [...labels] }
  const name = i.is_me ? cleanName(i.name) || ctx.userName || '' : cleanName(i.name)
  if (!name) return { error: i.is_me ? 'the user\'s name is not known; ask for it' : 'a name is required' }

  const map: SpeakerMap = { ...((s.speaker_map ?? {}) as SpeakerMap) }
  // The diarizer sometimes splits one voice in two: a second label with a name another label
  // already has becomes that label, as the website's "same as" does.
  const twin = Object.entries(map).find(([l, e]) => l !== label && !e.same_as && e.name && foldName(e.name) === foldName(name))
  let personId: string | null = null
  if (!i.is_me) {
    const person = await upsertByName(ctx.email, name, null)
    await linkPerson(ctx.email, s.id, person.id, 'user')
    ctx.enrich.add(person.id)
    personId = person.id
  }
  map[label] = twin
    ? { name: '', person_id: null, me: false, same_as: twin[0], source: 'user' }
    : { name, person_id: personId, me: i.is_me, same_as: null, source: 'user' }
  await updateSession(s.id, { speaker_map: map })
  return {
    ok: true,
    speaker: label,
    now_called: name + (i.is_me ? ' (the user)' : ''),
    ...(twin ? { merged_with: `speaker ${twin[0]}, already ${name}` } : {}),
    recording: s.title ?? s.source_name,
    note: 'The transcript shows the name now; the notes still use the old labels until redo_notes.',
  }
}

async function updateRecording(ctx: Ctx, i: { session_id: string; title: string; category: string }): Promise<unknown> {
  const s = await ownSession(ctx, i.session_id)
  if (!s) return { error: 'no such recording' }
  const patch: Record<string, unknown> = {}
  const title = i.title.trim().slice(0, 200)
  if (title) patch.title = title
  const cat = i.category.trim()
  if (cat) patch.meeting_type = (COMMON_TYPES.find((t) => foldName(t) === foldName(cat)) ?? cat).slice(0, 40)
  if (!Object.keys(patch).length) return { error: 'nothing to change' }
  await updateSession(s.id, patch)
  return { ok: true, was: { title: s.title, category: s.meeting_type }, now: { title: patch.title ?? s.title, category: patch.meeting_type ?? s.meeting_type } }
}

async function redoNotes(ctx: Ctx, id: string): Promise<unknown> {
  const s = await ownSession(ctx, id)
  if (!s) return { error: 'no such recording' }
  if (!s.transcript?.utterances?.length && !s.transcript?.text) return { error: 'this recording has no transcript yet' }
  if (ctx.redo) return { error: 'one rewrite per message' }
  ctx.redo = { sessionId: s.id, ...(s.meeting_type ? { type: s.meeting_type } : {}) }
  return { ok: true, queued: true, recording: s.title ?? s.source_name, note: 'Starts after your reply; the new briefing is sent here in a minute or two.' }
}

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<unknown> {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (name) {
    case 'search_recordings':
      return searchRecordings(ctx, str('question') || ctx.question)
    case 'open_todos':
      return openTodos(ctx, str('person') || undefined, input.include_others === true)
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
    case 'list_recordings':
      return listRecordings(ctx, str('query'))
    case 'recording_people':
      return recordingPeople(ctx, str('session_id'))
    case 'add_person':
      return addPerson(ctx, { session_id: str('session_id'), name: str('name'), email: str('email') })
    case 'remove_person':
      return removePerson(ctx, { session_id: str('session_id'), name: str('name') })
    case 'name_speaker':
      return nameSpeaker(ctx, { session_id: str('session_id'), label: str('label'), name: str('name'), is_me: input.is_me === true })
    case 'update_recording':
      return updateRecording(ctx, { session_id: str('session_id'), title: str('title'), category: str('category') })
    case 'redo_notes':
      return redoNotes(ctx, str('session_id'))
    case 'cancel_reminder':
      return (await cancelReminder(ctx.email, str('id'))) ? { ok: true } : { error: 'no such pending reminder' }
    default:
      return { error: `unknown tool ${name}` }
  }
}

/* ------------------------------------------------------------------- loop */

const HINT: Record<Lang, { to: string; subject: string; send: string; noEmail: string; own: string }> = {
  en: { to: 'To', subject: 'Subject', send: 'Reply *send it* to send, or tell me what to change.', noEmail: 'Send me their email and I\'ll add it.', own: 'Or send it from your own email:' },
  es: { to: 'Para', subject: 'Asunto', send: 'Responde *envíalo* para mandarlo, o dime qué cambiar.', noEmail: 'Mándame su email y lo agrego.', own: 'O mándalo desde tu propio correo:' },
  pt: { to: 'Para', subject: 'Assunto', send: 'Responda *enviar* para mandar, ou me diga o que mudar.', noEmail: 'Me mande o email e eu adiciono.', own: 'Ou envie do seu próprio email:' },
}

function openLink(id: string): string {
  const base = (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  return `${base}/api/pen/open/${id}`
}

export function draftPreview(d: Draft, lang: Lang = 'en'): string {
  const h = HINT[lang]
  return (
    `✉️ *${h.to}:* ${d.toName}${d.toEmail ? ` <${d.toEmail}>` : ''}\n*${h.subject}:* ${d.subject}\n\n${d.body}\n\n` +
    `_${d.toEmail ? h.send : h.noEmail}_` +
    (d.toEmail ? `\n${h.own} ${openLink(d.id)}` : '')
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
  const recentTitle = opts.recent ? ((await getSession(opts.email, opts.recent).catch(() => null))?.title ?? null) : null
  const ctx: Ctx = { ...opts, userName, recentTitle, citations: [], drafted: null, sent: false, enrich: new Set() }
  const pending = await getDraft(opts.email).catch(() => null)

  if (pending?.toEmail && SEND_IT.test(opts.question)) {
    const r = (await sendDraft(ctx)) as { ok?: boolean; error?: string }
    if (r.ok) return { text: SENT[opts.lang](`${pending.toName} <${pending.toEmail}>`, pending.subject), citations: [] }
    // Not sent (daily cap, provider error): let the model explain it in context.
  }

  // Briefings sent here are in the history as assistant turns with no user turn before them
  // (sendWhatsAppBriefing), and two can arrive in a row. Same-role turns are merged, and a
  // history that opens with Juno's message gets a stand-in for the recording the user sent, so
  // "Carlos and Titi" in reply to "Who was on this call?" keeps the question it answers.
  const messages: Anthropic.MessageParam[] = []
  for (const t of [...opts.history.slice(-12), { role: 'user' as const, content: opts.question }]) {
    const last = messages[messages.length - 1]
    if (last && last.role === t.role) last.content = `${last.content as string}\n\n${t.content}`
    else messages.push({ role: t.role, content: t.content })
  }
  if (messages[0]?.role === 'assistant') messages.unshift({ role: 'user', content: '(I sent you a recording.)' })

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
  const enrich = [...ctx.enrich]
  return {
    text: text || '…',
    citations,
    ...(ctx.redo ? { redo: ctx.redo } : {}),
    ...(enrich.length
      ? { after: async () => { await Promise.all(enrich.map((id) => enrichPerson(opts.email, id).catch((e) => console.warn(`pen whatsapp: enrich ${id}: ${(e as Error).message}`)))) } }
      : {}),
  }
}
