// find_meeting (20 Oct): "the meeting with Chris tomorrow" found wherever it is, in one turn.
//
// The founder's 19 Oct chat took five messages: calendar search only matched titles, the invite
// was in a Gmail inbox whose calendar wasn't connected, Gmail search was literal ("chrisdyas9"
// missed "Christian Dyas" <chris@…>), and Juno asked "reply yes" before setting two reminders.
// This tool looks in order, stopping at the first that finds it:
//
//   1. every connected calendar (lib/pen/calendars.ts), by day and person (guests, organiser,
//      title), widening a day either side, then the coming weeks
//   2. invitation emails in every read-enabled inbox, Gmail and Outlook (an .ics, Google's
//      "Invitation: … @ Tue Oct 20, 2026 1pm - 1:30pm (GMT-4)", or an Outlook meeting request,
//      Graph eventMessage), with the person as sender or recipient
//   3. recordings with that person on that day (a meeting that already happened)
//
// The person is everyone Juno knows by that name (lib/pen/person-resolve.ts). When the user asked
// for reminders relative to it ("15 and 30 min before"), they are set here, at once: setting a
// reminder for oneself is never asked first (confirm.ts); "undo" cancels them (undo.ts).
//
// Email content is untrusted: an invite only ever yields a time, a title and who is on it; reading
// it marks the turn (MAIL_SAFE in agent.ts) like search_email does.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'
import { zoneOf } from './timezone'
import { dayRange, eventLine, matching } from './calendar'
import { eventsBetween, listCalendars, type Calendar } from '../../calendars'
import { eventPeople, headerPeople, resolvePerson, splitAddress } from '../../person-resolve'
import { isPerson, type PersonVariants } from '../../person-match'
import { calendarWindows, personTerms } from '../../search-widen'
import { buildQuery } from '../../mail-thread'
import { searchThreads, threadInvites, type FoundInvite } from '../../gmail-read'
import { conversationInvites, searchOutlook } from '../../outlook-read'
import { mergeHits, type MailHit, type SearchAsk } from '../../mail-thread'
import { addReminder, reminderAhead, reminderPhone } from '../../reminders'
import { localDate, localWhen, zoneTimeLabel } from '../../timezone'
import { foldName } from '../../speakers'
import { supabaseAdmin } from '@/lib/supabase'
import { turnAddSetUndo } from '../state'
import type { Lang } from '../../currency'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_meeting',
    description:
      'Find one meeting the user refers to ("the meeting with Chris tomorrow", "my call with Acme on Friday") wherever it is: ALL connected calendars, then calendar ' +
      'invitation emails in the inboxes Juno can read (Gmail, Outlook), then recordings. Knows every name and address for the person ("Chris" = Christian Dyas, chris@…, chrisdyas9@…) and widens ' +
      'the dates on its own. Returns the meeting and WHERE it was found. If they asked for reminders relative to it ("15 and 30 min before"), pass remind_before_min: ' +
      'they are set at once in the same step (never ask first).',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Who the meeting is with, as the user said it, or "".' },
        words: { type: 'string', description: 'Words from its title or topic ("pilot kickoff"), or "".' },
        date: { type: 'string', description: 'The local day YYYY-MM-DD if they said one ("tomorrow" → that date), else "" (the next one coming up).' },
        remind_before_min: { type: 'array', items: { type: 'number' }, description: 'Minutes before the start for each reminder they asked for, e.g. [30, 15]. [] for none.' },
        reminder_text: { type: 'string', description: 'What the reminder should say, in their language, or "" (then "<title> at <time>").' },
      },
      additionalProperties: false,
    },
  },
]

type Found = {
  title: string
  start: string
  end: string | null
  with: string[]
  source: 'calendar' | 'invite_email' | 'recording'
  /** "your calendar agustin@x.com", "an invitation email in agustin@tryjunoapp.com from Christian Dyas" */
  where: string
  zone: string | null
  event_id?: string
}

const H = 3_600_000
const D = 86_400_000

