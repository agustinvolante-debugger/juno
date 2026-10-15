// Saying yes to one of Juno's offers (lib/pen/suggestions.ts). One implementation for both
// doors: the WhatsApp assistant (whatsapp/tools/offers.ts, "yes to 1") and the web ("Juno
// noticed" on a recording and Home, app/api/pen/suggestions). The caller has already had the
// user's yes: the offer was the question, and on the web the click is the yes. Nothing here
// runs without one.
//
// The results are written for the WhatsApp model (the `note`s tell it what to say); the web
// reads the same fields (needs, added_to, calendar_ics, notion_url, reminder_set…).
//
//   meeting   → Google Calendar connected: the event is added there at once. Not connected (or
//               Google refuses): calendar links (.ics for Apple Calendar, Google template), alarm
//               inside. Without a known time (or zone) it says what it needs instead.
//   followup  → a WhatsApp reminder (pen_reminders) when it is within maxAheadMs and there is a
//               linked phone; otherwise only the dated to-do.
//   notion    → the page in Notion (+ dated to-dos), or, not connected, the Settings link; with
//               plain, a to-do plan instead.
//   other     → accepted.

import { calendarLinks, type CalEvent } from './calendar'
import { createEvent, gcalConnected } from './google-calendar'
import { addReminder, maxAheadMs } from './reminders'
import { createDocPage, notionConnected } from './notion'
import { draftDoc } from './suggestion-docs'
import { addDatedTodos, decideSuggestion, todayIn, userZone, validZone, whenText, zonedToUtc } from './suggestions'
import type { Suggestion } from './suggestions-types'
import type { Lang } from './currency'

/** Who is saying yes. `phone`: the linked WhatsApp number, for reminders (null: none linked). */
export type AcceptCtx = { email: string; lang: Lang; phone: string | null }

const base = () => (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')

const ZONE_NOTE = 'said on the call, given by the user, or saved for them; use it, no need to mention or question it'

export const TZ_ASK = {
  en: 'What time zone is that in? (e.g. Pacific, Eastern, Chile)',
  es: '¿En qué zona horaria? (por ejemplo Pacífico, Chile)',
  pt: 'Em qual fuso horário? (por exemplo Brasília, Pacífico)',
} as const

export async function acceptMeeting(ctx: AcceptCtx, s: Suggestion, tzIn: string, startLocal: string): Promise<unknown> {
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
  const ev: CalEvent = {
    title,
    start: start.toISOString(),
    durationMin: Number(s.detail.duration_min) || 30,
    tz,
    description: s.quote ? `“${s.quote}”` : undefined,
    alarmMin: 30,
  }
  if (await gcalConnected(ctx.email)) {
    try {
      const e = await createEvent(ctx.email, ev, { ref: s.id })
      await decideSuggestion(ctx.email, s.id, 'done', { local, tz, gcal_event_id: e.id, gcal_link: e.link }, { starts_at: start.toISOString() })
      return {
        ok: true,
        added_to: 'Google Calendar',
        title,
        when,
        time_zone: `${tz} (${ZONE_NOTE})`,
        event_id: e.id,
        note:
          'Say "Added to your Google Calendar:" with the title and when, in one line (it has a 30-minute alert). Then offer in one ' +
          `line a Google Meet link (on yes: add_meet_link with event_id) and to invite ${s.person ?? 'the other person'} (needs their ` +
          'email; on yes: invite_to_meeting with event_id, which asks before Google emails them).',
      }
    } catch (err) {
      // Revoked or down: fall through to the links, which still work.
      console.warn(`pen offers: google calendar for ${s.id}: ${(err as Error).message}`)
    }
  }
  try {
    const links = calendarLinks(ev)
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

export async function acceptFollowup(ctx: AcceptCtx, s: Suggestion, tzIn: string): Promise<unknown> {
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

export async function acceptNotion(ctx: AcceptCtx, s: Suggestion, plain: boolean): Promise<unknown> {
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

/** Anything else helpable: marked accepted; what to do with it is the caller's (the model helps). */
export async function acceptOther(ctx: AcceptCtx, s: Suggestion): Promise<{ ok: true }> {
  await decideSuggestion(ctx.email, s.id, 'accepted')
  return { ok: true }
}
