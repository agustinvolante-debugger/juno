// What Juno heard that it can offer to help with (plan 15 Oct, B and C). Types and the table
// are in suggestions-types.ts; nothing here ever acts: an offer is a question, and only the
// user's yes (whatsapp/tools/offers.ts) does anything.
//
//   findSuggestions   one cheap Haiku pass over the notes and the transcript, after the notes
//                     (unattended.ts): meetings proposed, dated promises the to-dos don't already
//                     carry, and things Juno could help with (an exam → a study plan in Notion,
//                     "I'll write a memo" → a Notion doc). Plus the user's own dated to-dos, which
//                     need no model: a reminder the day before is the offer.
//   renderOffers      the 1–3 best for one recording as ONE short WhatsApp message, each a yes/no,
//                     numbered when more than one. Writes nothing; markOffered marks them once
//                     the message has really gone out. WHEN it is sent is the scheduler's call.
//
// Times: the model resolves "next Tuesday at 2" against the recording's date into a local wall
// time; the zone is what was said ("2 PT"), else the user's (profile.timeZone, else the phone's
// country code; +1 is six zones, so unknown). With no zone, starts_at stays null and the wall
// time is kept in detail.local, so accepting asks for the zone rather than guessing.
//
// Dedupe: the same promise heard twice (a joined meeting's parts, redo notes, the same meeting
// mentioned on two calls) is one row: a stable key per user, and inserts never overwrite, so a
// dismissed offer stays dismissed.

import { userZone as resolveUserZone } from './timezone'
import crypto from 'node:crypto'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { penAnthropic } from './anthropic'
import { isMissingSchema } from './allowance'
import { getAccount } from './accounts'
import { isReadOnly } from './access'
import { getProfile } from './profile'
import { userLang } from './user-lang'
import { foldName } from './speakers'
import { getSession, updateSession, type PenSession } from './store'
import { groupSessions, timedDialogue } from './merge'
import { dialogueOf } from './pipeline'
import { isMine } from './todo-labels'
import type { Lang } from './currency'
import type { Suggestion, SuggestionKind } from './suggestions-types'

const MODEL = 'claude-haiku-5-5'
/** Long recordings: the opening and the end, where plans and next steps are said. */
const HEAD_CHARS = 50_000
const TAIL_CHARS = 90_000
const MAX_OFFERS = 3
/** Dated to-dos further out than this are not offered as reminders yet. */
const FOLLOWUP_DAYS = 14

const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', pt: 'Portuguese' }

/* ------------------------------------------------------------------ time zones */

export function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.includes('/')) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}