/** Calendars: the day(s) asked (or the next two weeks), then a day either side, then the coming weeks. */
async function fromCalendars(ctx: Ctx, cals: Calendar[], person: string, words: string, range: { from: Date; to: Date }, dated: boolean, mine: string[], tried: string[]): Promise<{ found: Found; v: PersonVariants | null } | null> {
  if (!cals.some((c) => !c.broken)) {
    tried.push('calendars: none connected')
    return null
  }
  const now = new Date()
  for (const w of calendarWindows(range.from, range.to, now)) {
    if (!dated && w.step === 'around') continue
    const { events } = await eventsBetween(ctx.email, w.from, w.to)
    const v = person ? await resolvePerson(ctx.email, person, { mine, extra: eventPeople(events) }) : null
    let hits = matching(events, words, v).filter((e) => !e.declined && !e.allDay)
    if (!hits.length && words && v) hits = matching(events, '', v).filter((e) => !e.declined && !e.allDay)
    // With no day given, the next one coming up (one that started under an hour ago still counts).
    if (!dated) hits = hits.filter((e) => Date.parse(e.start) > now.getTime() - H)
    tried.push(`calendars (${cals.map((c) => c.address ?? c.key).join(', ')}), ${w.step}: ${localDate(ctx.zone?.tz, w.from)}–${localDate(ctx.zone?.tz, new Date(w.to.getTime() - 1))}`)
    if (hits.length) {
      const target = dated ? range.from.getTime() : now.getTime()
      const e = [...hits].sort((a, b) => Math.abs(Date.parse(a.start) - target) - Math.abs(Date.parse(b.start) - target))[0]
      const line = eventLine(ctx)(e)
      const cal = (e.cals ?? [e.cal]).filter(Boolean).join(' and ')
      return {
        v,
        found: { title: e.title, start: new Date(e.start).toISOString(), end: e.end ? new Date(e.end).toISOString() : null, with: e.others.map((o) => o.name ?? o.email), source: 'calendar', where: `your calendar${cal ? ` ${cal}` : ''}`, zone: null, event_id: line.event_id },
      }
    }
  }
  return null
}

/** Invitation emails with the person, in every read-enabled inbox (Gmail + Outlook); the meeting inside the best one. */
async function fromInvites(ctx: Ctx, person: string, words: string, range: { from: Date; to: Date }, dated: boolean, v0: PersonVariants | null, mine: string[], tried: string[]): Promise<Found | null> {
  const gAccounts = ctx.gmailRead ?? []
  const oAccounts = ctx.outlookRead ?? []
  const accounts = [...gAccounts, ...oAccounts]
  if (!accounts.length) {
    tried.push('invitation emails: no inbox Juno can read')
    return null
  }
  const v = v0 ?? (person ? await resolvePerson(ctx.email, person, { mine }) : null)
  const terms = person ? personTerms(v, person) : []
  const asks: SearchAsk[] = [
    { personAny: terms.length ? terms : undefined, words: terms.length ? undefined : words, invites: true, newerThanDays: 45 },
    ...(terms.length && words ? [{ words, invites: true, newerThanDays: 45 }] : []),
  ]
  ctx.mailTainted = true
  const now = Date.now()
  const lo = dated ? range.from.getTime() - D : now - H
  const hi = dated ? range.to.getTime() + D : now + 45 * D
  for (const ask of asks) {
    let hits: ReturnType<typeof mergeHits>
    try {
      const [g, o] = await Promise.all([
        gAccounts.length ? searchThreads(ctx.email, gAccounts, buildQuery(ask), 6) : ([] as MailHit[]),
        oAccounts.length ? searchOutlook(ctx.email, oAccounts, ask, 6) : ([] as MailHit[]),
      ])
      hits = mergeHits([{ provider: 'gmail', hits: g }, { provider: 'outlook', hits: o }], 6)
    } catch (e) {
      tried.push(`invitation emails: could not search (${(e as Error).message.slice(0, 80)})`)
      return null
    }
    tried.push(`invitation emails in ${accounts.join(', ')}: ${hits.length} found`)
    if (!hits.length) continue
    // Senders/recipients seen are more ways to say the person ("Christian Dyas" <chris@…>).
    const vv = person ? await resolvePerson(ctx.email, person, { mine, extra: headerPeople(hits.flatMap((h) => [h.from, h.to])) }) : null
    const invites: FoundInvite[] = []
    for (const h of hits.slice(0, 5)) {
      ctx.mailSeen ??= []
      if (!ctx.mailSeen.some((x) => x.thread_id === h.thread_id)) ctx.mailSeen.push({ thread_id: h.thread_id, account: h.account, from: h.from.replace(/<[^>]*>/g, '').trim().slice(0, 60) })
      const o = { fallbackTz: ctx.zone?.tz ?? null }
      invites.push(...(await (h.provider === 'outlook' ? conversationInvites(ctx.email, h.account, h.thread_id, o) : threadInvites(ctx.email, h.account, h.thread_id, o)).catch(() => [])))
    }
    const cancelled = new Set(invites.filter((i) => i.cancelled && i.uid).map((i) => i.uid))
    const ok = invites.filter((i) => {
      if (i.cancelled || (i.uid && cancelled.has(i.uid)) || i.allDay) return false
      const t = Date.parse(i.start)
      if (t < lo || t > hi) return false
      if (!vv) return true
      const people = [splitAddress(i.sender), ...i.to.split(',').map(splitAddress), ...(i.organizer ? [i.organizer] : []), ...i.attendees]
      return people.some((p) => isPerson(vv, p)) || isPerson(vv, { text: i.title })
    })
    if (!ok.length) continue
    const target = dated ? range.from.getTime() : now
    const best = ok.sort((a, b) => Math.abs(Date.parse(a.start) - target) - Math.abs(Date.parse(b.start) - target) || b.received - a.received)[0]
    const sender = splitAddress(best.sender)
    const others = [...(best.organizer ? [best.organizer] : []), ...best.attendees].filter((p) => !mine.includes(p.email)).map((p) => p.name ?? p.email)
    return {
      title: best.title,
      start: best.start,
      end: best.end,
      with: [...new Set(others.length ? others : [sender.name ?? sender.email ?? ''])].filter(Boolean),
      source: 'invite_email',
      where: `an invitation email in ${best.account}${sender.name || sender.email ? ` from ${sender.name ?? sender.email}` : ''}`,
      zone: best.zone,
    }
  }
  return null
}

