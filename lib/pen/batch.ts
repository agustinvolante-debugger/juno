// One email for a batch of uploads.
//
// Uploading a day of pen files (40 on 3 Oct) sent one briefing per file: 30 summary emails and
// 5 failure emails in 18 minutes, and that customer has not been back. Now recordings that
// arrive together are briefed together: whichever finishes last sends a single email covering
// every finished one, and the others wait for it. WhatsApp recordings keep their own reply.

import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'
import type { PenSession } from './store'
import { sendBriefing, sendReadyNotice, hasSomethingToSay } from './briefing'
import { userLang } from './user-lang'
import { LOCALE } from './i18n'
import type { Lang } from './currency'

/** Recordings created within this window of each other count as one batch. */
const WINDOW_MS = 30 * 60 * 1000
/** A batch-mate still processing after this long no longer holds the email back. */
const STALE_MS = 30 * 60 * 1000
const ACTIVE = new Set(['uploaded', 'held', 'transcribing', 'transcribed', 'noting'])

type Row = PenSession & { updated_at?: string | null }

async function neighbours(email: string, around: string): Promise<Row[]> {
  const t = Date.parse(around)
  const { data, error } = await supabaseAdmin.from('pen_sessions').select('*').eq('user_email', email)
    .gte('created_at', new Date(t - WINDOW_MS).toISOString())
    .lte('created_at', new Date(t + WINDOW_MS).toISOString())
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).filter((s) =>
    s.source_channel !== 'whatsapp' && !(s.merge_group && (s.merge_index ?? 0) > 0) && !String(s.storage_path ?? '').startsWith('sample'))
}

/**
 * Called when a recording's notes are done, or when it failed or came back empty. Sends nothing
 * while batch-mates are still on their way; otherwise claims every finished, unbriefed recording
 * of the batch (atomically, so two finishers can't both send) and sends one email for them.
 */
export async function briefBatch(email: string, session: { id: string; created_at: string }): Promise<'waiting' | 'sent' | 'none' | 'failed'> {
  const rows = await neighbours(email, session.created_at)
  const now = Date.now()
  const stillComing = rows.some((s) => s.id !== session.id && ACTIVE.has(s.status) && now - Date.parse(s.updated_at ?? s.created_at) < STALE_MS)
  if (stillComing) return 'waiting'

  const ready = rows.filter((s) => s.status === 'noted' && !s.briefing_sent_at && !s.notes?.empty)
  if (!ready.length) return 'none'
  const stamp = new Date().toISOString()
  const { data: claimed } = await supabaseAdmin.from('pen_sessions').update({ briefing_sent_at: stamp })
    .in('id', ready.map((s) => s.id)).is('briefing_sent_at', null).select('*')
  const mine = ((claimed ?? []) as PenSession[]).sort((a, b) => Date.parse(a.recorded_at ?? a.created_at) - Date.parse(b.recorded_at ?? b.created_at))
  if (!mine.length) return 'none'

  const r = mine.length === 1
    ? (hasSomethingToSay(mine[0])
      ? await sendBriefing({ session: mine[0], to: [email], replyTo: email, parts: 1 })
      : await sendReadyNotice({ to: email, title: mine[0].title || mine[0].source_name || 'your recording' }))
    : await sendBatchEmail(email, mine)
  if (!r.ok) {
    // Let the next finisher (or the health sweep) try again.
    await supabaseAdmin.from('pen_sessions').update({ briefing_sent_at: null }).in('id', mine.map((s) => s.id)).eq('briefing_sent_at', stamp)
    console.warn(`pen: batch email not sent (${mine.length}): ${r.error}`)
    return 'failed'
  }
  return 'sent'
}

const T = {
  en: { subject: (n: number) => `${n} recordings ready in Juno Pen`, lead: (n: number) => `${n} recordings are transcribed and written up.`, todo: 'To do', open: 'Open', nothing: 'Nothing to follow up.', untitled: 'Untitled recording', all: 'Open Juno Pen' },
  es: { subject: (n: number) => `${n} grabaciones listas en Juno Pen`, lead: (n: number) => `${n} grabaciones están transcritas y con sus notas.`, todo: 'Pendientes', open: 'Abrir', nothing: 'Nada pendiente.', untitled: 'Grabación sin título', all: 'Abrir Juno Pen' },
  pt: { subject: (n: number) => `${n} gravações prontas no Juno Pen`, lead: (n: number) => `${n} gravações estão transcritas e com as notas.`, todo: 'Tarefas', open: 'Abrir', nothing: 'Nada pendente.', untitled: 'Gravação sem título', all: 'Abrir o Juno Pen' },
} satisfies Record<Lang, unknown>

async function sendBatchEmail(email: string, sessions: PenSession[]) {
  const lang = await userLang(email)
  const M = T[lang]
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)
  const items = sessions.map((s) => {
    const n = s.notes ?? {}
    const title = esc(s.title || s.source_name || M.untitled)
    const when = new Date(s.recorded_at ?? s.created_at).toLocaleString(LOCALE[lang], { dateStyle: 'medium', timeStyle: 'short' })
    const acts = (n.actions ?? []).slice(0, 3).map((a) => `<li style="margin:2px 0">${esc(clip(String(typeof a === 'string' ? a : (a as { text?: string }).text ?? ''), 140))}</li>`).join('')
    return `<tr><td style="padding:16px 0;border-top:1px solid #E3DECF">` +
      `<div style="font-family:Georgia,serif;font-size:18px;line-height:1.3;color:#16150F">${title}</div>` +
      `<div style="font-size:12px;color:#8E8A80;margin:2px 0 8px">${esc(when)}</div>` +
      (n.summary ? `<div style="font-size:14px;line-height:1.55;color:#3A372F">${esc(clip(n.summary, 320))}</div>` : '') +
      (acts ? `<div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8E8A80;margin:10px 0 2px">${M.todo}</div><ul style="margin:0;padding-left:18px;font-size:14px;color:#3A372F">${acts}</ul>` : (n.summary ? '' : `<div style="font-size:14px;color:#8E8A80">${M.nothing}</div>`)) +
      `<div style="margin-top:10px"><a href="${base}/pen?open=${encodeURIComponent(s.id)}" style="color:#0B6B44;font-size:14px;font-weight:600;text-decoration:none">${M.open} →</a></div>` +
      `</td></tr>`
  }).join('')
  return sendEmailResult({
    to: [email],
    subject: M.subject(sessions.length),
    replyTo: email,
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#F2EFE5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16150F">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #DCD5C4;border-radius:16px"><tr><td style="padding:24px 24px 8px">` +
      `<p style="font-size:16px;margin:0 0 6px">${M.lead(sessions.length)}</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>` +
      `<p style="margin:12px 0 16px"><a href="${base}/pen" style="display:inline-block;background:#0B6B44;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">${M.all}</a></p>` +
      `</td></tr></table></td></tr></table></body></html>`,
  })
}
