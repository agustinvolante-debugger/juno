// Answering Juno's offers (lib/pen/suggestions.ts): "yes to 1", "no to 2", "sure", "no thanks".
//
// An offer is already a question, so the user's yes to it is the go-ahead: accepting runs at
// once, no askConfirm. The one exception is anything that would email someone else (an invite):
// that goes through save_draft, which shows the draft and waits for "send it".
//
//   meeting   → calendar links (.ics for Apple Calendar, Google template), alarm inside; offer
//               an invite. Without a known time zone it asks for one first.
//   followup  → a WhatsApp reminder (pen_reminders) when it is within maxAheadMs (a day, or 30
//               days with the user_reminder template); later than that, only the dated to-do,
//               and the model says so.
//   notion    → the page in Notion (+ dated to-dos), or, not connected, the Settings link and a
//               plain to-do plan on the next yes.
//   other     → accepted; the model helps with the other tools.

import type Anthropic from '@anthropic-ai/sdk'
import { calendarLinks } from '../../calendar'
import { addReminder, maxAheadMs } from '../../reminders'
import { createDocPage, notionConnected } from '../../notion'
import { draftDoc } from '../../suggestion-docs'
import {
  addDatedTodos, decideSuggestion, listSuggestions, resolveSuggestion, todayIn, userZone, validZone, whenText, zonedToUtc,
} from '../../suggestions'
import type { Suggestion } from '../../suggestions-types'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_suggestions',
    description:
      'What Juno offered (or could offer) to help with from the user\'s recordings: meetings heard, reminders, Notion pages. ' +
      'Each with its number in the latest offer message, id, state and the words heard.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string', description: 'Only this recording, or "".' } },
      required: ['session_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'accept_suggestion',
    description:
      'The user said yes to an offer: "yes to 1", "sure", "add it". ref = the number in the latest offer message ("1") or an id. ' +
      'Runs it at once (the offer was the question). time_zone: an IANA zone only if the user just gave one, else "". ' +
      'start_local: "YYYY-MM-DDTHH:MM" only if the user corrected the time, else "". plain: true when the user wants the plan ' +
      'as Juno to-dos instead of Notion.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        time_zone: { type: 'string' },
        start_local: { type: 'string' },
        plain: { type: 'boolean' },
      },
      required: ['ref', 'time_zone', 'start_local', 'plain'],
      additionalProperties: false,
    },
  },
  {
    name: 'dismiss_suggestion',
    description: 'The user said no to an offer: "no to 2", "no thanks", "skip it". ref = its number in the latest offer message or an id.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
      additionalProperties: false,
    },
  },
]

