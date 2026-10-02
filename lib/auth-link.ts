// "Email me a sign-in link": sign in with any address (Outlook, Yahoo, iCloud, work email),
// not only Google.
//
// The link carries a random 32-byte token; only its SHA-256 is stored (pen_login_links), so a
// database leak can't be replayed. A link works once and for 15 minutes. Opening it lands on a
// page with a button, and only the button spends it: Outlook's Safe Links and other scanners
// open every link in an email, and a link that signed in on GET would be burned before the
// person ever clicked it.
//
// Who may get in is decided exactly as for Google (lib/auth.ts signIn callback): the allowlist
// or an account that may enter (active, or cancelled and still read-only). A link is only emailed to addresses that would pass, but the request
// always answers the same way, so the form can't be used to find out who has an account, and
// strangers' inboxes can't be flooded through it. Five links per address per hour at most.

import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'

const TTL_MS = 15 * 60 * 1000
const PER_HOUR = 5

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

type Lang = 'en' | 'es' | 'pt'
const MAIL: Record<Lang, { subject: string; lead: string; button: string; note: string }> = {
  en: { subject: 'Your Juno sign-in link', lead: 'Tap the button to sign in. The link works once, for 15 minutes.', button: 'Sign in', note: 'If you didn’t ask for this, you can ignore it; nobody can sign in without this email.' },
  es: { subject: 'Tu enlace para entrar a Juno', lead: 'Toca el botón para entrar. El enlace sirve una vez, durante 15 minutos.', button: 'Entrar', note: 'Si no lo pediste, ignóralo: nadie puede entrar sin este correo.' },
  pt: { subject: 'Seu link para entrar no Juno', lead: 'Toque no botão para entrar. O link funciona uma vez, por 15 minutos.', button: 'Entrar', note: 'Se você não pediu, ignore: ninguém entra sem este e-mail.' },
}

export async function mayEnter(email: string): Promise<boolean> {
  const { ALLOWED_EMAILS } = await import('@/lib/auth')
  if (ALLOWED_EMAILS.includes(email)) return true
  try {
    const { mayEnterAccount } = await import('@/lib/pen/access')
    return await mayEnterAccount(email)
  } catch {
    return false
  }
}

/** Emails a link if the address may sign in. Returns nothing either way, on purpose. */
export async function requestLink(opts: { email: string; callbackUrl: string; origin: string; lang: Lang }): Promise<void> {
  const email = opts.email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return
  if (!(await mayEnter(email))) return

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin.from('pen_login_links').select('token_hash', { count: 'exact', head: true }).eq('email', email).gt('created_at', since)
  if ((count ?? 0) >= PER_HOUR) return

  const token = crypto.randomBytes(32).toString('base64url')
  const { error } = await supabaseAdmin.from('pen_login_links').insert({
    token_hash: hash(token),
    email,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  })
  if (error) throw new Error(error.message)

  const url = `${opts.origin}/auth/email?t=${token}&callbackUrl=${encodeURIComponent(opts.callbackUrl)}`
  const M = MAIL[opts.lang]
  await sendEmailResult({
    to: email,
    subject: M.subject,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="margin:0;background:#F2EFE5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16150F">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#FFFFFF;border:1px solid #DCD5C4;border-radius:16px"><tr><td style="padding:28px">` +
      `<div style="width:40px;height:40px;border-radius:10px;background:#16150F;color:#F2EFE5;font-family:Georgia,serif;font-size:26px;line-height:40px;text-align:center">j</div>` +
      `<p style="font-size:15px;line-height:1.6;margin:18px 0 22px">${M.lead}</p>` +
      `<a href="${url}" style="display:inline-block;background:#0B6B44;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${M.button}</a>` +
      `<p style="font-size:13px;line-height:1.6;color:#8E8A80;margin:22px 0 0">${M.note}</p>` +
      `</td></tr></table></td></tr></table></body></html>`,
    text: `${M.lead}\n\n${url}\n\n${M.note}`,
  })
}

/** Spends a link: the email it was for, or null if unknown, used or expired. */
export async function consumeLink(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  // One statement, so two clicks racing can't both succeed.
  const { data, error } = await supabaseAdmin
    .from('pen_login_links')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hash(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('email')
  if (error || !data?.length) return null
  return data[0].email as string
}
