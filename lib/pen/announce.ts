// Sending a "what's new" email (lib/pen/announcements) to the people who use Juno Pen.
//
// Who: anyone with an active account (paid or trial), or who has made a real recording (the
// sample every new account gets does not count). Minus anyone who unsubscribed from updates.
// Each gets it in their App language, from the product address with Reply-To the support inbox.
//
// Never twice: pen_announcement_sends holds one row per (announcement, email), written before
// the send is attempted, so a re-run or a crash halfway picks up where it stopped. Unsubscribing
// only stops these emails; briefings, billing and account emails are not affected.

import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'
import { LEGAL_FACTS } from '@/app/pen/legal/config'
import type { Lang } from './currency'
import { userLang } from './user-lang'
import type { Announcement } from './announcements'

const FOOT: Record<Lang, { why: string; unsub: string; open: string }> = {
  en: { why: 'You’re getting this because you use Juno Pen.', unsub: 'Unsubscribe from product updates', open: 'Open Juno Pen' },
  es: { why: 'Te llega porque usas Juno Pen.', unsub: 'Dejar de recibir novedades', open: 'Abrir Juno Pen' },
  pt: { why: 'Você recebe este e-mail porque usa o Juno Pen.', unsub: 'Parar de receber novidades', open: 'Abrir o Juno Pen' },
}

function base(): string {
  return (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Everyone who should get announcements, unsubscribed people removed. */
export async function audience(): Promise<string[]> {
  const [acc, rec, prefs] = await Promise.all([
    supabaseAdmin.from('pen_accounts').select('email').eq('status', 'active'),
    supabaseAdmin.from('pen_sessions').select('user_email').neq('source_channel', 'sample'),
    supabaseAdmin.from('pen_email_prefs').select('email').eq('product_updates', false),
  ])
  for (const r of [acc, rec, prefs]) if (r.error) throw new Error(r.error.message)
  const out = new Set<string>()
  for (const r of acc.data ?? []) out.add(String(r.email).toLowerCase())
  for (const r of rec.data ?? []) out.add(String(r.user_email).toLowerCase())
  for (const r of prefs.data ?? []) out.delete(String(r.email).toLowerCase())
  return [...out].sort()
}

/** The person's unsubscribe token, created the first time it's needed. */
export async function unsubToken(email: string): Promise<string> {
  const e = email.toLowerCase()
  const { data } = await supabaseAdmin.from('pen_email_prefs').select('unsub_token').eq('email', e).maybeSingle()
  if (data?.unsub_token) return data.unsub_token as string
  const { data: ins, error } = await supabaseAdmin
    .from('pen_email_prefs')
    .upsert({ email: e }, { onConflict: 'email', ignoreDuplicates: false })
    .select('unsub_token')
    .single()
  if (error) throw new Error(error.message)
  return ins.unsub_token as string
}

export function renderAnnouncement(a: Announcement, lang: Lang, unsubUrl: string): { subject: string; html: string; text: string } {
  const F = FOOT[lang]
  const ctaLabel = a.cta?.label[lang] ?? F.open
  const ctaUrl = `${base()}${a.cta?.path ?? ''}`
  const items = a.items
    .map(
      (it) =>
        `<tr><td style="padding:0 0 18px">` +
        `<div style="font-size:16px;font-weight:600;color:#16150F">${esc(it.title[lang])}</div>` +
        `<div style="font-size:15px;line-height:1.55;color:#514E45;margin-top:4px">${esc(it.body[lang])}</div>` +
        `</td></tr>`,
    )
    .join('')
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;background:#F2EFE5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16150F">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #DCD5C4;border-radius:16px">` +
    `<tr><td style="padding:28px 28px 8px">` +
    `<div style="font-family:Georgia,serif;font-size:26px;line-height:1.2;color:#16150F">${esc(a.subject[lang])}</div>` +
    `<p style="font-size:15px;line-height:1.6;color:#514E45;margin:14px 0 22px">${esc(a.intro[lang])}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>` +
    `<p style="margin:6px 0 26px"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#0B6B44;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px">${esc(ctaLabel)}</a></p>` +
    `</td></tr></table>` +
    `<p style="max-width:560px;font-size:12px;line-height:1.6;color:#8E8A80;margin:16px auto 0">${esc(F.why)} <a href="${esc(unsubUrl)}" style="color:#8E8A80">${esc(F.unsub)}</a><br>Juno Pen · ${esc(LEGAL_FACTS.ADDRESS)}</p>` +
    `</td></tr></table></body></html>`
  const text = [
    a.subject[lang],
    a.intro[lang],
    ...a.items.map((it) => `• ${it.title[lang]}\n  ${it.body[lang]}`),
    `${ctaLabel}: ${ctaUrl}`,
    `—\n${F.why}\n${F.unsub}: ${unsubUrl}\nJuno Pen · ${LEGAL_FACTS.ADDRESS}`,
  ].join('\n\n')
  return { subject: a.subject[lang], html, text }
}

async function sendOne(a: Announcement, email: string): Promise<{ ok: boolean; error?: string }> {
  const lang = await userLang(email)
  const token = await unsubToken(email)
  const unsubUrl = `${base()}/api/pen/unsubscribe?t=${token}`
  const m = renderAnnouncement(a, lang, unsubUrl)
  return sendEmailResult({
    to: email,
    subject: m.subject,
    html: m.html,
    text: m.text,
    // One-click unsubscribe (RFC 8058), which Gmail and Yahoo expect on bulk mail.
    headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  })
}

/** A single copy to one address, not logged. Always run this before sendToAll. */
export async function sendTest(a: Announcement, email: string) {
  return sendOne(a, email)
}

/** Everyone in the audience who hasn't had this one. Returns what happened, per address. */
export async function sendToAll(a: Announcement, opts: { dryRun?: boolean } = {}) {
  const people = await audience()
  const { data: done, error } = await supabaseAdmin.from('pen_announcement_sends').select('email').eq('announcement', a.slug)
  if (error) throw new Error(error.message)
  const already = new Set((done ?? []).map((r) => String(r.email)))
  const todo = people.filter((e) => !already.has(e))
  if (opts.dryRun) return { audience: people.length, alreadySent: already.size, wouldSend: todo }
  const results: { email: string; ok: boolean; error?: string }[] = []
  for (const email of todo) {
    // Claimed before sending: a second run racing this one skips the address.
    const claim = await supabaseAdmin.from('pen_announcement_sends').insert({ announcement: a.slug, email, ok: false })
    if (claim.error) continue
    const r = await sendOne(a, email)
    await supabaseAdmin.from('pen_announcement_sends').update({ ok: r.ok, error: r.ok ? null : (r.error ?? 'failed').slice(0, 500), sent_at: new Date().toISOString() }).eq('announcement', a.slug).eq('email', email)
    results.push({ email, ...r })
    // Resend's default limit is 2 requests a second.
    await new Promise((res) => setTimeout(res, 600))
  }
  return { audience: people.length, alreadySent: already.size, sent: results }
}
