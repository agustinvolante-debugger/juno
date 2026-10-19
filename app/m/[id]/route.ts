import { NextResponse } from 'next/server'
import { getDraftById, type Draft } from '@/lib/pen/whatsapp/store'
import { fitLink, PROVIDER_NAME, type ComposeParts } from '@/lib/pen/mail-compose'
import { isPreviewBot } from '@/lib/pen/connect-link'

export const dynamic = 'force-dynamic'

// tryjunoapp.com/m/<kind><draft id>: the short links under a WhatsApp/iMessage draft
// (lib/pen/whatsapp/agent.ts draftLinks). WhatsApp doesn't linkify mailto: and a compose URL with
// the whole email in it is a wall of text, so the chat carries these instead.
//
//   w…  the web mail's compose (Gmail / Outlook / Yahoo, from the draft's provider): a 302 to it
//       with To, Subject and body filled in
//   a…  the phone's own mail app: a small page that opens the mailto: at once, with a button in
//       case the browser wants a tap, and the text with a Copy button
//
// No sign-in: the draft id is 16 random characters, and the link dies with the draft (24 hours,
// or as soon as it is sent or replaced; an edit makes a new draft, so new links). Too long for a
// link (mailto ~2000 characters, web ~7000): the page shows the text with Copy, and the button
// opens the compose with To and Subject only.

type Lang = 'en' | 'es' | 'pt'
const T: Record<Lang, { title: string; open: (p: string) => string; app: string; opening: string; copy: string; copied: string; to: string; subject: string; long: string; twice: string; gone: string }> = {
  en: {
    title: 'Your email draft',
    open: (p) => `Open in ${p}`,
    app: 'Open in my mail app',
    opening: 'Opening your mail app… If nothing happens, tap the button.',
    copy: 'Copy the text',
    copied: 'Copied',
    to: 'To',
    subject: 'Subject',
    long: 'This email is too long to hand over in one link. Copy the text first, then open your email and paste it in.',
    twice: 'Sent it from here? Don\'t also reply "send it" in the chat, or it goes twice.',
    gone: 'This draft has expired or was already sent. Ask Juno in the chat for a new one.',
  },
  es: {
    title: 'Tu borrador de correo',
    open: (p) => `Abrir en ${p}`,
    app: 'Abrir en mi app de correo',
    opening: 'Abriendo tu app de correo… Si no pasa nada, toca el botón.',
    copy: 'Copiar el texto',
    copied: 'Copiado',
    to: 'Para',
    subject: 'Asunto',
    long: 'Este correo es demasiado largo para pasarlo en un link. Copia el texto primero, luego abre tu correo y pégalo.',
    twice: '¿Lo mandaste desde aquí? No respondas también "envíalo" en el chat, o sale dos veces.',
    gone: 'Este borrador expiró o ya se envió. Pídele uno nuevo a Juno en el chat.',
  },
  pt: {
    title: 'Seu rascunho de e-mail',
    open: (p) => `Abrir no ${p}`,
    app: 'Abrir no meu app de e-mail',
    opening: 'Abrindo seu app de e-mail… Se nada acontecer, toque no botão.',
    copy: 'Copiar o texto',
    copied: 'Copiado',
    to: 'Para',
    subject: 'Assunto',
    long: 'Este e-mail é longo demais para ir num link. Copie o texto primeiro, depois abra seu e-mail e cole.',
    twice: 'Enviou daqui? Não responda também "enviar" no chat, ou vai duas vezes.',
    gone: 'Este rascunho expirou ou já foi enviado. Peça um novo ao Juno no chat.',
  },
}

