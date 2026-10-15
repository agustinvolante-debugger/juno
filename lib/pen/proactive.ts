// Messages Juno sends first, on WhatsApp or iMessage (plan 15 Oct, sections C, D, I).
//
//   offers         after a recording is written up: the 1–3 best things Juno can help with
//                  (renderOffers + markOffered, lib/pen/suggestions.ts)
//   meeting_brief  the evening before an accepted meeting (18:00 local), or the morning of it:
//                  last time with that person, open promises both ways. With Google Calendar
//                  connected, also its timed events with at least one other guest (not all-day,
//                  not declined), deduped against accepted offers (lib/pen/google-calendar.ts)
//   nudges         to-dos due today, at 9:00 local, one bundled line
//   morning_brief  7:30–8:00 local: today's meetings and to-dos, only when there is something
//   notion         Notion doc offers (composed with the offers for now)
//
// Rules, every send: the user hasn't said STOP (all, or that kind); quiet hours 7:30–20:00 in
// their zone; at most 3 a local day and an hour apart; each (kind, ref) once ever; whatever is due
// in the same tick goes as ONE message. Everything is an offer or a question: Juno never acts
// on one of these without the user's yes.
//
// Channel: where the user last wrote from. iMessage (Sendblue) is always free-form. WhatsApp is
// free-form inside Meta's 24-hour window (last inbound < 24 h); outside it only an approved
// template can go (PEN_WA_TEMPLATES lists the approved names), else the item waits, logged
// 'no_template', until the window opens again or it goes stale.
//
// Every attempt is a row in pen_proactive_log (unique per user, kind, ref = the dedupe). Rows
// of one bundled message share sent_at, which is how the daily max counts messages, not items.
// The check-and-send runs under a per-user lock row (kind 'lock'), so the after-notes hook and
// the 15-minute cron can't both send, or both squeeze under the max or the hour's gap.
//
// No known zone (a +1 number that never said where it is, no web visit): nothing is sent, except
// the after-upload offers while the user is evidently awake (they wrote in the last 45 minutes).
// The agent asks for the zone when a clock time matters (tools/timezone.ts).
//
// Dry run: PEN_PROACTIVE_DRY=1 in the app (or { dry: true }) logs what would be sent and sends
// nothing. A dry row is not final: it doesn't count toward the max, nothing is marked offered,
// and a later real run sends the item. Ignored in production. In a test script the provider
// refuses every send instead, so the real path can be tested (provider.ts).

import { renderOffers, markOffered, validZone as validSuggestionZone, zonedToUtc } from './suggestions'
import { gcalConnected, upcomingEvents, type UpcomingEvent } from './google-calendar'
import { userZone, localToUtc } from './timezone'
import { supabaseAdmin } from '@/lib/supabase'
import { ALLOWED_EMAILS } from '@/lib/auth'
import type { Lang } from './currency'
import type { ProactiveKind } from './suggestions-types'
import { getProfileRaw, cleanProfile } from './profile'
import { userLang } from './user-lang'
import { isActive } from './accounts'
import { isMine, type ActionMeta } from './todo-labels'
import { getLinkByEmail } from './whatsapp/store'
import { sendText, sendTemplate, proactiveDry, dryRun } from './whatsapp/provider'
import * as imessage from './imessage/sendblue'

export const PROACTIVE_KINDS: ProactiveKind[] = ['offers', 'meeting_brief', 'nudges', 'morning_brief', 'notion']

const MIN = 60 * 1000
const HOUR = 60 * MIN

/** Quiet hours: nothing before 7:30 or from 20:00 on, local time (the user's call, 15 Oct). */
export const QUIET = { start: 7 * 60 + 30, end: 20 * 60 }
export const DAILY_MAX = 3
/** Two proactive messages never land within this of each other. */
export const MIN_GAP_MS = HOUR
/** Meta's customer service window, with a margin for the 15-minute tick. */
const WINDOW_MS = 23.5 * HOUR
/** With no known zone, the user wrote this recently: awake, so the after-upload offers can go. */
export const AWAKE_MS = 45 * MIN
/** A failed send is tried again this much later, this many times in all. */
const RETRY_MS = 30 * MIN
const MAX_TRIES = 2
/** A lock row older than this belongs to a run that died; the next run takes it over. */
const LOCK_STALE_MS = 5 * MIN

/* ------------------------------------------------------------------ prefs */

export type ProactivePrefs = { off?: boolean; offKinds?: ProactiveKind[] }

export async function getPrefs(email: string): Promise<ProactivePrefs> {
  const p = await getProfileRaw(email).catch(() => null)
  return (p?.proactive ?? {}) as ProactivePrefs
}

export function kindOn(prefs: ProactivePrefs, kind: ProactiveKind): boolean {
  return !prefs.off && !(prefs.offKinds ?? []).includes(kind)
}

/**
 * STOP / START from the chat. No kind = everything. START for one kind while everything is off
 * turns that one on and leaves the rest off.
 */