/** The user's zone (timezone.ts: said on WhatsApp, the browser's, else the linked phone's). */
export async function userZone(email: string): Promise<string | null> {
  const { data: link } = await supabaseAdmin.from('pen_whatsapp_links').select('phone').eq('email', email.toLowerCase()).maybeSingle()
  return (await resolveUserZone(email, (link?.phone as string | null) ?? null)).tz
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMin(d: Date, tz: string): number {
  const s = d.toLocaleString('sv-SE', { timeZone: tz, hour12: false })
  return (new Date(`${s.replace(' ', 'T')}Z`).getTime() - d.getTime()) / 60000
}

/** "2026-10-21T14:00" said in tz → the UTC instant. */
export function zonedToUtc(local: string, tz: string): Date {
  const guess = new Date(`${local.slice(0, 16)}:00Z`)
  let d = new Date(guess.getTime() - offsetMin(guess, tz) * 60000)
  const again = offsetMin(d, tz)
  d = new Date(guess.getTime() - again * 60000)
  return d
}

/** Today's date where the user is (UTC when unknown). */
export function todayIn(tz: string | null, now = new Date()): string {
  return tz ? now.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 10) : now.toISOString().slice(0, 10)
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-CL', pt: 'pt-BR' }

/** "Tue, Oct 21, 2:00 PM PDT" in the zone; the day alone when there is no time. */
export function whenText(s: { starts_at: string | null; due_at?: string | null; detail: Record<string, unknown> }, lang: Lang): string {
  const tz = validZone(s.detail.tz) ? s.detail.tz : null
  if (s.starts_at && tz) {
    return new Date(s.starts_at).toLocaleString(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' })
  }
  const local = typeof s.detail.local === 'string' ? s.detail.local : ''
  const day = typeof s.detail.date === 'string' ? s.detail.date : ''
  if (local) {
    const d = new Date(`${local}:00Z`)
    return d.toLocaleString(LOCALE[lang], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  }
  if (day) return new Date(`${day}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return typeof s.detail.when_said === 'string' ? s.detail.when_said : ''
}

/* ------------------------------------------------------------------ the pass */

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['meeting', 'followup', 'notion', 'other'] },
          title: { type: 'string', description: 'One short line in the requested language, e.g. "Meet Chris about the billbacks".' },
          offer: {
            type: 'string',
            description:
              'One yes/no question to the user in the requested language, at most 140 characters, that says what was heard and what Juno ' +
              'would do. E.g. "Chris mentioned meeting next Tuesday at 2 PM. Add it to your calendar?"',
          },
          person: { type: 'string', description: 'The other person, by name as said, or "".' },
          quote: { type: 'string', description: 'The words from the transcript, copied exactly, at most 200 characters.' },
          when_said: { type: 'string', description: 'The time as said ("next Tuesday at 2", "el jueves"), or "".' },
          date: { type: 'string', description: 'YYYY-MM-DD resolved against the recording date, or "" if no day can be worked out.' },
          time: { type: 'string', description: 'HH:MM (24 h) if a clock time was said, else "".' },
          tz_said: { type: 'string', description: 'IANA zone ONLY if one was said ("2 PT" → America/Los_Angeles), else "".' },
          duration_min: { type: 'integer', description: 'Only if said, else 0.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          doc: { type: 'string', enum: ['study_plan', 'memo', 'prep', ''], description: 'For notion: which page would help.' },
          subject: { type: 'string', description: 'For notion: what the page is about, in a few words. Else "".' },
        },
        required: ['kind', 'title', 'offer', 'person', 'quote', 'when_said', 'date', 'time', 'tz_said', 'duration_min', 'confidence', 'doc', 'subject'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

const SYSTEM = `You read a recorded conversation for the person who recorded it ("the user") and list the few things a good assistant would offer to help with afterwards. The user is asked yes or no for each. Don't pad the list, but never leave out a meeting the user agreed to: when its day was only loosely agreed, list it with confidence low.

Kinds:
- meeting: a meeting or call the USER will be in, proposed or agreed with a day ("let's meet next Tuesday at 2", "nos juntamos el jueves", "I'll set up a call with Mark on Monday"). The next one of a recurring meeting counts when its day is set ("we'll call you next week for our weekly check-in" + "Thursday works" → that Thursday). Not meetings other people will have without the user, not hypothetical examples ("say you had a Zoom next Tuesday…"), not events already over. A meeting with a day but no time is fine (time "").
- followup: a promise WITH A DATE that is NOT already in the to-do list you are given (those are handled). The same task worded differently is already in the list. Usually there are none.
- notion: something the user has coming that a written page would help with (offer it even when a to-do for it exists; the page is the help): an exam or test (doc study_plan), a memo, plan or document the user said they would write (doc memo), a meeting or interview to prepare for (doc prep).
- other: anything else clearly helpable for the user that is NOT in the to-do list (a trip coming up). Rare.
Juno can only: add events to the user's calendar, remind the user, write pages in Notion, add to-dos, and draft emails the user approves. Never offer to send something to someone on the user's behalf.

Rules:
- Resolve days against the recording date given (its weekday is given). "Next Tuesday" said on a Wednesday is the Tuesday of next week; "el jueves" is the coming Thursday. If no day can be worked out, date "" and confidence low.
- Never list something whose date is before the recording date.
- quote: copy the words exactly from one transcript line (without the time or speaker). Never paraphrase.
- Speaker letters (A, B…) are voices, not names: never use them as a person.
- Write title and offer in the requested language, even when the conversation is in another. In the offer, say the time the way it was said plus the day ("next Tuesday, Oct 21, at 2 PM") and one clear question.
- At most 6 items. None is a fine answer.`

type Raw = {
  kind: SuggestionKind; title: string; offer: string; person: string; quote: string; when_said: string; date: string
  time: string; tz_said: string; duration_min: number; confidence: 'high' | 'medium' | 'low'; doc: string; subject: string
}

const fold = (s: string) => foldName(s).replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()

/** The quote really is in the transcript: some run of five of its words is there, in order. */
function quoteFound(quote: string, foldedDialogue: string): boolean {
  const w = fold(quote).split(' ').filter(Boolean)
  if (!w.length) return false
  if (w.length <= 5) return foldedDialogue.includes(w.join(' '))
  for (let i = 0; i + 5 <= w.length; i++) if (foldedDialogue.includes(w.slice(i, i + 5).join(' '))) return true
  return false
}

function cut(dialogue: string): string {
  if (dialogue.length <= HEAD_CHARS + TAIL_CHARS) return dialogue
  return `${dialogue.slice(0, HEAD_CHARS)}\n\n[… middle of the recording left out …]\n\n${dialogue.slice(-TAIL_CHARS)}`
}

/** "Carlos V" and "Carlos" are the same person to a key. */
const first = (person: string | null | undefined) => fold(person ?? '').split(' ')[0] ?? ''
const key = (...parts: (string | null | undefined)[]) => crypto.createHash('sha1').update(parts.map((p) => fold(p ?? '')).join('|')).digest('hex').slice(0, 20)

type Row = Omit<Suggestion, 'id' | 'created_at' | 'offered_at' | 'decided_at' | 'state'> & { state?: Suggestion['state'] }

/** The recording a joined meeting's suggestions belong to: its first part, which carries the notes. */
async function rootOf(email: string, session: PenSession): Promise<{ root: PenSession; parts: PenSession[] }> {
  if (!session.merge_group) return { root: session, parts: [session] }
  const parts = await groupSessions(email, session.merge_group)
  return parts.length > 1 ? { root: parts[0], parts } : { root: session, parts: [session] }
}

/** The user's own dated to-dos, as "remind you the day before?" offers. No model call. */
function todoFollowups(email: string, root: PenSession, tz: string | null, lang: Lang, today: string): Row[] {
  const actions = root.notes?.actions ?? []
  const meta = Array.isArray(root.action_meta) && root.action_meta.length === actions.length ? root.action_meta : []
  const done = new Set(Array.isArray(root.action_done) ? root.action_done : [])
  const out: Row[] = []
  actions.forEach((a, i) => {
    const m = meta[i]
    if (!m?.due_date || done.has(i) || !isMine(m) || m.due_date < today || m.due_date > addDays(today, FOLLOWUP_DAYS)) return
    // The morning before it is due, at 9; the morning of, when the day before has gone by.
    let remindDay = addDays(m.due_date, -1)
    if (remindDay <= today) remindDay = m.due_date
    const remindLocal = `${remindDay}T09:00`
    const remindAt = tz ? zonedToUtc(remindLocal, tz) : null
    if (remindAt && remindAt.getTime() < Date.now() + 30 * 60 * 1000) return
    const dueText = new Date(`${m.due_date}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const remindText = new Date(`${remindDay}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { weekday: 'long', timeZone: 'UTC' })
    const action = shortAction(a.action)
    const offer = {
      en: `${m.waiting ? `${m.waiting} is waiting on: ` : 'Due '}${m.waiting ? `${action}, by ${dueText}` : `${dueText}: ${action}`}. Remind you ${remindText} at 9 AM?`,
      es: `${m.waiting ? `${m.waiting} espera: ${action}, para el ${dueText}` : `Para el ${dueText}: ${action}`}. ¿Te lo recuerdo el ${remindText} a las 9?`,
      pt: `${m.waiting ? `${m.waiting} está esperando: ${action}, até ${dueText}` : `Até ${dueText}: ${action}`}. Te lembro ${remindText} às 9h?`,
    }[lang]
    out.push({
      user_email: email,
      session_id: root.id,
      kind: 'followup',
      title: action.slice(0, 200),
      detail: { source: 'todo', ref: `${root.id}#${i}`, action, due_date: m.due_date, remind_local: remindLocal, tz, offer, lang, confidence: 'high' },
      quote: null,
      person: m.waiting,
      starts_at: null,
      due_at: remindAt ? remindAt.toISOString() : `${m.due_date}T23:59:00Z`,
      dedupe: key('followup', root.id, first(m.waiting), m.due_date),
    })
  })
  return out
}

/** A to-do as one clause for a message: "Prepare for round one", not the whole paragraph. */
function shortAction(t: string): string {
  let a = t.trim().replace(/\.$/, '')
  const cutAt = [' — ', ': ', '; ', ' (', ' – '].map((m) => a.indexOf(m)).filter((i) => i >= 15).sort((x, y) => x - y)[0]
  if (cutAt) a = a.slice(0, cutAt)
  if (a.length > 90) a = `${a.slice(0, 90).replace(/\s+\S*$/, '')}…`
  return /^[A-Z][a-z]/.test(a) ? a[0].toLowerCase() + a.slice(1) : a
}

/**
 * Finds what Juno could offer for one recording (the whole meeting, for a joined one) and
 * stores it. Returns what was found this run, stored or not. `store: false` is the dry run.
 */
export async function findSuggestions(email: string, session: PenSession, opts: { store?: boolean } = {}): Promise<Row[]> {
  const { root, parts } = await rootOf(email, session)
  if (!root.notes || root.notes.empty) return []
  const lang = await userLang(email)
  const tz = await userZone(email)
  const today = todayIn(tz)
  const recorded = (root.recorded_at ?? root.created_at)
  const recDay = tz ? new Date(recorded).toLocaleString('sv-SE', { timeZone: tz }).slice(0, 10) : recorded.slice(0, 10)
  const recWeekday = new Date(`${recDay}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

  const dialogue = parts.length > 1 ? timedDialogue(parts) : dialogueOf(root)
  if (!dialogue.trim()) return []
  const profileName = (await getProfile(email).catch(() => null))?.name?.trim() || null
  const actions = root.notes.actions ?? []
  const meta = Array.isArray(root.action_meta) ? root.action_meta : []
  const todoList = actions.map((a, i) => `- ${a.action}${meta[i]?.due_date ? ` (due ${meta[i]!.due_date})` : a.due ? ` (due ${a.due})` : ''}`).join('\n')

  const res = await penAnthropic('suggestions').messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content:
        `The user: ${profileName ?? 'name unknown'}\n` +
        `Recording date: ${recDay} (${recWeekday}). Today: ${today}.\n` +
        `User's time zone: ${tz ?? 'unknown'}\n` +
        (root.notes.summary ? `\nSummary of the notes:\n${root.notes.summary}\n` : '') +
        `\nTo-do list already taken from this recording (no followup for these; a meeting or a page about one is still welcome):\n${todoList || '(none)'}\n` +
        `\nTranscript:\n${cut(dialogue)}\n\nWrite title and offer in ${LANG_NAME[lang]}.`,
    }],
    // High: measured on a real 115-minute call, low found its one meeting on 2 of 3 runs and
    // medium on 0 of 3; high on 3 of 3, in about 15 s. It runs after the briefing, nobody waits.
    output_config: { format: jsonSchemaOutputFormat(SCHEMA), effort: 'high' },
  })
  const raw = (res.parsed_output?.items ?? []) as Raw[]
  const folded = fold(dialogue)
  const rows: Row[] = []
  for (const r of raw) {
    const quote = r.quote.trim().slice(0, 300)
    if (!quote || !quoteFound(quote, folded)) {
      console.warn(`pen suggestions: dropped "${r.title}" on ${root.id}: quote not in the transcript`)
      continue
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : ''
    if (date && date < today) continue
    const time = /^\d{2}:\d{2}$/.test(r.time) ? r.time : ''
    const zone = validZone(r.tz_said) ? r.tz_said : tz
    const local = date && time ? `${date}T${time}` : ''
    const startsAt = local && zone ? zonedToUtc(local, zone) : null
    if (startsAt && startsAt.getTime() < Date.now()) continue
    const person = r.person.trim() && !/^(speaker\s*)?[a-z]$/i.test(r.person.trim()) ? r.person.trim().slice(0, 80) : null
    const kind: SuggestionKind = (['meeting', 'followup', 'notion', 'other'] as const).includes(r.kind) ? r.kind : 'other'
    if ((kind === 'meeting' || kind === 'followup') && !date) continue
    const doc = kind === 'notion' ? (['study_plan', 'memo', 'prep'].includes(r.doc) ? r.doc : 'memo') : undefined
    rows.push({
      user_email: email,
      session_id: root.id,
      kind,
      title: r.title.trim().slice(0, 200),
      detail: {
        offer: r.offer.trim().slice(0, 220),
        lang,
        when_said: r.when_said.trim() || null,
        date: date || null,
        local: local || null,
        tz: zone,
        tz_said: validZone(r.tz_said),
        duration_min: r.duration_min > 0 ? Math.min(r.duration_min, 600) : null,
        confidence: local && !zone ? 'low' : r.confidence,
        ...(doc ? { doc, subject: r.subject.trim().slice(0, 120) || r.title.trim().slice(0, 120) } : {}),
      },
      quote,
      person,
      starts_at: kind === 'meeting' && startsAt ? startsAt.toISOString() : null,
      due_at: startsAt ? startsAt.toISOString() : date ? `${date}T23:59:00Z` : null,
      dedupe: kind === 'meeting'
        ? key('meeting', first(person), date)
        // Wording changes between runs (redo notes), so pages and other help key on what is
        // stable: the recording, the kind of page, the person, the day.
        : kind === 'notion'
          ? key('notion', root.id, doc)
          : key('item', root.id, first(person), date),
    })
  }
  rows.push(...todoFollowups(email, root, tz, lang, today))

  // One row per key even within a run.
  const unique = [...new Map(rows.map((r) => [r.dedupe, r])).values()]
  if (opts.store !== false && unique.length) {
    const { error } = await supabaseAdmin.from('pen_suggestions').upsert(unique, { onConflict: 'user_email,dedupe', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  return unique
}

/**
 * The unattended path's hook (unattended.ts): after the notes, for WhatsApp and web uploads
 * alike. Skips samples and read-only accounts, and never throws.
 */
export async function scanSuggestions(email: string, sessionId: string): Promise<void> {
  try {
    const s = await getSession(email, sessionId)
    if (!s?.notes || s.notes.empty || s.status !== 'noted') return
    if (s.source_channel === 'sample' || String(s.storage_path ?? '').startsWith('sample')) return
    if (isReadOnly(await getAccount(email).catch(() => null), email)) return
    // A tail part: the first part carries the meeting (rootOf), so it is scanned from there.
    if (s.merge_group && (s.merge_index ?? 0) > 0) {
      const parts = await groupSessions(email, s.merge_group)
      if (parts[0] && parts[0].id !== s.id) return scanSuggestions(email, parts[0].id)
    }
    const found = await findSuggestions(email, s)
    if (found.length) console.log(`pen suggestions: ${found.length} for ${s.id}`)
  } catch (e) {
    const msg = (e as Error).message
    if (!isMissingSchema(msg)) console.warn(`pen suggestions: ${sessionId}: ${msg}`)
  }
}

/* ------------------------------------------------------------------ reading and offering */

/** Unanswered ones whose moment has gone by. */
export async function expireSuggestions(email: string): Promise<void> {
  const now = new Date().toISOString()
  await supabaseAdmin.from('pen_suggestions').update({ state: 'expired' }).eq('user_email', email).in('state', ['suggested', 'offered']).lt('due_at', now)
  // Undated ones (a memo, prep with no day) go stale after a month.
  const month = new Date(Date.now() - 30 * 86_400_000).toISOString()
  await supabaseAdmin.from('pen_suggestions').update({ state: 'expired' }).eq('user_email', email).in('state', ['suggested', 'offered']).is('due_at', null).lt('created_at', month)
}

export async function listSuggestions(email: string, opts: { sessionId?: string; states?: Suggestion['state'][] } = {}): Promise<Suggestion[]> {
  await expireSuggestions(email).catch(() => {})
  let q = supabaseAdmin.from('pen_suggestions').select('*').eq('user_email', email).in('state', opts.states ?? ['suggested', 'offered'])
  if (opts.sessionId) q = q.eq('session_id', opts.sessionId)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as Suggestion[]
}

const CONF: Record<string, number> = { high: 3, medium: 2, low: 1 }
const KIND_RANK: Record<SuggestionKind, number> = { meeting: 4, notion: 3, followup: 2, other: 1 }

/** Best first: surer, meetings before reminders, sooner before later. */
export function rank(a: Suggestion, b: Suggestion): number {
  const score = (s: Suggestion) => (CONF[String(s.detail.confidence)] ?? 1) * 10 + KIND_RANK[s.kind]
  const d = score(b) - score(a)
  if (d) return d
  return String(a.starts_at ?? a.due_at ?? '9').localeCompare(String(b.starts_at ?? b.due_at ?? '9'))
}

/** The offer line in the user's language: the model's, or one built from the row. */
function offerLine(s: Suggestion, lang: Lang): string {
  if (typeof s.detail.offer === 'string' && s.detail.offer && (s.detail.lang ?? lang) === lang) return s.detail.offer
  const when = whenText(s, lang)
  const who = s.person ?? ''
  switch (s.kind) {
    case 'meeting':
      return { en: `${who ? `${who} mentioned meeting` : 'A meeting'} ${when}. Add it to your calendar?`, es: `${who ? `${who} habló de juntarse` : 'Una reunión'} el ${when}. ¿La agrego a tu calendario?`, pt: `${who ? `${who} falou de se encontrar` : 'Uma reunião'} ${when}. Adiciono ao seu calendário?` }[lang]
    case 'notion':
      return { en: `${s.title}. Create a page for it in Notion?`, es: `${s.title}. ¿Te armo una página en Notion?`, pt: `${s.title}. Crio uma página no Notion?` }[lang]
    case 'followup':
      return { en: `${s.title}${when ? ` (${when})` : ''}. Remind you?`, es: `${s.title}${when ? ` (${when})` : ''}. ¿Te lo recuerdo?`, pt: `${s.title}${when ? ` (${when})` : ''}. Te lembro?` }[lang]
    default:
      return { en: `${s.title}. Want help with it?`, es: `${s.title}. ¿Te ayudo con eso?`, pt: `${s.title}. Quer ajuda com isso?` }[lang]
  }
}

const HEAD: Record<Lang, (t: string) => string> = {
  en: (t) => `From "${t}":`,
  es: (t) => `De "${t}":`,
  pt: (t) => `De "${t}":`,
}
const FOOT: Record<Lang, string> = {
  en: 'Reply e.g. "yes to 1, no to 2".',
  es: 'Responde por ejemplo "sí a la 1, no a la 2".',
  pt: 'Responda por exemplo "sim para 1, não para 2".',
}

/**
 * The offer message for one recording: its 1–3 best unanswered suggestions, each a yes/no,
 * numbered when more than one. Pure: writes nothing, so a send the scheduler's rules refuse
 * (quiet hours, the daily max, a dry run) leaves them 'suggested' for the next try. Null when
 * there is nothing to offer. `offered` is what markOffered takes once the message has gone out.
 */
export async function renderOffers(
  email: string,
  sessionId: string,
  lang: Lang,
  /** Several recordings in one message: numbers run on across them (`from`) and the bundle
   *  carries one footer. */
  bundle?: { from: number; footer: boolean },
): Promise<{ text: string; ids: string[]; offered: { id: string; no: number }[] } | null> {
  const pick = (await listSuggestions(email, { sessionId, states: ['suggested'] })).sort(rank).slice(0, MAX_OFFERS)
  if (!pick.length) return null
  const s = await getSession(email, sessionId).catch(() => null)
  const title = s?.title || s?.source_name || ''
  const from = bundle?.from ?? 1
  const numbered = !!bundle || pick.length > 1
  const lines = pick.map((x, i) => (numbered ? `${from + i}. ${offerLine(x, lang)}` : offerLine(x, lang)))
  const footer = bundle ? bundle.footer : pick.length > 1
  const text = [title ? HEAD[lang](title) : '', ...lines, footer ? FOOT[lang] : ''].filter(Boolean).join('\n')
  return { text, ids: pick.map((x) => x.id), offered: pick.map((x, i) => ({ id: x.id, no: from + i })) }
}

/**
 * After the offer message went out: each suggestion 'offered' with its number (detail.offer_no)
 * and the message's time (offered_at, shared by a bundle), so "yes to 3" finds the right one.
 * Only rows still 'suggested' move.
 */
export async function markOffered(email: string, offered: { id: string; no: number }[], at: string): Promise<void> {
  if (!offered.length) return
  const { data } = await supabaseAdmin.from('pen_suggestions').select('id,detail').eq('user_email', email).in('id', offered.map((o) => o.id))
  const detail = new Map(((data ?? []) as { id: string; detail: Record<string, unknown> | null }[]).map((r) => [r.id, r.detail ?? {}]))
  await Promise.all(offered.map((o) =>
    supabaseAdmin.from('pen_suggestions').update({ state: 'offered', offered_at: at, detail: { ...(detail.get(o.id) ?? {}), offer_no: o.no } }).eq('id', o.id).eq('user_email', email).eq('state', 'suggested'),
  ))
}

/** render + mark, for callers that send the text themselves right away (tests, the web). */
export async function composeOffers(email: string, sessionId: string, lang: Lang, bundle?: { from: number; at: string; footer: boolean }): Promise<{ text: string; ids: string[] } | null> {
  const r = await renderOffers(email, sessionId, lang, bundle)
  if (r) await markOffered(email, r.offered, bundle?.at ?? new Date().toISOString())
  return r && { text: r.text, ids: r.ids }
}

/** "1" (in the latest offer message) or an id, among the user's open suggestions. */
export async function resolveSuggestion(email: string, ref: string): Promise<Suggestion | null> {
  const r = ref.trim()
  if (/^[0-9a-f-]{36}$/i.test(r)) {
    const { data } = await supabaseAdmin.from('pen_suggestions').select('*').eq('user_email', email).eq('id', r).maybeSingle()
    return (data as Suggestion) ?? null
  }
  const n = Number(r.replace(/\D/g, '') || '1')
  const open = await listSuggestions(email, { states: ['offered'] })
  const latest = open.map((x) => x.offered_at ?? '').sort().pop()
  return open.find((x) => x.offered_at === latest && Number(x.detail.offer_no ?? 1) === n) ?? null
}

export async function decideSuggestion(
  email: string,
  id: string,
  state: 'accepted' | 'dismissed' | 'done',
  extra: Record<string, unknown> = {},
  /** Columns to set with it (a confirmed meeting's starts_at, read by the scheduler). */
  set: { starts_at?: string } = {},
): Promise<void> {
  const { data } = await supabaseAdmin.from('pen_suggestions').select('detail').eq('user_email', email).eq('id', id).maybeSingle()
  const { error } = await supabaseAdmin
    .from('pen_suggestions')
    .update({ state, decided_at: new Date().toISOString(), ...set, ...(Object.keys(extra).length ? { detail: { ...((data?.detail as Record<string, unknown>) ?? {}), ...extra } } : {}) })
    .eq('user_email', email)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Adds the user's own to-dos to a recording (the same shape add_todo writes). */
export async function addDatedTodos(email: string, sessionId: string, items: { action: string; due_date: string | null; waiting?: string | null }[]): Promise<number> {
  const s = await getSession(email, sessionId)
  if (!s || !items.length) return 0
  const notes = { ...(s.notes ?? {}) }
  const actions = notes.actions ?? []
  const meta = Array.from({ length: actions.length }, (_, i) => (Array.isArray(s.action_meta) && s.action_meta.length === actions.length ? s.action_meta[i] : { mine: 'unclear' as const, due_date: null, waiting: null }))
  notes.actions = [...actions, ...items.map((x) => ({ action: x.action.slice(0, 500), owner: '', due: x.due_date ?? '', priority: 'normal' as const }))]
  meta.push(...items.map((x) => ({ mine: 'me' as const, due_date: x.due_date, waiting: x.waiting ?? null })))
  await updateSession(s.id, { notes, action_meta: meta })
  return items.length
}
