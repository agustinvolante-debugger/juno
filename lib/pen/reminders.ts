// "Remind me in 15 minutes to check my recordings", over WhatsApp.
//
// Meta lets a business send free-form messages for 24 hours after the user's last message
// (the customer service window). A reminder set by a message is therefore always deliverable
// if it is due within 24 hours of it, and needs no template or business verification. Later
// than that needs the Meta-approved utility template `user_reminder` ("Here is the reminder you
// asked me for: {{1}}…"): once it is in PEN_WA_TEMPLATES, reminders go up to 30 days ahead and
// one due outside the window is sent as that template. iMessage has no window at all.
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

export type Reminder = { id: string; text: string; due_at: string }

export async function addReminder(opts: { email: string; phone: string; text: string; dueAt: Date; lang: Lang }): Promise<Reminder> {
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
  for (const r of (data ?? []) as { id: string; user_email: string; phone: string; text: string; lang: Lang }[]) {
    try {
      // Outside WhatsApp's 24-hour window only the template gets through. User-asked reminders
      // don't count toward the proactive daily max or quiet hours: the user picked the time.
      const ch = isImessage(r.phone) ? null : await channelFor(r.user_email).catch(() => null)
      if (ch && !ch.imessage && !ch.window) {
        if (!templateApproved(REMINDER_TEMPLATE, r.lang ?? 'en')) throw new Error('outside the 24-hour window and user_reminder is not approved')
        await sendTemplate(ch.to, REMINDER_TEMPLATE, r.lang ?? 'en', [r.text], [`reminder:done:${r.id}`, `reminder:snooze:${r.id}`])
      } else {
        await sendText(r.phone, `${PREFIX[r.lang] ?? PREFIX.en}: ${r.text}`)
      }
      sent++
    } catch (e) {
      failed++
      await supabaseAdmin.from('pen_reminders').update({ error: (e as Error).message.slice(0, 500) }).eq('id', r.id)
    }
  }
  return { sent, failed }
}
