// "Remind me in 15 minutes to check my recordings", over WhatsApp.
//
// Meta lets a business send free-form messages for 24 hours after the user's last message
// (the customer service window). A reminder set by a message is therefore always deliverable
// if it is due within 24 hours of it, and needs no template or business verification. Later
// than that would need a Meta-approved utility template, so it is refused for now.
//
// Firing: Supabase pg_cron runs every minute and calls /api/pen/reminders only when a row is
// due (the check is in SQL, so an idle minute costs no function call). See schema.sql.

import { supabaseAdmin } from '@/lib/supabase'
import type { Lang } from './currency'
import { sendText } from './whatsapp/provider'

/** Inside Meta's 24-hour window, with a margin for the minute-granular cron. */
export const MAX_AHEAD_MS = 23.5 * 60 * 60 * 1000

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

const PREFIX: Record<Lang, string> = { en: '⏰ Reminder', es: '⏰ Recordatorio', pt: '⏰ Lembrete' }

/** Sends every due reminder once. The claim (sent_at set where null) makes overlapping runs safe. */
export async function fireDue(): Promise<{ sent: number; failed: number }> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('pen_reminders')
    .update({ sent_at: now })
    .is('sent_at', null)
    .lte('due_at', now)
    .select('id,phone,text,lang')
  if (error) throw new Error(error.message)
  let sent = 0
  let failed = 0
  for (const r of (data ?? []) as { id: string; phone: string; text: string; lang: Lang }[]) {
    try {
      await sendText(r.phone, `${PREFIX[r.lang] ?? PREFIX.en}: ${r.text}`)
      sent++
    } catch (e) {
      failed++
      await supabaseAdmin.from('pen_reminders').update({ error: (e as Error).message.slice(0, 500) }).eq('id', r.id)
    }
  }
  return { sent, failed }
}
