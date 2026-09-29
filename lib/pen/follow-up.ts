// Sending a follow-up email on the user's behalf, from WhatsApp.
//
// No Gmail connection: it goes out from our own domain as "Name via Juno", with Reply-To set to
// the user so the answer lands in their inbox, and a BCC to them because it will never appear
// in their Sent folder otherwise. No footer: it is their email to their client.
//
// Every attempt is logged in pen_sent_emails: who it went to, when, and whether it worked. Never
// the subject or body; the user has their BCC copy and we don't need to hold it. The log is
// also the daily cap (a linked phone must not become a way to send mail at volume) and what
// the health check reads.

import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'
import { getProfile } from './profile'

export const DAILY_SEND_CAP = 20

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** "Agustin via Juno <pen@send.tryjunoapp.com>", from the address RESEND_FROM_EMAIL uses. */
export function fromLine(name: string | null | undefined): string {
  const env = process.env.RESEND_FROM_EMAIL ?? ''
  const addr = /<([^>]+)>/.exec(env)?.[1] ?? env.trim()
  const clean = (name ?? '').replace(/["<>\r\n]/g, '').trim().slice(0, 60)
  return `${clean ? `${clean} via Juno` : 'Juno Pen'} <${addr}>`
}

export function bodyHtml(body: string): string {
  const paras = body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`)
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${paras.join('')}</body></html>`
}

export async function sentToday(userEmail: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabaseAdmin
    .from('pen_sent_emails')
    .select('id', { count: 'exact', head: true })
    .eq('user_email', userEmail)
    .eq('ok', true)
    .gt('created_at', since)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function sendFollowUp(opts: {
  userEmail: string
  toEmail: string
  subject: string
  body: string
  sessionId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if ((await sentToday(opts.userEmail)) >= DAILY_SEND_CAP) {
    return { ok: false, error: `daily limit of ${DAILY_SEND_CAP} emails reached` }
  }
  const profile = await getProfile(opts.userEmail).catch(() => null)
  const r = await sendEmailResult({
    from: fromLine(profile?.name),
    to: opts.toEmail,
    subject: opts.subject,
    html: bodyHtml(opts.body),
    text: opts.body,
    replyTo: opts.userEmail,
    bcc: opts.userEmail,
  })
  await supabaseAdmin.from('pen_sent_emails').insert({
    user_email: opts.userEmail,
    to_email: opts.toEmail,
    session_id: opts.sessionId,
    channel: 'whatsapp',
    ok: r.ok,
    error: r.ok ? null : (r.error ?? 'unknown').slice(0, 500),
  })
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'the mail provider rejected it' }
}