/** A recording with that person on the day asked (a meeting that already happened). */
async function fromRecordings(ctx: Ctx, person: string, words: string, range: { from: Date; to: Date }, v: PersonVariants | null, tried: string[]): Promise<Found | null> {
  const { data } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,client_name,notes,recorded_at,created_at,duration_sec')
    .eq('user_email', ctx.email)
    .neq('source_channel', 'sample')
    .or('merge_index.is.null,merge_index.eq.0')
    .gte('created_at', new Date(range.from.getTime() - D).toISOString())
    .lt('created_at', new Date(range.to.getTime() + D).toISOString())
    .limit(50)
  type S = { id: string; title: string | null; client_name: string | null; notes: { people?: { name: string }[] } | null; recorded_at: string | null; created_at: string; duration_sec: number | null }
  const w = foldName(words)
  const hit = ((data ?? []) as S[]).find((s) => {
    const at = Date.parse(s.recorded_at ?? s.created_at)
    if (at < range.from.getTime() || at >= range.to.getTime()) return false
    const names = [s.title, s.client_name, ...(s.notes?.people ?? []).map((p) => p.name)].filter(Boolean) as string[]
    const personOk = !person || names.some((n) => (v ? isPerson(v, { name: n, text: n }) : foldName(n).includes(foldName(person))))
    const wordsOk = !w || foldName(s.title ?? '').includes(w)
    return personOk && wordsOk
  })
  tried.push(`recordings on ${localDate(ctx.zone?.tz, range.from)}: ${hit ? 1 : 0}`)
  if (!hit) return null
  const start = new Date(hit.recorded_at ?? hit.created_at)
  return { title: hit.title ?? 'Recording', start: start.toISOString(), end: hit.duration_sec ? new Date(start.getTime() + hit.duration_sec * 1000).toISOString() : null, with: (hit.notes?.people ?? []).map((p) => p.name).slice(0, 4), source: 'recording', where: 'a recording', zone: null }
}

const REMIND: Record<Lang, (title: string, at: string, min: number) => string> = {
  en: (t, at, m) => `“${t}” starts at ${at} (in ${m} min)`,
  es: (t, at, m) => `“${t}” empieza a las ${at} (en ${m} min)`,
  pt: (t, at, m) => `“${t}” começa às ${at} (em ${m} min)`,
}

const clockOnly = (iso: string, tz: string, lang: Lang) => new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-CL' : 'pt-BR', { timeZone: tz, hour: 'numeric', minute: '2-digit' })