export async function setPrefs(email: string, on: boolean, kind?: ProactiveKind): Promise<ProactivePrefs> {
  const current = (await getProfileRaw(email)) ?? {}
  const prefs = (current.proactive ?? {}) as ProactivePrefs
  let next: ProactivePrefs
  if (!kind) next = on ? {} : { off: true }
  else if (on && prefs.off) next = { offKinds: PROACTIVE_KINDS.filter((k) => k !== kind) }
  else {
    const set = new Set(prefs.offKinds ?? [])
    if (on) set.delete(kind)
    else set.add(kind)
    next = { ...(prefs.off ? { off: true } : {}), ...(set.size ? { offKinds: [...set] } : {}) }
  }
  const profile = cleanProfile({ ...current, proactive: next })
  const { error } = await supabaseAdmin
    .from('pen_profiles')
    .upsert({ user_email: email.toLowerCase(), profile, updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
  if (error) throw new Error(error.message)
  return (profile.proactive ?? {}) as ProactivePrefs
}

/* -------------------------------------------------------------- time zone */

/**
 * The user's zone (timezone.ts: said on WhatsApp, the browser's, then the phone's country code).
 * +1 with nothing else known gives none: null, never a guess (a guess sends at night somewhere).
 */
export async function zoneFor(email: string, phone: string | null | undefined): Promise<string | null> {
  const z = await userZone(email, phone ?? undefined).catch(() => null)
  return z?.tz || null
}

/** Local calendar date and minutes past midnight of `at` in `tz`. */
export function localParts(at: Date, tz: string): { date: string; minutes: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

/**
 * The instant that is `date` at `minutes` past midnight in `tz`. A wall time DST skips moves
 * later (timezone.ts localToUtc): Santiago's midnight on its spring-forward day is 01:00, the
 * real start of that local day.
 */
export function zonedTime(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const wall = new Date(Date.UTC(y, m - 1, d, 0, minutes)).toISOString().slice(0, 16)
  return localToUtc(wall, tz) as Date
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function quiet(now: Date, tz: string): boolean {
  const { minutes } = localParts(now, tz)
  return minutes < QUIET.start || minutes >= QUIET.end
}

function clock(at: Date, tz: string, lang: Lang): string {
  return at.toLocaleTimeString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-CL' : 'pt-BR', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: lang === 'en',
  })
}

/* ---------------------------------------------------- channel and window */

export type Channel = {
  to: string
  imessage: boolean
  /** The last WhatsApp message in (what Meta's window counts from). */
  lastInbound: number | null
  /** The last message in on any channel (is the user awake right now). */
  lastAny: number | null
  window: boolean
}

/**
 * Where to write and whether the WhatsApp window is open. The channel is the one the user last
 * wrote from (an `im:` sender = iMessage, when Sendblue is set up). The window is the last
 * WhatsApp message's time; with no message rows (older links), the chat history's user turns.
 */
export async function channelFor(email: string, now = new Date()): Promise<Channel | null> {
  const link = await getLinkByEmail(email)
  if (!link?.phone || !link.linked_at) return null
  const { data } = await supabaseAdmin.from('pen_whatsapp_messages').select('phone,created_at').eq('email', email.toLowerCase()).order('created_at', { ascending: false }).limit(20)
  const rows = (data ?? []) as { phone: string; created_at: string }[]
  const viaIm = !!rows[0] && imessage.isImessage(rows[0].phone) && imessage.configured()
  const wa = rows.find((r) => !imessage.isImessage(r.phone))
  let last = wa ? Date.parse(wa.created_at) : null
  if (!rows.length) {
    const ts = (link.chat ?? []).filter((t) => t.role === 'user' && typeof t.ts === 'number').map((t) => t.ts as number)
    last = ts.length ? Math.max(...ts) : null
  }
  const any = rows[0] ? Date.parse(rows[0].created_at) : last
  return {
    to: viaIm ? rows[0].phone : link.phone,
    imessage: viaIm,
    lastInbound: last,
    lastAny: any,
    window: viaIm || (last != null && now.getTime() - last < WINDOW_MS),
  }
}

/**
 * Templates Meta has approved (PEN_WA_TEMPLATES, comma list). Unlisted = treated as pending.
 * Meta approves each language on its own: an entry is `name` (every language) or `name:lang`
 * (en, es, pt; pt_BR also accepted). With `lang`, that language has to be approved; without
 * it, only a bare `name` counts. There is no fallback to English: Meta refuses a language the
 * template doesn't have.
 */
export function templateApproved(name: string, lang?: Lang): boolean {
  const list = (process.env.PEN_WA_TEMPLATES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.includes(name)) return true
  if (!lang) return false
  const codes = lang === 'pt' ? ['pt', 'pt_br'] : [lang]
  return list.some((e) => {
    const [n, l] = e.split(':')
    return n === name && !!l && codes.includes(l.trim().toLowerCase())
  })
}

/* ------------------------------------------------------------------- log */

type LogStatus = 'sending' | 'sent' | 'dry' | 'no_template' | 'failed' | 'empty'
type LogRow = { kind: string; ref: string | null; status: LogStatus; sent_at: string; error: string | null }

/** How many times a failed item was tried (kept in its error as "[try n] …"). */
function tries(r: Pick<LogRow, 'status' | 'error'>): number {
  if (r.status !== 'failed') return 0
  return Number(/^\[try (\d+)\]/.exec(r.error ?? '')?.[1] ?? 1)
}

/**
 * Done with this item: never sent again. 'no_template' and 'dry' wait for a real send; 'failed'
 * is tried again RETRY_MS later, MAX_TRIES times in all.
 */
function settled(r: LogRow, now: number): boolean {
  if (r.status === 'sent' || r.status === 'sending' || r.status === 'empty') return true
  if (r.status === 'failed') return tries(r) >= MAX_TRIES || now - Date.parse(r.sent_at) < RETRY_MS
  return false
}

const keyOf = (it: { kind: string; ref: string | null }) => `${it.kind}|${it.ref}`

async function logged(email: string): Promise<LogRow[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_proactive_log')
    .select('kind,ref,status,sent_at,error')
    .eq('user_email', email.toLowerCase())
    .neq('kind', 'lock')
    .gt('sent_at', new Date(Date.now() - 45 * 24 * HOUR).toISOString())
    .order('sent_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as LogRow[]
}

/** Messages (not items) out since local midnight, and the last one's time. A 'sending' row
 *  counts: that message may be on its way right now. */
function sentToday(rows: LogRow[], now: Date, tz: string): { count: number; last: number | null } {
  const since = zonedTime(localParts(now, tz).date, 0, tz).getTime()
  const times = rows.filter((r) => r.status === 'sent' || r.status === 'sending').map((r) => Date.parse(r.sent_at))
  return { count: new Set(times.filter((t) => t >= since)).size, last: times.length ? Math.max(...times) : null }
}

/**
 * One run at a time per user: a lock row (kind 'lock'), taken by insert (the unique index on
 * user, kind, ref decides) or, when the holder died, by an update conditional on its old time.
 * Returns the lock's time (to release it), or null when another run holds it.
 */
async function lock(email: string): Promise<string | null> {
  const at = new Date().toISOString()
  const row = { user_email: email.toLowerCase(), kind: 'lock', ref: 'send', status: 'lock', sent_at: at }
  const { error } = await supabaseAdmin.from('pen_proactive_log').insert(row)
  if (!error) return at
  if (error.code !== '23505') throw new Error(error.message)
  const { data } = await supabaseAdmin
    .from('pen_proactive_log')
    .update({ sent_at: at })
    .eq('user_email', row.user_email)
    .eq('kind', 'lock')
    .eq('ref', 'send')
    .lt('sent_at', new Date(Date.now() - LOCK_STALE_MS).toISOString())
    .select('id')
  return data?.length ? at : null
}

async function unlock(email: string, at: string): Promise<void> {
  await supabaseAdmin.from('pen_proactive_log').delete().eq('user_email', email.toLowerCase()).eq('kind', 'lock').eq('ref', 'send').eq('sent_at', at)
}

type Item = { kind: ProactiveKind; ref: string }
/** What a claimed item was before (null = no row), to put back if the send doesn't happen. */
type Claimed = Item & { prior: Pick<LogRow, 'status' | 'sent_at' | 'error'> | null }

/**
 * Claims items for one send: inserts 'sending' rows, or takes over a row that isn't settled
 * ('no_template', 'dry', a 'failed' due for its retry). Returns the items this run owns; an item
 * another run (or an earlier send) holds is left out.
 */
async function claim(email: string, items: Item[], at: string, now: number): Promise<Claimed[]> {
  const mine: Claimed[] = []
  for (const it of items) {
    const row = { user_email: email.toLowerCase(), kind: it.kind, ref: it.ref, status: 'sending', sent_at: at, error: null }
    const { error } = await supabaseAdmin.from('pen_proactive_log').insert(row)
    if (!error) {
      mine.push({ ...it, prior: null })
      continue
    }
    if (error.code !== '23505') throw new Error(error.message)
    const { data: cur } = await supabaseAdmin
      .from('pen_proactive_log')
      .select('kind,ref,status,sent_at,error')
      .eq('user_email', row.user_email)
      .eq('kind', it.kind)
      .eq('ref', it.ref)
      .maybeSingle()
    const prior = cur as LogRow | null
    if (!prior || settled(prior, now)) continue
    // Conditional on what was read, so two runs can't both take it over.
    const { data } = await supabaseAdmin
      .from('pen_proactive_log')
      .update({ ...row, error: prior.status === 'failed' ? prior.error : null })
      .eq('user_email', row.user_email)
      .eq('kind', it.kind)
      .eq('ref', it.ref)
      .eq('status', prior.status)
      .eq('sent_at', prior.sent_at)
      .select('id')
    if (data?.length) mine.push({ ...it, prior: { status: prior.status, sent_at: prior.sent_at, error: prior.error } })
  }
  return mine
}

/** Puts claimed items back as they were: a send that didn't happen leaves no trace. */
async function release(email: string, items: Claimed[], at: string): Promise<void> {
  for (const it of items) {
    const q = () => supabaseAdmin.from('pen_proactive_log')
    if (it.prior) await q().update(it.prior).eq('user_email', email.toLowerCase()).eq('kind', it.kind).eq('ref', it.ref).eq('status', 'sending').eq('sent_at', at)
    else await q().delete().eq('user_email', email.toLowerCase()).eq('kind', it.kind).eq('ref', it.ref).eq('status', 'sending').eq('sent_at', at)
  }
}

async function mark(email: string, items: Item[], patch: { status: LogStatus; channel?: string | null; template?: string | null; error?: string | null; sent_at?: string }): Promise<void> {
  for (const it of items) {
    await supabaseAdmin.from('pen_proactive_log').update(patch).eq('user_email', email.toLowerCase()).eq('kind', it.kind).eq('ref', it.ref)
  }
}

/**
 * Records items that can't go now ('no_template': waits for a window; 'empty': nothing to offer).
 * Only a new row, or one that was itself waiting: never over a sent, sending or failed one.
 */
async function noteSkipped(email: string, items: Item[], why: LogStatus): Promise<void> {
  for (const it of items) {
    const row = { user_email: email.toLowerCase(), kind: it.kind, ref: it.ref, status: why, sent_at: new Date().toISOString() }
    const { error } = await supabaseAdmin.from('pen_proactive_log').insert(row)
    if (!error || error.code !== '23505') continue
    await supabaseAdmin.from('pen_proactive_log').update(row).eq('user_email', row.user_email).eq('kind', it.kind).eq('ref', it.ref).in('status', ['no_template', 'dry'])
  }
}

/* ------------------------------------------------------------------ send */

export type Template = { name: string; vars: string[]; buttons?: string[] }

export type ProactiveMessage = {
  kind: ProactiveKind
  ref: string
  /** Free-form text (iMessage, or WhatsApp inside the window). */
  text: string
  /** For WhatsApp outside the window. Without one (or not approved yet) the item waits. */
  template?: Template
  /** Other items the free-form text carries (a bundle): logged with it, so none is sent twice. */
  also?: Item[]
  /** Other items the template carries, when it carries fewer than the text (the morning brief's
   *  template has the meetings, not the to-dos). Default: none. */
  templateAlso?: Item[]
  /** Offers in the free-form text: marked offered (with their numbers) only once it went out. */
  offered?: { id: string; no: number }[]
}

export type SendResult = {
  status: 'sent' | 'dry' | 'off' | 'quiet' | 'max' | 'gap' | 'dupe' | 'busy' | 'no_zone' | 'no_template' | 'not_linked' | 'inactive' | 'failed'
  channel?: string
  template?: string
  text?: string
  error?: string
}

/** No known zone and the user wrote in the last AWAKE_MS (on the open channel). */
function awake(ch: Channel, now: Date): boolean {
  return ch.window && ch.lastAny != null && now.getTime() - ch.lastAny < AWAKE_MS
}

/**
 * Sends one proactive message, checking every rule first. `now` is injectable for tests;
 * `dry` (or PEN_PROACTIVE_DRY=1) logs instead of sending. `tz`: the zone already looked up
 * (null = none known), else looked up here.
 */
export async function sendProactive(email: string, msg: ProactiveMessage, opts: { now?: Date; dry?: boolean; tz?: string | null } = {}): Promise<SendResult> {
  const now = opts.now ?? new Date()
  // In a test script the provider itself refuses every send (provider.ts dryRun), so there the
  // real path runs end to end (rows 'sent', offers marked) with nothing leaving; { dry: true }
  // still gives the dry path.
  const dry = opts.dry ?? (proactiveDry() && !dryRun())
  const prefs = await getPrefs(email)
  if (!kindOn(prefs, msg.kind)) return { status: 'off' }
  const ch = await channelFor(email, now)
  if (!ch) return { status: 'not_linked' }
  const zone = opts.tz !== undefined ? opts.tz : await zoneFor(email, ch.to)
  if (!zone && !awake(ch, now)) return { status: 'no_zone' }
  const tz = zone ?? 'UTC'
  if (zone && quiet(now, tz)) return { status: 'quiet' }

  const lang = await userLang(email)
  const useTemplate = !ch.window
  const items: Item[] = [{ kind: msg.kind, ref: msg.ref }, ...((useTemplate ? msg.templateAlso : msg.also) ?? [])]
  if (useTemplate && (!msg.template || !templateApproved(msg.template.name, lang))) {
    await noteSkipped(email, items, 'no_template')
    return { status: 'no_template', template: msg.template?.name }
  }

  const held = await lock(email)
  if (!held) return { status: 'busy' }
  try {
    const log = await logged(email)
    const today = sentToday(log, now, tz)
    if (today.count >= DAILY_MAX) return { status: 'max' }
    if (today.last && now.getTime() - today.last < MIN_GAP_MS) return { status: 'gap' }
    const done = new Set(log.filter((r) => settled(r, now.getTime())).map(keyOf))
    if (done.has(keyOf(msg))) return { status: 'dupe' }

    const at = now.toISOString()
    const owned = await claim(email, items, at, now.getTime())
    if (!owned.some((i) => i.kind === msg.kind && i.ref === msg.ref)) {
      await release(email, owned, at)
      return { status: 'dupe' }
    }
    const channel = ch.imessage ? 'imessage' : 'whatsapp'
    const template = useTemplate ? msg.template!.name : null
    try {
      if (dry) {
        console.log(
          `[pen proactive dry] ${email} via ${channel}${template ? ` template ${template}` : ''} at ${localParts(now, tz).date} ${clockOf(now, tz)} ${tz}:\n` +
            (template ? `vars ${JSON.stringify(msg.template!.vars)}` : msg.text) +
            '\n',
        )
      } else if (useTemplate) {
        await sendTemplate(ch.to, msg.template!.name, lang, msg.template!.vars, msg.template!.buttons ?? [])
      } else {
        await sendText(ch.to, msg.text)
      }
    } catch (e) {
      const error = (e as Error).message.slice(0, 480)
      for (const it of owned) {
        const n = (it.prior ? tries({ status: it.prior.status, error: it.prior.error }) : 0) + 1
        await mark(email, [it], { status: 'failed', channel, template, error: `[try ${n}] ${error}` })
      }
      return { status: 'failed', error }
    }
    // A dry row is a note, not a send: nothing below happens for it.
    await mark(email, owned, { status: dry ? 'dry' : 'sent', channel, template, error: null, sent_at: at })
    if (!dry) {
      // The offers in the text are now really in front of the user, with these numbers.
      if (!useTemplate && msg.offered?.length) await markOffered(email, msg.offered, at).catch((e) => console.warn(`pen proactive: mark offered: ${(e as Error).message}`))
      // A "yes" from here on answers this message, not a question asked before it (confirm.ts).
      const { setPending } = await import('./whatsapp/confirm')
      await setPending(email, null).catch(() => {})
      // In the chat history, so a reply ("yes", a button tap, "the second one") has its context.
      const content = msg.text && !useTemplate ? msg.text : `(${template}: ${msg.template?.vars.join(' · ') ?? ''})`
      const link = await getLinkByEmail(email)
      const { setChat } = await import('./whatsapp/store')
      if (link) await setChat(email, [...(link.chat ?? []), { role: 'assistant', content, ts: now.getTime() }]).catch(() => {})
    }
    return { status: dry ? 'dry' : 'sent', channel, ...(template ? { template } : {}), text: template ? JSON.stringify(msg.template!.vars) : msg.text }
  } finally {
    await unlock(email, held).catch(() => {})
  }
}

function clockOf(at: Date, tz: string): string {
  const m = localParts(at, tz).minutes
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------------- the copy */

const COPY = {
  en: {
    morning: (name: string) => `Good morning${name ? `, ${name}` : ''}.`,
    meetingsToday: 'Your meetings today:',
    dueToday: 'Due today:',
    wantBrief: 'Want a short brief before the first one?',
    tomorrow: (who: string, at: string) => `Tomorrow you meet ${who} at ${at}.`,
    today: (who: string, at: string) => `Today you meet ${who} at ${at}.`,
    lastTime: (date: string, title: string, summary: string) => `Last time (${date}${title ? `, "${title}"` : ''}): ${summary}`,
    youOwe: 'You owe:',
    theyOwe: 'They owe:',
    moreBrief: 'Want the full brief?',
    nudge: (list: string) => `Due today: ${list}. Want help with any of it?`,
    and: 'and',
    more: (n: number) => `and ${n} more`,
  },
  es: {
    morning: (name: string) => `Buenos días${name ? `, ${name}` : ''}.`,
    meetingsToday: 'Tus reuniones de hoy:',
    dueToday: 'Para hoy:',
    wantBrief: '¿Quieres un resumen breve antes de la primera?',
    tomorrow: (who: string, at: string) => `Mañana te reúnes con ${who} a las ${at}.`,
    today: (who: string, at: string) => `Hoy te reúnes con ${who} a las ${at}.`,
    lastTime: (date: string, title: string, summary: string) => `La última vez (${date}${title ? `, "${title}"` : ''}): ${summary}`,
    youOwe: 'Tú debes:',
    theyOwe: 'Te deben:',
    moreBrief: '¿Quieres el resumen completo?',
    nudge: (list: string) => `Para hoy: ${list}. ¿Te ayudo con algo de eso?`,
    and: 'y',
    more: (n: number) => `y ${n} más`,
  },
  pt: {
    morning: (name: string) => `Bom dia${name ? `, ${name}` : ''}.`,
    meetingsToday: 'Suas reuniões de hoje:',
    dueToday: 'Para hoje:',
    wantBrief: 'Quer um resumo rápido antes da primeira?',
    tomorrow: (who: string, at: string) => `Amanhã você se reúne com ${who} às ${at}.`,
    today: (who: string, at: string) => `Hoje você se reúne com ${who} às ${at}.`,
    lastTime: (date: string, title: string, summary: string) => `Da última vez (${date}${title ? `, "${title}"` : ''}): ${summary}`,
    youOwe: 'Você deve:',
    theyOwe: 'Te devem:',
    moreBrief: 'Quer o resumo completo?',
    nudge: (list: string) => `Para hoje: ${list}. Quer ajuda com alguma coisa?`,
    and: 'e',
    more: (n: number) => `e mais ${n}`,
  },
}

/** "a, b and c", at most `max`, then "and 2 more". Never newlines (templates refuse them). */
function joinList(items: string[], lang: Lang, max = 3): string {
  const C = COPY[lang]
  const shown = items.slice(0, max)
  const rest = items.length - shown.length
  if (rest > 0) return `${shown.join(', ')} ${C.more(rest)}`
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} ${C.and} ${shown[shown.length - 1]}` : shown[0] ?? ''
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const noDot = (s: string) => s.trim().replace(/[.。]+$/, '')

/* ----------------------------------------------------------- what's due */

/** who = what the message says; lookup = the one name the brief searches the user's people for. */
type Meeting = { id: string; who: string; starts: Date; decided: number | null; lookup?: string }
type Todo = { action: string; waiting: string | null; recording: string }
type Session = {
  id: string
  title: string | null
  source_name: string | null
  source_channel: string | null
  storage_path: string | null
  status: string
  notes: { actions?: { action: string }[] } | null
  action_meta: ActionMeta[] | null
  action_done: number[] | null
  created_at: string
  updated_at: string
}

async function acceptedMeetings(email: string, from: Date, to: Date): Promise<Meeting[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_suggestions')
    .select('id,person,title,detail,starts_at,decided_at')
    .eq('user_email', email.toLowerCase())
    .eq('kind', 'meeting')
    // 'done' too: accepting an offer marks it done once the calendar link or event is made.
    .in('state', ['accepted', 'done'])
    .gte('starts_at', from.toISOString())
    .lt('starts_at', to.toISOString())
    .order('starts_at')
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; person: string | null; title: string; detail: Record<string, unknown> | null; starts_at: string; decided_at: string | null }[]).map((r) => ({
    id: r.id,
    who: (r.person || (typeof r.detail?.with === 'string' ? (r.detail.with as string) : '') || r.title).trim(),
    // The time the user confirmed (they may have corrected it) over the one heard on the call.
    starts: typeof r.detail?.local === 'string' && validSuggestionZone(r.detail?.tz) ? confirmedStart(r.detail.local as string, r.detail.tz as string, r.starts_at) : new Date(r.starts_at),
    decided: r.decided_at ? Date.parse(r.decided_at) : null,
  }))
}

function confirmedStart(local: string, tz: string, fallback: string): Date {
  const d = zonedToUtc(local, tz)
  return Number.isNaN(d.getTime()) ? new Date(fallback) : d
}

/** "chris.park@acme.com" → "Chris Park", for guests Google gives no name for. */
function nameFromEmail(email: string): string {
  return email.split('@')[0].split(/[._+-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Google Calendar meetings in [from, to): timed, not declined, with at least one other guest
 * (a meeting with someone, which is what a brief is for). Skips Juno's own events for offers
 * already in `accepted` and anything within 15 minutes of one of them, so a meeting is briefed once.
 */
export function calendarMeetings(events: UpcomingEvent[], from: Date, to: Date, accepted: Meeting[]): Meeting[] {
  const out: Meeting[] = []
  for (const e of events) {
    if (e.allDay || e.declined || !e.others.length) continue
    const starts = new Date(e.start)
    if (Number.isNaN(starts.getTime()) || starts < from || starts >= to) continue
    if (e.junoRef && accepted.some((m) => m.id === e.junoRef)) continue
    if (accepted.some((m) => Math.abs(m.starts.getTime() - starts.getTime()) < 15 * MIN)) continue
    const names = e.others.map((o) => o.name || nameFromEmail(o.email)).filter(Boolean)
    const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(' & ')
    out.push({ id: `gcal:${e.id}`, who: who || e.title, starts, decided: null, lookup: names[0] })
  }
  return out
}

/** Accepted offers plus Google Calendar meetings (when connected), soonest first. */
async function meetingsBetween(email: string, now: Date, from: Date, to: Date): Promise<Meeting[]> {
  const accepted = await acceptedMeetings(email, from, to).catch(() => [] as Meeting[])
  if (!(await gcalConnected(email))) return accepted
  // The calendar window starts now; the read is capped at 7 days in google-calendar.ts.
  const days = Math.ceil((to.getTime() - now.getTime()) / (24 * HOUR))
  const events = await upcomingEvents(email, days, now).catch((e) => {
    console.warn(`pen proactive: google calendar for ${email}: ${(e as Error).message}`)
    return [] as UpcomingEvent[]
  })
  return [...accepted, ...calendarMeetings(events, from, to, accepted)].sort((a, b) => a.starts.getTime() - b.starts.getTime())
}

async function recentSessions(email: string, since: Date): Promise<Session[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_sessions')
    .select('id,title,source_name,source_channel,storage_path,status,notes,action_meta,action_done,created_at,updated_at')
    .eq('user_email', email)
    .or('merge_index.is.null,merge_index.eq.0')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(400)
  if (error) throw new Error(error.message)
  // The sample recording is nobody's meeting (NULL channel = an ordinary upload, kept).
  return ((data ?? []) as unknown as Session[]).filter((s) => s.source_channel !== 'sample' && !String(s.storage_path ?? '').startsWith('sample'))
}

/** The user's own open to-dos due on `date` (YYYY-MM-DD, their local day). */
function dueOn(sessions: Session[], date: string): Todo[] {
  const out: Todo[] = []
  for (const s of sessions) {
    const acts = s.notes?.actions ?? []
    const meta = Array.isArray(s.action_meta) && s.action_meta.length === acts.length ? s.action_meta : null
    if (!meta) continue
    const done = new Set(Array.isArray(s.action_done) ? s.action_done : [])
    acts.forEach((a, i) => {
      if (done.has(i) || !isMine(meta[i]) || meta[i]?.due_date !== date) return
      out.push({ action: noDot(a.action), waiting: meta[i]?.waiting ?? null, recording: s.title ?? s.source_name ?? '' })
    })
  }
  return out
}

/** The short brief for a meeting: last time with them, open promises both ways. */
async function meetingBrief(email: string, m: Meeting, lang: Lang): Promise<string> {
  const C = COPY[lang]
  try {
    const { personBriefFor } = await import('./whatsapp/agent')
    const b = await personBriefFor(email, m.lookup ?? m.who)
    const lines: string[] = []
    const last = b.last_calls?.[0]
    if (last?.summary) {
      const summary = last.summary.split(/(?<=[.!?])\s/)[0].slice(0, 220)
      lines.push(C.lastTime(last.date, last.title ?? '', summary))
    }
    const todos = (b.open_todos ?? []) as { action?: string; whose?: string }[]
    const mine = todos.filter((t) => t.whose !== 'other').map((t) => noDot(String(t.action ?? ''))).filter(Boolean)
    const theirs = todos.filter((t) => t.whose === 'other').map((t) => noDot(String(t.action ?? ''))).filter(Boolean)
    if (mine.length) lines.push(`${C.youOwe} ${joinList(mine.map(lower), lang)}.`)
    if (theirs.length) lines.push(`${C.theyOwe} ${joinList(theirs.map(lower), lang)}.`)
    return lines.join('\n')
  } catch (e) {
    console.warn(`pen proactive: brief for ${m.who} failed: ${(e as Error).message}`)
    return ''
  }
}

/** One part of a bundle, with when it stops being worth sending. */
type Part = ProactiveMessage & { order: number; staleAt: number; notedAt?: number }

/**
 * Everything due for one user at `now`. Each part carries its free-form text and its template;
 * runForUser bundles them. Kinds the user switched off are left out here already.
 */
export async function dueFor(email: string, now: Date, tz: string, lang: Lang, prefs: ProactivePrefs, window: boolean): Promise<Part[]> {
  const C = COPY[lang]
  const today = localParts(now, tz).date
  const tomorrow = addDays(today, 1)
  const mins = localParts(now, tz).minutes
  const parts: Part[] = []
  const t = now.getTime()

  const todayStart = zonedTime(today, 0, tz)
  const dayAfter = zonedTime(addDays(today, 2), 0, tz)
  const meetings = kindOn(prefs, 'morning_brief') || kindOn(prefs, 'meeting_brief') ? await meetingsBetween(email, now, todayStart, dayAfter).catch(() => []) : []
  const sessions = await recentSessions(email, new Date(t - 120 * 24 * HOUR))
  const dueToday = dueOn(sessions, today)
  const meetingsToday = meetings.filter((m) => localParts(m.starts, tz).date === today && m.starts.getTime() > t)

  // (d) Morning brief, 7:30–11:00: today's meetings and to-dos, only when there is something.
  // The template (Meta utility rules) only on days with a meeting.
  let morningCovers: Item[] = []
  if (kindOn(prefs, 'morning_brief') && mins >= QUIET.start && mins < 11 * 60 && (meetingsToday.length || dueToday.length)) {
    const name = ((await getProfileRaw(email).catch(() => null))?.name ?? '').trim().split(/\s+/)[0] ?? ''
    const list = meetingsToday.map((m) => (lang === 'en' ? `${m.who} at ${clock(m.starts, tz, lang)}` : lang === 'es' ? `${m.who} a las ${clock(m.starts, tz, lang)}` : `${m.who} às ${clock(m.starts, tz, lang)}`))
    const lines = [C.morning(name)]
    if (list.length) lines.push(`${C.meetingsToday} ${joinList(list, lang)}.`)
    if (dueToday.length) lines.push(`${C.dueToday} ${joinList(dueToday.map((d) => lower(d.action)), lang)}.`)
    // Covered here, so they don't come again at 9:00 or as a separate brief. The template has
    // the meetings only: sent that way, the to-dos still get their 9:00 nudge.
    const meetingItems = meetingsToday.map((m) => ({ kind: 'meeting_brief' as const, ref: m.id }))
    morningCovers = [...(dueToday.length ? [{ kind: 'nudges' as const, ref: today }] : []), ...meetingItems]
    parts.push({
      kind: 'morning_brief',
      ref: today,
      text: lines.join(' ') + (list.length ? `\n${C.wantBrief}` : ''),
      // {{1}} is their first name; with none, only English has a natural stand-in ("there").
      ...(list.length && (name || lang === 'en') ? { template: { name: 'morning_brief', vars: [name || 'there', joinList(list, lang)], buttons: [`proactive:brief:${today}`, `proactive:no:${today}`] } } : {}),
      also: morningCovers,
      templateAlso: meetingItems,
      order: 0,
      staleAt: zonedTime(today, 11 * 60, tz).getTime(),
    })
  }

  // (b) Meeting brief: from 18:00 the evening before; accepted later than that, from 8:00 on the day.
  if (kindOn(prefs, 'meeting_brief')) {
    for (const m of meetings) {
      if (morningCovers.some((c) => c.kind === 'meeting_brief' && c.ref === m.id)) continue
      const day = localParts(m.starts, tz).date
      const eve = zonedTime(addDays(day, -1), 18 * 60, tz).getTime()
      const from = m.decided && m.decided > eve ? Math.max(m.decided, zonedTime(day, 8 * 60, tz).getTime()) : eve
      const staleAt = m.starts.getTime() - 30 * MIN
      if (t < from || t >= staleAt) continue
      const isTomorrow = day === tomorrow
      const at = clock(m.starts, tz, lang)
      const brief = window ? await meetingBrief(email, m, lang) : ''
      parts.push({
        kind: 'meeting_brief',
        ref: m.id,
        text: [isTomorrow ? C.tomorrow(m.who, at) : C.today(m.who, at), brief, C.moreBrief].filter(Boolean).join('\n'),
        // The template says "Tomorrow": the morning-of case has none (the morning brief covers it).
        ...(isTomorrow ? { template: { name: 'meeting_tomorrow', vars: [m.who, at], buttons: [`proactive:brief:${m.id}`, `proactive:no:${m.id}`] } } : {}),
        order: 1,
        staleAt,
      })
    }
  }

  // (c) Nudges: to-dos due today, from 9:00, one line.
  // Due alongside a morning brief that carries them, runForUser drops it from the bundle.
  if (kindOn(prefs, 'nudges') && dueToday.length && mins >= 9 * 60) {
    const first = dueToday[0]
    const todo = lower(first.action) + (dueToday.length > 1 ? ` (${C.more(dueToday.length - 1)})` : '')
    parts.push({
      kind: 'nudges',
      ref: today,
      text: C.nudge(joinList(dueToday.map((d) => lower(d.action)), lang)),
      template: { name: 'follow_up_nudge', vars: [first.waiting || first.recording || 'Juno', todo], buttons: [`proactive:help:${today}`, `proactive:done:${today}`, `proactive:snooze:${today}`] },
      order: 2,
      staleAt: zonedTime(today, QUIET.end, tz).getTime(),
    })
  }

  // (a) After-upload offers: recordings written up in the last 36 h, composed by suggestions.ts.
  if (kindOn(prefs, 'offers')) {
    for (const s of sessions.filter((x) => x.status === 'noted' && t - Date.parse(x.created_at) < 36 * HOUR).slice(0, 3)) {
      const title = s.title ?? s.source_name ?? ''
      const acts = s.notes?.actions ?? []
      const meta = Array.isArray(s.action_meta) && s.action_meta.length === acts.length ? s.action_meta : null
      const done = new Set(Array.isArray(s.action_done) ? s.action_done : [])
      const mineCount = acts.filter((_, i) => !done.has(i) && isMine(meta?.[i])).length
      parts.push({
        kind: 'offers',
        ref: s.id,
        text: '', // composed only when it is actually going out free-form (a model call)
        template: { name: 'notes_ready', vars: [title, String(mineCount)], buttons: [`proactive:summary:${s.id}`, `proactive:later:${s.id}`] },
        order: 3,
        staleAt: Date.parse(s.created_at) + 36 * HOUR,
        notedAt: Date.parse(s.updated_at),
      })
    }
  }
  return parts.filter((p) => t < p.staleAt).sort((a, b) => a.order - b.order)
}

/* ------------------------------------------------------------------- tick */

export type UserRun = { email: string; tz: string | null; local: string; window: boolean; due: string[]; result: SendResult | null }

async function allowedUser(email: string): Promise<boolean> {
  return ALLOWED_EMAILS.includes(email.toLowerCase()) || (await isActive(email).catch(() => false))
}

/**
 * One user's tick: what's due, bundled into one message, through sendProactive's rules. The cron
 * and the after-notes hook (unattended.ts) both come here, so both skip inactive accounts.
 */
export async function runForUser(email: string, opts: { now?: Date; dry?: boolean } = {}): Promise<UserRun> {
  const now = opts.now ?? new Date()
  const ch = await channelFor(email, now)
  const zone = await zoneFor(email, ch?.to)
  const tz = zone ?? 'UTC'
  const lp = localParts(now, tz)
  const run: UserRun = { email, tz: zone, local: `${lp.date} ${clockOf(now, tz)}`, window: !!ch?.window, due: [], result: null }
  if (!ch) return { ...run, result: { status: 'not_linked' } }
  if (!(await allowedUser(email))) return { ...run, result: { status: 'inactive' } }
  const prefs = await getPrefs(email)
  if (prefs.off) return { ...run, result: { status: 'off' } }
  // No zone: quiet hours can't be known. Only the after-upload offers, only while they're awake.
  if (!zone && !awake(ch, now)) return { ...run, result: { status: 'no_zone' } }
  // Cheap checks first: nothing below runs a query on the user's recordings at night.
  if (zone && quiet(now, tz)) return { ...run, result: { status: 'quiet' } }
  const lang = await userLang(email)
  let parts = await dueFor(email, now, tz, lang, prefs, ch.window)
  if (!zone) parts = parts.filter((p) => p.kind === 'offers')
  // Done before (sent, or covered by an earlier bundle) is not due.
  const done = new Set((await logged(email)).filter((r) => settled(r, now.getTime())).map(keyOf))
  parts = parts.filter((p) => !done.has(keyOf(p)))
  run.due = parts.map((p) => `${p.kind}:${p.ref}`)
  if (!parts.length) return run

  if (!ch.window) {
    // Outside the window one template carries one item: the first with an approved template.
    // The rest wait (until the user writes back and the window opens, or they go stale).
    const lead = parts.find((p) => p.template && templateApproved(p.template.name, lang))
    if (!lead) {
      await noteSkipped(email, parts, 'no_template')
      return { ...run, result: { status: 'no_template' } }
    }
    run.result = await sendProactive(email, { kind: lead.kind, ref: lead.ref, text: lead.text, template: lead.template, templateAlso: lead.templateAlso }, { now, dry: opts.dry, tz: zone })
    return run
  }

  // Inside the window (or iMessage): every due part in one free-form message.
  const texts: string[] = []
  const carried: Item[] = []
  const empty: Item[] = []
  const offered: { id: string; no: number }[] = []
  // Offers from several recordings share one numbering ("yes to 3") and one footer. Rendered
  // only: they are marked offered by sendProactive once the message has really gone out.
  const offerParts = parts.filter((p) => p.kind === 'offers')
  let nextNo = 1
  for (const p of parts) {
    // Already in this bundle (the morning brief carries the day's to-dos).
    if (carried.some((c) => c.kind === p.kind && c.ref === p.ref)) continue
    let text = p.text
    if (p.kind === 'offers') {
      const last = p === offerParts[offerParts.length - 1]
      const c = await renderOffers(email, p.ref, lang, offerParts.length > 1 ? { from: nextNo, footer: last } : undefined).catch(() => null)
      nextNo += c?.ids.length ?? 0
      offered.push(...(c?.offered ?? []))
      text = c?.text ?? ''
      // Nothing to offer: done with it, but only once the suggestions have had time to land.
      if (!text) {
        if (p.notedAt && now.getTime() - p.notedAt > 30 * MIN) empty.push({ kind: p.kind, ref: p.ref })
        continue
      }
    }
    if (!text) continue
    texts.push(text)
    carried.push({ kind: p.kind, ref: p.ref }, ...(p.also ?? []))
  }
  if (empty.length) await noteSkipped(email, empty, 'empty')
  if (!texts.length) return run
  const [lead, ...rest] = carried
  run.result = await sendProactive(email, { kind: lead.kind, ref: lead.ref, text: texts.join('\n\n'), also: rest, offered }, { now, dry: opts.dry, tz: zone })
  return run
}

/**
 * The cron's entry point: every linked, active account. `only` limits it to those emails (tests
 * must always pass it; the whole table is for the cron alone).
 */
export async function runProactive(opts: { now?: Date; dry?: boolean; only?: string[] } = {}): Promise<{ users: number; sent: number; runs: UserRun[] }> {
  let q = supabaseAdmin.from('pen_whatsapp_links').select('email').not('linked_at', 'is', null).not('phone', 'is', null)
  if (opts.only) q = q.in('email', opts.only.map((e) => e.toLowerCase()))
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const runs: UserRun[] = []
  for (const { email } of (data ?? []) as { email: string }[]) {
    try {
      const r = await runForUser(email, opts)
      if (r.result?.status !== 'inactive') runs.push(r)
    } catch (e) {
      console.warn(`pen proactive: ${email} failed: ${(e as Error).message}`)
    }
  }
  return { users: runs.length, sent: runs.filter((r) => r.result?.status === 'sent' || r.result?.status === 'dry').length, runs }
}