const base = () => (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')

function view(s: Suggestion, ctx: Ctx) {
  return {
    number: s.state === 'offered' ? (s.detail.offer_no ?? 1) : null,
    id: s.id,
    kind: s.kind,
    state: s.state,
    offer: s.detail.offer ?? s.title,
    when: whenText(s, ctx.lang) || null,
    person: s.person,
    heard: s.quote,
    recording: s.session_id,
  }
}

async function list(ctx: Ctx, sessionId: string): Promise<unknown> {
  const rows = await listSuggestions(ctx.email, sessionId ? { sessionId } : {})
  const latest = rows.filter((r) => r.state === 'offered').map((r) => r.offered_at ?? '').sort().pop()
  // The latest offer message first, in its own order; then anything not offered yet.
  const offered = rows.filter((r) => r.state === 'offered' && r.offered_at === latest).sort((a, b) => Number(a.detail.offer_no ?? 0) - Number(b.detail.offer_no ?? 0))
  const rest = rows.filter((r) => !offered.includes(r))
  return { suggestions: [...offered, ...rest].slice(0, 12).map((s) => view(s, ctx)) }
}

async function find(ctx: Ctx, ref: string): Promise<Suggestion | { error: string }> {
  const s = await resolveSuggestion(ctx.email, ref || '1')
  if (!s) return { error: 'no open offer with that number; call list_suggestions' }
  if (!['suggested', 'offered'].includes(s.state)) return { error: `already ${s.state}` }
  return s
}

async function dismiss(ctx: Ctx, ref: string): Promise<unknown> {
  const s = await find(ctx, ref)
  if ('error' in s) return s
  await decideSuggestion(ctx.email, s.id, 'dismissed')
  return { ok: true, dismissed: s.detail.offer ?? s.title, note: 'Confirm in a few words; no need to explain.' }
}

const ZONE_NOTE = 'said on the call, given by the user, or saved for them; use it, no need to mention or question it'

const TZ_ASK = {
  en: 'What time zone is that in? (e.g. Pacific, Eastern, Chile)',
  es: '¿En qué zona horaria? (por ejemplo Pacífico, Chile)',
  pt: 'Em qual fuso horário? (por exemplo Brasília, Pacífico)',
} as const

async function acceptMeeting(ctx: Ctx, s: Suggestion, tzIn: string, startLocal: string): Promise<unknown> {
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startLocal) ? startLocal : typeof s.detail.local === 'string' ? s.detail.local : ''
  const tz = validZone(tzIn) ? tzIn : validZone(s.detail.tz) ? s.detail.tz : await userZone(ctx.email)
  if (!local) {
    return {
      needs: 'time',
      day: whenText({ starts_at: null, detail: s.detail }, ctx.lang),
      ...(tz ? { time_zone: `${tz} (${ZONE_NOTE})` } : {}),
      note: `No time was said on the call. Ask only what time${tz ? '' : ' and in which time zone'}, then accept_suggestion again with start_local.`,
    }
  }
  if (!tz) return { needs: 'time_zone', ask_user: TZ_ASK[ctx.lang], note: 'Ask exactly this; on the answer, accept_suggestion again with time_zone (IANA).' }
  const start = zonedToUtc(local, tz)
  if (start.getTime() < Date.now()) return { error: 'that time has already passed' }
  const detail = { ...s.detail, local, tz }
  const when = whenText({ starts_at: start.toISOString(), detail }, ctx.lang)
  const title = s.person && !s.title.toLowerCase().includes(s.person.toLowerCase()) ? `${s.title} (${s.person})` : s.title
  try {
    const links = calendarLinks({
      title,
      start: start.toISOString(),
      durationMin: Number(s.detail.duration_min) || 30,
      tz,
      description: s.quote ? `“${s.quote}”` : undefined,
      alarmMin: 30,
    })
    // starts_at = the confirmed start (a corrected time too): the scheduler's meeting briefs and
    // morning brief read it (proactive.ts acceptedMeetings).
    await decideSuggestion(ctx.email, s.id, 'done', { local, tz, calendar: links }, { starts_at: start.toISOString() })
    return {
      ok: true,
      when,
      time_zone: `${tz} (${ZONE_NOTE})`,
      calendar_ics: links.ics,
      calendar_google: links.google,
      note:
        'Give both links as plain URLs: the first opens Apple Calendar on iPhone ("tap, Add, then come back here"), the second Google ' +
        `Calendar. It has a 30-minute alert. Then offer in one line to email ${s.person ?? 'the other person'} an invite (needs their ` +
        'email; use save_draft with the calendar link, never send without their yes).',
    }
  } catch (e) {
    // Calendar links not available: keep the date as a to-do so it isn't lost.
    console.warn(`pen offers: calendar links for ${s.id}: ${(e as Error).message}`)
    if (s.session_id) await addDatedTodos(ctx.email, s.session_id, [{ action: `${title} — ${when}`, due_date: local.slice(0, 10), waiting: s.person }])
    await decideSuggestion(ctx.email, s.id, 'accepted', { local, tz, calendar_error: (e as Error).message.slice(0, 200) }, { starts_at: start.toISOString() })
    return {
      ok: true,
      when,
      calendar: 'unavailable',
      added_todo: Boolean(s.session_id),
      note: 'The calendar link could not be made right now. Say so in one line, say it is saved as a to-do for that day, and that a calendar link will come.',
    }
  }
}

async function acceptFollowup(ctx: Ctx, s: Suggestion, tzIn: string): Promise<unknown> {
  const remindLocal = typeof s.detail.remind_local === 'string' ? s.detail.remind_local : ''
  const dueDate = typeof s.detail.due_date === 'string' ? s.detail.due_date : typeof s.detail.date === 'string' ? s.detail.date : null
  const tz = validZone(tzIn) ? tzIn : validZone(s.detail.tz) ? s.detail.tz : await userZone(ctx.email)
  if (!tz && remindLocal) return { needs: 'time_zone', ask_user: TZ_ASK[ctx.lang], note: 'Ask exactly this; on the answer, accept_suggestion again with time_zone (IANA).' }
  const at = remindLocal && tz ? zonedToUtc(remindLocal, tz) : null
  const text = String(s.detail.action ?? s.title)
  // A to-do the notes don't have yet (the model found this promise), dated, so it shows on Today.
  if (s.detail.source !== 'todo' && s.session_id) await addDatedTodos(ctx.email, s.session_id, [{ action: text, due_date: dueDate, waiting: s.person }])
  const ahead = at ? at.getTime() - Date.now() : -1
  if (at && ctx.phone && ahead > 30_000 && ahead <= maxAheadMs(ctx.lang)) {
    const r = await addReminder({ email: ctx.email, phone: ctx.phone, text, dueAt: at, lang: ctx.lang })
    await decideSuggestion(ctx.email, s.id, 'done', { tz, reminder_id: r.id, remind_at: r.due_at })
    return { ok: true, reminder_set: whenText({ starts_at: r.due_at, detail: { tz } }, ctx.lang), time_zone: `${tz} (${ZONE_NOTE})`, text }
  }
  // Further out than a reminder can be sent (or no time): the dated to-do is all there is.
  await decideSuggestion(ctx.email, s.id, 'accepted', { tz, to_do_only: true })
  return {
    ok: true,
    reminder_set: false,
    time_zone: tz ? `${tz} (${ZONE_NOTE})` : null,
    due_date: dueDate,
    text,
    note:
      'No reminder message is set for this one: it is too far ahead for a WhatsApp reminder. Say honestly, in one line, that ' +
      'it is on their to-dos' + (dueDate ? ' for the due date' : '') + ' (it shows on Today), not a reminder at a set time.',
  }
}