async function findMeeting(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const person = str(input, 'person')
  const words = str(input, 'words')
  const date = str(input, 'date')
  if (!person && !words && !date) return { error: 'say who the meeting is with, or what it is about, or which day' }
  const tz = (await zoneOf(ctx)).tz
  const zoneName = tz || 'UTC'
  const now = new Date()
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const range = (dated && dayRange(ctx, date, date)) || { from: now, to: new Date(now.getTime() + 14 * D) }
  const cals = await listCalendars(ctx.email).catch((): Calendar[] => [])
  const mine = [ctx.email, ...(ctx.gmail ?? []).map((a) => a.address), ...cals.map((c) => c.address ?? '')].filter(Boolean).map((x) => x.toLowerCase())
  const tried: string[] = []

  const c = await fromCalendars(ctx, cals, person, words, range, dated, mine, tried)
  let found: Found | null = c?.found ?? null
  if (!found) found = await fromInvites(ctx, person, words, range, dated, c?.v ?? null, mine, tried)
  if (!found && dated && range.from.getTime() < now.getTime()) found = await fromRecordings(ctx, person, words, range, c?.v ?? null, tried)

  if (!found) {
    return {
      found: false,
      searched: tried,
      note:
        'Nothing anywhere, after widening. Say in a few words where you looked (calendars, invitation emails), then ask ONE short question with a single "?" ' +
        '(e.g. which day it is, or what it is called). Do not set any reminder.',
    }
  }

  const meeting = {
    title: found.title,
    when: localWhen(found.start, zoneName, ctx.lang),
    zone_label: zoneTimeLabel(zoneName, ctx.lang),
    ...(found.end ? { ends: clockOnly(found.end, zoneName, ctx.lang) } : {}),
    with: found.with.slice(0, 6),
    found_in: found.where,
    ...(found.zone && found.zone !== tz ? { written_in_zone: found.zone } : {}),
    ...(found.event_id ? { event_id: found.event_id } : {}),
  }

  const mins = [...new Set((Array.isArray(input.remind_before_min) ? input.remind_before_min : []).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 7 * 24 * 60))].sort((a, b) => b - a)
  if (!mins.length) return { found: true, meeting, searched: tried, note: 'Say where you found it (found_in) and when (when, zone_label), in one or two lines.' }

  const start = Date.parse(found.start)
  if (start < now.getTime()) return { found: true, meeting, reminders_set: [], error: 'that meeting has already started or passed; no reminder set', note: 'Say so in one line.' }
  const startClock = clockOnly(found.start, zoneName, ctx.lang)
  const set: { minutes_before: number; local_time: string }[] = []
  const skipped: { minutes_before: number; why: string }[] = []
  for (const m of mins) {
    const due = new Date(start - m * 60_000)
    if (due.getTime() < now.getTime() + 30_000) { skipped.push({ minutes_before: m, why: 'that time has already passed' }); continue }
    if (due.getTime() - now.getTime() > reminderAhead(ctx)) { skipped.push({ minutes_before: m, why: 'too far ahead for a WhatsApp reminder' }); continue }
    // The model sometimes sends "" as the text itself: quotes alone count as no text.
    const said = str(input, 'reminder_text').replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    const text = (said || REMIND[ctx.lang](found.title, startClock, m)).slice(0, 500)
    const r = await addReminder({ email: ctx.email, phone: reminderPhone(ctx, due), text, dueAt: due, lang: ctx.lang })
    await turnAddSetUndo(ctx, { reminder: r.id, title: found.title }).catch(() => {})
    set.push({ minutes_before: m, local_time: clockOnly(r.due_at, zoneName, ctx.lang) })
  }
  return {
    found: true,
    meeting,
    reminders_set: set,
    ...(skipped.length ? { reminders_not_set: skipped } : {}),
    zone_label: zoneTimeLabel(zoneName, ctx.lang),
    undo: 'the user can say "undo" to cancel these reminders',
    note:
      'ONE reply, no question: where you found it (found_in, with the address it names) and when (when, zone_label); then the reminders set, by local time (e.g. "1:30 and 1:45 pm"). ' +
      'They are already set: never ask to confirm. End with a short line that "undo" cancels them.',
  }
}

export const meetingsModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => (name === 'find_meeting' ? findMeeting(ctx, input) : undefined),
  prompt:
    '- A meeting the user refers to ("the meeting with Chris", "my call tomorrow with Acme") → find_meeting first: it checks every calendar, invitation emails and ' +
    'recordings, knows every name for the person, and widens dates on its own. Don\'t ask "which Chris?" or "which day?" before it has looked. If it finds nothing, ask once. ' +
    '"Remind me 15 and 30 min before the meeting with Chris" → find_meeting with remind_before_min [30, 15]: one step finds it and sets both. Say where it was found.',
}
