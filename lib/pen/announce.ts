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
import type { Announcement, AnnounceImage } from './announcements'
import { getLinkByEmail } from './whatsapp/store'
import { channelFor } from './proactive'
import { botNumber } from './whatsapp/meta'

const FOOT: Record<Lang, { why: string; unsub: string; unsubShort: string; open: string }> = {
  en: { why: 'You’re getting this because you use Juno Pen.', unsub: 'Unsubscribe from product updates', unsubShort: 'Unsubscribe', open: 'Open Juno Pen' },
  es: { why: 'Te llega porque usas Juno Pen.', unsub: 'Dejar de recibir novedades', unsubShort: 'Darte de baja', open: 'Abrir Juno Pen' },
  pt: { why: 'Você recebe este e-mail porque usa o Juno Pen.', unsub: 'Parar de receber novidades', unsubShort: 'Cancelar inscrição', open: 'Abrir o Juno Pen' },
}

function base(): string {
  return (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Everyone who should get announcements, unsubscribed people removed. */
export async function audience(): Promise<string[]> {
  const [acc, rec, prefs] = await Promise.all([
    supabaseAdmin.from('pen_accounts').select('email').eq('status', 'active'),
    supabaseAdmin.from('pen_sessions').select('user_email').or('source_channel.is.null,source_channel.neq.sample'),
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

const HI: Record<Lang, (n: string) => string> = { en: (n) => `Hi ${n},`, es: (n) => `Hola ${n},`, pt: (n) => `Oi ${n},` }
const HI_NONE: Record<Lang, string> = { en: 'Hi there,', es: 'Hola,', pt: 'Olá,' }

/** First name for the greeting: profile, then the signup form, then the account. */
export async function firstNameOf(email: string): Promise<string | null> {
  const e = email.toLowerCase()
  const [p, s, a] = await Promise.all([
    supabaseAdmin.from('pen_profiles').select('profile').ilike('user_email', e).maybeSingle(),
    supabaseAdmin.from('pen_signups').select('name').ilike('email', e).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('pen_accounts').select('name').ilike('email', e).maybeSingle(),
  ])
  const n = ((p.data?.profile as { name?: string } | null)?.name || (s.data?.name as string) || (a.data?.name as string) || '').trim()
  return n.split(/\s+/)[0] || null
}

/** Which chat the person can be sent to: the one they last wrote from, or none linked. */
export type LinkState = 'whatsapp' | 'imessage' | null

/** Linked WhatsApp (pen_whatsapp_links.linked_at), and iMessage when that's where they last wrote. */
export async function linkStateOf(email: string): Promise<LinkState> {
  const link = await getLinkByEmail(email.toLowerCase()).catch(() => null)
  if (!link?.linked_at) return null
  const ch = await channelFor(email.toLowerCase()).catch(() => null)
  return ch?.imessage ? 'imessage' : 'whatsapp'
}

/** Images: absolute from the public site, or ANNOUNCE_ASSET_BASE (e.g. localhost) for previews. */
function assetBase(): string {
  return (process.env.ANNOUNCE_ASSET_BASE || base()).replace(/\/$/, '')
}

function img(im: AnnounceImage, lang: Lang, style = ''): string {
  const src = typeof im.src === 'string' ? im.src : im.src[lang]
  const h = typeof im.height === 'number' ? im.height : im.height[lang]
  return `<img src="${esc(assetBase() + src)}" width="${im.width}" height="${h}" alt="${esc(im.alt[lang])}" style="display:block;width:${im.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;${style}">`
}

/** The one button: the person's chat when linked, else the page that links WhatsApp. */
function ctaFor(a: Announcement, lang: Lang, link: LinkState): { label: string; url: string } {
  const c = a.ctaByLink
  if (!c) return { label: a.cta?.label[lang] ?? FOOT[lang].open, url: `${base()}${a.cta?.path ?? ''}` }
  const sms = (process.env.SENDBLUE_NUMBER ?? '').replace(/\D/g, '')
  const wa = botNumber()
  if (link === 'imessage' && sms) return { label: c.imessage[lang], url: `sms:+${sms}` }
  if (link && wa) return { label: c.whatsapp[lang], url: `https://wa.me/${wa}` }
  return { label: c.unlinked[lang], url: `${base()}${c.unlinkedPath}` }
}

export function renderAnnouncement(
  a: Announcement,
  lang: Lang,
  unsubUrl: string,
  firstName?: string | null,
  link: LinkState = null,
): { subject: string; html: string; text: string } {
  const F = FOOT[lang]
  const hi = a.greet ? (firstName ? HI[lang](firstName) : HI_NONE[lang]) : null
  const inline = a.greet === 'inline'
  const intro = a.intro[lang] + (a.introUnlinked && !link ? ` ${a.introUnlinked[lang]}` : '')
  const signoff = a.signoff?.[lang] ?? null
  const cta = ctaFor(a, lang, link)
  const headline = a.headline?.[lang] ?? a.subject[lang]
  const P = 'font-size:16px;line-height:1.6;color:#16150F'
  const items = a.items
    .map(
      (it) =>
        `<tr><td style="padding:0 0 26px">` +
        `<div style="font-size:17px;line-height:1.35;font-weight:700;color:#16150F">${esc(it.title[lang])}</div>` +
        `<div style="font-size:16px;line-height:1.6;color:#3F3C34;margin-top:6px">${esc(it.body[lang])}</div>` +
        (it.image ? `<div style="margin-top:14px">${img(it.image, lang)}</div>` : '') +
        `</td></tr>`,
    )
    .join('')
  const button =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px"><tr>` +
    `<td bgcolor="#0B6B44" style="border-radius:10px;background:#0B6B44">` +
    `<a href="${esc(cta.url)}" style="display:inline-block;padding:13px 22px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px">${esc(cta.label)}</a>` +
    `</td></tr></table>`
  const foot = a.footer
    ? `${esc(a.footer[lang])} · <a href="${esc(unsubUrl)}" style="color:#6F6B61">${esc(F.unsubShort)}</a> · Juno Pen, ${esc(LEGAL_FACTS.ADDRESS)}`
    : `${esc(F.why)} <a href="${esc(unsubUrl)}" style="color:#6F6B61">${esc(F.unsub)}</a><br>Juno Pen · ${esc(LEGAL_FACTS.ADDRESS)}`
  const html =
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(a.subject[lang])}</title></head>` +
    `<body style="margin:0;padding:0;background:#F2EFE5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16150F">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EFE5"><tr><td align="center" style="padding:28px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #DCD5C4;border-radius:16px">` +
    `<tr><td style="padding:28px 32px 8px">` +
    (a.brand ? `<div style="margin:0 0 22px">${img(a.brand, lang)}</div>` : '') +
    `<h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;font-weight:400;color:#16150F">${esc(headline)}</h1>` +
    (hi && !inline ? `<p style="${P};margin:14px 0 0">${esc(hi)}</p>` : '') +
    `<p style="${P};margin:14px 0 26px">${esc(hi && inline ? `${hi} ${intro}` : intro)}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>` +
    (signoff ? signoff.split('\n').map((l) => `<p style="${P};margin:0 0 10px">${esc(l)}</p>`).join('') + '<div style="height:12px"></div>' : '') +
    button +
    `<div style="height:22px"></div></td></tr></table>` +
    `<p style="max-width:600px;font-size:12px;line-height:1.6;color:#6F6B61;margin:16px auto 0;padding:0 8px">${foot}</p>` +
    `</td></tr></table></body></html>`
  const text = [
    headline,
    hi && inline ? `${hi} ${intro}` : [...(hi ? [hi] : []), intro].join('\n\n'),
    ...a.items.map((it) => `• ${it.title[lang]}\n  ${it.body[lang]}`),
    ...(signoff ? [signoff] : []),
    `${cta.label.replace(/\s*→$/, '')}: ${cta.url}`,
    a.footer
      ? `—\n${a.footer[lang]}\n${F.unsubShort}: ${unsubUrl}\nJuno Pen, ${LEGAL_FACTS.ADDRESS}`
      : `—\n${F.why}\n${F.unsub}: ${unsubUrl}\nJuno Pen · ${LEGAL_FACTS.ADDRESS}`,
  ].join('\n\n')
  return { subject: a.subject[lang], html, text }
}

async function sendOne(a: Announcement, email: string, name?: string | null): Promise<{ ok: boolean; error?: string }> {
  const lang = await userLang(email)
  const token = await unsubToken(email)
  const unsubUrl = `${base()}/api/pen/unsubscribe?t=${token}`
  // Only the per-person button needs the link state.
  const link = a.ctaByLink || a.introUnlinked ? await linkStateOf(email) : null
  const m = renderAnnouncement(a, lang, unsubUrl, a.greet ? (name ?? (await firstNameOf(email))) : null, link)
  return sendEmailResult({
    to: email,
    ...(a.from ? { from: a.from } : {}),
    subject: m.subject,
    html: m.html,
    text: m.text,
    // One-click unsubscribe (RFC 8058), which Gmail and Yahoo expect on bulk mail.
    headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  })
}

/** A single copy to one address, not logged. Always run this before sendToAll. */
export async function sendTest(a: Announcement, email: string, name?: string | null) {
  return sendOne(a, email, name)
}

/** Everyone in the audience who hasn't had this one. Returns what happened, per address. */
export async function sendToAll(a: Announcement, opts: { dryRun?: boolean; only?: string[]; names?: Record<string, string> } = {}) {
  // `only`: a hand-picked list (still logged, still never twice), instead of the whole audience.
  const people = opts.only?.length ? opts.only.map((e) => e.toLowerCase()) : await audience()
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
    const r = await sendOne(a, email, opts.names?.[email] ?? null)
    await supabaseAdmin.from('pen_announcement_sends').update({ ok: r.ok, error: r.ok ? null : (r.error ?? 'failed').slice(0, 500), sent_at: new Date().toISOString() }).eq('announcement', a.slug).eq('email', email)
    results.push({ email, ...r })
    // Resend's default limit is 2 requests a second.
    await new Promise((res) => setTimeout(res, 600))
  }
  return { audience: people.length, alreadySent: already.size, sent: results }
}
