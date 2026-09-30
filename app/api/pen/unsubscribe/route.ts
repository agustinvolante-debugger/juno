import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Unsubscribe from "what's new" emails (lib/pen/announce.ts). Briefings, billing and account
// emails are not affected.
//
//   GET   a page with one button. Not an instant unsubscribe: mail scanners open links, and a
//         prefetch must not unsubscribe anyone.
//   POST  does it. The page's button posts here, and so does Gmail's one-click unsubscribe
//         (List-Unsubscribe-Post), which is why it needs no page of its own.

type Lang = 'en' | 'es' | 'pt'
const T: Record<Lang, { title: string; body: string; button: string; done: string; doneBody: string; bad: string }> = {
  en: { title: 'Product updates', body: 'Stop getting emails about new Juno Pen features? Your meeting briefings and account emails will keep coming.', button: 'Unsubscribe', done: 'You’re unsubscribed', doneBody: 'No more product update emails. Briefings and account emails still arrive.', bad: 'This link is not valid anymore.' },
  es: { title: 'Novedades', body: '¿Dejar de recibir correos sobre funciones nuevas de Juno Pen? Los resúmenes de tus reuniones y los correos de tu cuenta seguirán llegando.', button: 'Dejar de recibirlos', done: 'Listo', doneBody: 'No te llegarán más correos de novedades. Los resúmenes y los correos de tu cuenta siguen llegando.', bad: 'Este enlace ya no es válido.' },
  pt: { title: 'Novidades', body: 'Parar de receber e-mails sobre novos recursos do Juno Pen? Os resumos das suas reuniões e os e-mails da sua conta continuam chegando.', button: 'Parar de receber', done: 'Pronto', doneBody: 'Você não vai mais receber e-mails de novidades. Os resumos e os e-mails da conta continuam chegando.', bad: 'Este link não é mais válido.' },
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function langOf(req: Request): Lang {
  const a = (req.headers.get('accept-language') ?? '').toLowerCase()
  return a.startsWith('pt') ? 'pt' : a.startsWith('es') ? 'es' : 'en'
}

function page(lang: Lang, inner: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Juno Pen</title></head>` +
      `<body style="margin:0;background:#F2EFE5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16150F">` +
      `<main style="max-width:480px;margin:0 auto;padding:48px 16px">${inner}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}

function token(req: Request): string | null {
  const t = new URL(req.url).searchParams.get('t') ?? ''
  return /^[0-9a-f-]{36}$/i.test(t) ? t : null
}

export async function GET(req: Request) {
  const lang = langOf(req)
  const L = T[lang]
  const t = token(req)
  if (!t) return page(lang, `<p>${esc(L.bad)}</p>`, 400)
  return page(
    lang,
    `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">${esc(L.title)}</h1>` +
      `<p style="color:#514E45;line-height:1.6">${esc(L.body)}</p>` +
      `<form method="post" action="?t=${esc(t)}"><button type="submit" style="margin-top:12px;padding:12px 18px;border-radius:10px;border:0;background:#16150F;color:#F2EFE5;font-size:15px;font-weight:600;cursor:pointer">${esc(L.button)}</button></form>`,
  )
}

export async function POST(req: Request) {
  const lang = langOf(req)
  const L = T[lang]
  const t = token(req)
  if (!t) return page(lang, `<p>${esc(L.bad)}</p>`, 400)
  const { data, error } = await supabaseAdmin
    .from('pen_email_prefs')
    .update({ product_updates: false, updated_at: new Date().toISOString() })
    .eq('unsub_token', t)
    .select('email')
  if (error || !data?.length) return page(lang, `<p>${esc(L.bad)}</p>`, 400)
  return page(
    lang,
    `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">${esc(L.done)}</h1><p style="color:#514E45;line-height:1.6">${esc(L.doneBody)}</p>`,
  )
}