function langOf(req: Request, d: Draft | null): Lang {
  if (d?.lang === 'es' || d?.lang === 'pt' || d?.lang === 'en') return d.lang
  const a = (req.headers.get('accept-language') ?? '').toLowerCase()
  return a.startsWith('pt') ? 'pt' : a.startsWith('es') ? 'es' : 'en'
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** A JS string literal safe inside <script>. */
const js = (t: string) => JSON.stringify(t).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' }

function page(lang: Lang, title: string, inner: string, status = 200): Response {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{--paper:#F2EFE5;--panel:#FFFFFF;--line:#DCD5C4;--ink:#16150F;--soft:#514E45;--accent:#0B6B44;--accent-ink:#08482E}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:560px;margin:0 auto;padding:28px 16px 40px}h1{font:400 26px/1.2 Georgia,serif;margin:0 0 16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:16px}
.meta{font-size:14px;color:var(--soft);margin-bottom:10px;word-break:break-word}.meta b{color:var(--ink);font-weight:600}
.body{white-space:pre-wrap;word-break:break-word;font-size:15px}
a.btn,button{display:block;width:100%;text-align:center;border-radius:12px;padding:14px;font-family:inherit;font-weight:600;font-size:16px;line-height:1.2;text-decoration:none;cursor:pointer;margin-bottom:10px;min-height:48px}
a.btn{background:var(--accent);color:#fff;border:0}button{background:var(--panel);color:var(--accent-ink);border:1px solid var(--line)}
a.btn:focus-visible,button:focus-visible{outline:3px solid var(--accent-ink);outline-offset:2px}
.note{font-size:13px;color:var(--soft);margin:0 0 12px}.lead{margin:0 0 14px;color:var(--soft)}
</style></head><body><main>${inner}</main></body></html>`
  return new Response(html, { status, headers: HEADERS })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const kind = id[0]
  const d = kind === 'w' || kind === 'a' ? await getDraftById(id.slice(1)).catch(() => null) : null
  const lang = langOf(req, d)
  const t = T[lang]
  if (!d) return page(lang, t.title, `<h1>${esc(t.title)}</h1><p>${esc(t.gone)}</p>`, 410)

  const parts: ComposeParts = { to: d.toEmail, subject: d.subject, body: d.body }
  const web = kind === 'w' && d.provider ? d.provider : null
  const link = fitLink(web ? 'web' : 'app', parts, web, d.from)

  // A chat app fetching the link for its preview gets a title, not the email or a redirect.
  if (isPreviewBot(req.headers.get('user-agent'))) {
    return new Response(`<!doctype html><title>Juno · ${esc(t.title)}</title>`, { headers: HEADERS })
  }

  // The web mail, whole: straight there.
  if (web && link.full) {
    const res = NextResponse.redirect(link.url, 302)
    for (const [k, v] of Object.entries(HEADERS)) if (k !== 'Content-Type') res.headers.set(k, v)
    return res
  }

  const label = web ? t.open(PROVIDER_NAME[web]) : t.app
  const copyText = `${d.subject}\n\n${d.body}`
  // The mail app opens at once when the whole email fits; when it doesn't, they copy first.
  const auto = !web && link.full
  return page(
    lang,
    t.title,
    `<h1>${esc(t.title)}</h1>
${auto ? `<p class="lead" role="status">${esc(t.opening)}</p>` : `<p class="lead">${esc(t.long)}</p>`}
${link.full ? '' : `<button id="c" type="button">${esc(t.copy)}</button>`}
<a class="btn" id="o" href="${esc(link.url)}"${web ? ' rel="noopener"' : ''}>${esc(label)}</a>
<div class="card"><div class="meta">${d.from ? `<b>${lang === 'en' ? 'From' : 'De'}:</b> ${esc(d.from)}<br>` : ''}<b>${esc(t.to)}:</b> ${esc(d.toName)}${d.toEmail ? ` &lt;${esc(d.toEmail)}&gt;` : ''}<br><b>${esc(t.subject)}:</b> ${esc(d.subject)}</div><div class="body">${esc(d.body)}</div></div>
${link.full ? `<button id="c" type="button">${esc(t.copy)}</button>` : ''}
<p class="note">${esc(t.twice)}</p>
<script>
(function(){var text=${js(copyText)},b=document.getElementById('c');
function done(){b.textContent=${js(t.copied)}}
b.onclick=function(){if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(done,fallback)}else fallback()};
function fallback(){var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){}document.body.removeChild(ta)}
${auto ? `setTimeout(function(){location.href=${js(link.url)}},150);` : ''}
})();
</script>`,
  )
}
