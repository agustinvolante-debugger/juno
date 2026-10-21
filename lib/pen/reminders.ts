// "Remind me in 15 minutes to check my recordings", over WhatsApp.
//
// Meta lets a business send free-form messages for 24 hours after the user's last message
// (the customer service window). A reminder set by a message is therefore always deliverable
// if it is due within 24 hours of it, and needs no template or business verification. Later
// than that needs the Meta-approved utility template `user_reminder` ("Here is the reminder you
// asked me for: {{1}}…"): once it is in PEN_WA_TEMPLATES, reminders go up to 30 days ahead and
// one due outside the window is sent as that template. iMessage has no window at all.
// A WhatsApp reminder that can't get through at the due time (window closed and no approved
// template, or Meta refuses it for the window / template) is emailed instead (21 Oct, undeliverable).
//
// Firing: Supabase pg_cron runs every minute and calls /api/pen/reminders only when a row is
// due (the check is in SQL, so an idle minute costs no function call). See schema.sql.

import { supabaseAdmin } from '@/lib/supabase'
import type { Lang } from './currency'
import { sendText, sendTemplate, dryRun } from './whatsapp/provider'
import { channelFor, templateApproved } from './proactive'
import { isImessage } from './imessage/sendblue'

/** Inside Meta's 24-hour window, with a margin for the minute-granular cron. */
export const MAX_AHEAD_MS = 23.5 * 60 * 60 * 1000
/** With the user_reminder template approved, a reminder can wait this long. */
export const MAX_AHEAD_TEMPLATE_MS = 30 * 24 * 60 * 60 * 1000
export const REMINDER_TEMPLATE = 'user_reminder'

/** How far ahead set_reminder accepts: a day, or 30 days once the template is approved (in the
 *  user's language, when given: Meta approves each language on its own). */
export function maxAheadMs(lang?: Lang): number {
  return templateApproved(REMINDER_TEMPLATE, lang) ? MAX_AHEAD_TEMPLATE_MS : MAX_AHEAD_MS
}

/**
 * Where a turn's reminders can go. WhatsApp / iMessage turns: their phone, as always. The web chat
 * (no phone of its own, lib/pen/agent-io.ts): the linked WhatsApp / iMessage when it can reach the
 * user at the due time (iMessage always; WhatsApp inside the 24-hour window from their last
 * message, or with the template approved), else by email (phone left empty: fireDue emails it).
 */
export type ReminderReach = { channel: 'whatsapp' | 'imessage' | 'web'; phone?: string; lang: Lang; reach?: { imessage: boolean; lastInbound: number | null } | null }

/** How far ahead set_reminder accepts for this turn. Phone turns: unchanged (maxAheadMs). Web: 30 days (email has no window). */
export function reminderAhead(ctx: ReminderReach): number {
  return ctx.channel === 'web' ? MAX_AHEAD_TEMPLATE_MS : maxAheadMs(ctx.lang)
}

/** The phone a reminder due at `due` is sent to, or null for an emailed one (web only). */
export function reminderPhone(ctx: ReminderReach, due: Date): string | null {
  if (ctx.channel !== 'web') return ctx.phone ?? null
  if (!ctx.phone) return null
  if (ctx.reach?.imessage || templateApproved(REMINDER_TEMPLATE, ctx.lang)) return ctx.phone
  const last = ctx.reach?.lastInbound ?? null
  return last != null && due.getTime() < last + MAX_AHEAD_MS ? ctx.phone : null
}

export type Reminder = { id: string; text: string; due_at: string }

export async function addReminder(opts: { email: string; phone: string | null; text: string; dueAt: Date; lang: Lang }): Promise<Reminder> {
  const { data, error } = await supabaseAdmin
    .from('pen_reminders')
    .insert({ user_email: opts.email, phone: opts.phone, text: opts.text.slice(0, 500), lang: opts.lang, due_at: opts.dueAt.toISOString() })
    .select('id,text,due_at')
    .single()
  if (error) throw new Error(error.message)
  return data as Reminder
}

export async function pendingReminders(email: string): Promise<Reminder[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_reminders')
    .select('id,text,due_at')
    .eq('user_email', email)
    .is('sent_at', null)
    .order('due_at')
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as Reminder[]
}

/** Cancelled = deleted. Scoped to the user so an id from the model can't reach anyone else's. */
export async function cancelReminder(email: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('pen_reminders').delete().eq('user_email', email).eq('id', id).is('sent_at', null).select('id')
  if (error) throw new Error(error.message)
  return Boolean(data?.length)
}

/** A new time for a reminder that has not fired (the user turned out to be in another zone). */
export async function moveReminder(email: string, id: string, dueAt: Date): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('pen_reminders').update({ due_at: dueAt.toISOString() }).eq('user_email', email).eq('id', id).is('sent_at', null).select('id')
  if (error) throw new Error(error.message)
  return Boolean(data?.length)
}

const PREFIX: Record<Lang, string> = { en: '⏰ Reminder', es: '⏰ Recordatorio', pt: '⏰ Lembrete' }