async function acceptNotion(ctx: Ctx, s: Suggestion, plain: boolean): Promise<unknown> {
  const connected = await notionConnected(ctx.email)
  if (!connected && !plain) {
    return {
      notion_connected: false,
      settings_link: `${base()}/settings/notion`,
      note:
        'Notion is not connected. Say so in one line with this link to connect it, and offer instead a plain to-do plan here ' +
        '(on their yes: accept_suggestion again with plain true). Nothing was created yet.',
    }
  }
  const tz = await userZone(ctx.email)
  const draft = await draftDoc(ctx.email, s, ctx.lang, todayIn(tz))
  const dated = draft.todos.filter((t) => t.due_date)
  const todos = s.session_id ? await addDatedTodos(ctx.email, s.session_id, plain ? draft.todos : dated) : 0
  if (plain) {
    await decideSuggestion(ctx.email, s.id, 'done', { plain: true, todos })
    return { ok: true, plan: draft.todos.map((t) => `${t.due_date ?? ''} ${t.action}`.trim()), todos_added: todos, note: 'List the plan in short "• " lines.' }
  }
  const page = await createDocPage(ctx.email, { title: draft.title, kind: draft.kind, sessionId: s.session_id, date: draft.date, blocks: draft.blocks })
  await decideSuggestion(ctx.email, s.id, 'done', { url: page.url, todos })
  return { ok: true, notion_url: page.url, title: draft.title, dated_todos_added: todos, note: 'Give the Notion link and say the dated steps are on their to-dos as reminders.' }
}

async function accept(ctx: Ctx, i: { ref: string; time_zone: string; start_local: string; plain: boolean }): Promise<unknown> {
  const s = await find(ctx, i.ref)
  if ('error' in s) return s
  switch (s.kind) {
    case 'meeting':
      return acceptMeeting(ctx, s, i.time_zone, i.start_local)
    case 'followup':
      return acceptFollowup(ctx, s, i.time_zone)
    case 'notion':
      return acceptNotion(ctx, s, i.plain)
    default:
      await decideSuggestion(ctx.email, s.id, 'accepted')
      return { ok: true, title: s.title, heard: s.quote, person: s.person, recording: s.session_id, note: 'Help with it now with the other tools (save_draft, add_todo…); ask one short question if it is unclear what they want.' }
  }
}

export const offersModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => {
    switch (name) {
      case 'list_suggestions':
        return list(ctx, str(input, 'session_id'))
      case 'accept_suggestion':
        return accept(ctx, { ref: str(input, 'ref'), time_zone: str(input, 'time_zone'), start_local: str(input, 'start_local'), plain: input.plain === true })
      case 'dismiss_suggestion':
        return dismiss(ctx, str(input, 'ref'))
      default:
        return undefined
    }
  },
  prompt:
    '- Juno sometimes messages first with offers from a recording ("1. … Add it to your calendar? 2. … Remind you Thursday?"). ' +
    'A reply to that ("yes to 1", "sure", "add it", "sí", "no thanks", "1 yes 2 no") is accept_suggestion / dismiss_suggestion ' +
    'for each number (a single unnumbered offer is 1), not confirm_pending and not set_reminder. Not sure which offer they mean: ' +
    'list_suggestions. The offer was the question, so act at once; only an email to someone else (an invite) still needs ' +
    'save_draft and their "send it". After accepting, confirm in one or two lines with the time and any link, exactly as the tool gives it.\n',
}