const MAIL: Record<Lang, { intro: string; foot: string }> = {
  en: { intro: 'Here is the reminder you asked Juno Pen for:', foot: 'You set this in the Juno Pen chat. Questions? Just reply to this email.' },
  es: { intro: 'Este es el recordatorio que le pediste a Juno Pen:', foot: 'Lo pediste en el chat de Juno Pen. ¿Dudas? Responde este correo.' },
  pt: { intro: 'Aqui está o lembrete que você pediu ao Juno Pen:', foot: 'Você pediu isso no chat do Juno Pen. Dúvidas? É só responder este e-mail.' },
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A reminder by email (Resend; Reply-To is the support inbox, as on all customer mail). */
export async function emailReminder(email: string, text: string, lang: Lang): Promise<{ ok: boolean; error?: string }> {
  const { sendEmailResult } = await import('@/lib/news/email')
  const L = MAIL[lang] ?? MAIL.en
  const subject = `${PREFIX[lang] ?? PREFIX.en}: ${text.replace(/\s+/g, ' ').slice(0, 120)}`
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F1D18;max-width:520px">` +
    `<p>${esc(L.intro)}</p><p style="font-size:17px"><strong>${esc(text)}</strong></p><p style="color:#514E45">${esc(L.foot)}</p></div>`
  return sendEmailResult({ to: email, subject, html, text: `${L.intro}\n\n${text}\n\n${L.foot}` })
}

const NO_WINDOW = 'outside the 24-hour window and user_reminder is not approved'

/**
 * A WhatsApp send that can't get through at this time, as opposed to an outage: the 24-hour window
 * is closed (Meta 131047, old 470), the template is missing / not approved / paused (1320xx), or
 * the provider can't send templates at all. Those reminders are emailed instead.
 */
export function undeliverable(msg: string): boolean {
  return msg === NO_WINDOW || /templates need the Meta Cloud API|"code"\s*:\s*(131047|470|1320\d\d)\b|re-?engagement message|more than 24 hours/i.test(msg)
}

/**
 * Emails a reminder WhatsApp can't deliver, and records it on the row: phone cleared (it is an
 * emailed reminder now, as one set on the web without a phone), so nothing sends it on WhatsApp
 * again. The row was already claimed (sent_at) before any of this, so no run sends it twice.
 */
async function emailInstead(r: { id: string; user_email: string; text: string; lang: Lang }, why: string): Promise<void> {
  const m = await emailReminder(r.user_email, r.text, r.lang ?? 'en')
  if (!m.ok) throw new Error(`WhatsApp: ${why.slice(0, 200)}; email: ${m.error ?? 'not sent'}`)
  await supabaseAdmin.from('pen_reminders').update({ phone: null }).eq('id', r.id).then(() => {}, () => {})
  console.info(`pen reminders: ${r.id} emailed instead of WhatsApp (${why.slice(0, 120)})`)
}

/** Sends every due reminder once. The claim (sent_at set where null) makes overlapping runs safe. */
export async function fireDue(): Promise<{ sent: number; failed: number }> {
  // A test script with every send refused: leave them due rather than claim and lose them.
  if (dryRun()) return { sent: 0, failed: 0 }
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('pen_reminders')
    .update({ sent_at: now })
    .is('sent_at', null)
    .lte('due_at', now)
    .select('id,user_email,phone,text,lang')
  if (error) throw new Error(error.message)
  let sent = 0
  let failed = 0
  for (const r of (data ?? []) as { id: string; user_email: string; phone: string | null; text: string; lang: Lang }[]) {
    try {
      // Set in the web chat with no WhatsApp / iMessage that could reach them (reminderPhone): by email.
      if (!r.phone) {
        const m = await emailReminder(r.user_email, r.text, r.lang ?? 'en')
        if (!m.ok) throw new Error(`email: ${m.error ?? 'not sent'}`)
        sent++
        continue
      }
      // Outside WhatsApp's 24-hour window only the template gets through. User-asked reminders
      // don't count toward the proactive daily max or quiet hours: the user picked the time.
      const ch = isImessage(r.phone) ? null : await channelFor(r.user_email).catch(() => null)
      try {
        if (ch && !ch.imessage && !ch.window) {
          if (!templateApproved(REMINDER_TEMPLATE, r.lang ?? 'en')) throw new Error(NO_WINDOW)
          await sendTemplate(ch.to, REMINDER_TEMPLATE, r.lang ?? 'en', [r.text], [`reminder:done:${r.id}`, `reminder:snooze:${r.id}`])
        } else {
          await sendText(r.phone, `${PREFIX[r.lang] ?? PREFIX.en}: ${r.text}`)
        }
      } catch (e) {
        // WhatsApp can't reach them now (window closed, no approved template, or Meta refused it
        // for that): emailed instead (founder, 21 Oct). iMessage never gets here (no window).
        if (isImessage(r.phone) || !undeliverable((e as Error).message)) throw e
        await emailInstead(r, (e as Error).message)
      }
      sent++
    } catch (e) {
      failed++
      await supabaseAdmin.from('pen_reminders').update({ error: (e as Error).message.slice(0, 500) }).eq('id', r.id)
    }
  }
  return { sent, failed }
}
