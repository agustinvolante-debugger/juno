import { NextResponse } from 'next/server'
import { getDraftById, type Draft } from '@/lib/pen/whatsapp/store'
import { fitLink, PROVIDER_NAME, type ComposeParts, type MailProvider } from '@/lib/pen/mail-compose'
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
const T: Record<Lang, { title: string; open: (p: string) => string; app: string; desk: string; or: string; appDesk: string; opening: string; copy: string; copied: string; to: string; subject: string; long: string; twice: string; gone: string }> = {
  en: {
    title: 'Your email draft',
    open: (p) => `Open in ${p}`,
    app: 'Open in my mail app',
    desk: 'Opens in your web mail, ready to send.',
    or: 'Or open it in',
    appDesk: 'Use this computer\'s mail app instead',
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
    desk: 'Se abre en tu correo web, listo para enviar.',
    or: 'O ábrelo en',
    appDesk: 'Usar la app de correo de este computador',
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
    desk: 'Abre no seu e-mail na web, pronto para enviar.',
    or: 'Ou abra no',
    appDesk: 'Usar o app de e-mail deste computador',
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
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Lora:wght@600&family=Newsreader:ital,opsz,wght@1,6..72,600&display=swap">
<style>
/* The Pen app's skin (app/pen/app-skin.css): light grey canvas, white cards, one blue, Inter. */
:root{--paper:#f5f5f7;--panel:#fff;--line:#d2d2d7;--hair:#e8e8ed;--ink:#1d1d1f;--soft:#424245;--dim:#6e6e73;--blue:#0066cc;--blue-hi:#0071e3;--blue-ink:#0055aa;--wash:#e8f1fc}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
::selection{background:var(--wash);color:var(--ink)}
main{max-width:520px;margin:0 auto;padding:20px 16px 40px}
.brand{display:flex;align-items:center;gap:8px;margin:0 0 28px;color:var(--ink);text-decoration:none}
.brand img{width:30px;height:30px;border-radius:8px;display:block}
.brand b{font:600 17px/1 Lora,Georgia,serif;letter-spacing:-.02em}
.brand b span{font-family:Newsreader,Georgia,serif;font-style:italic}
h1{font-weight:600;font-size:30px;line-height:1.1;letter-spacing:-.035em;margin:0 0 8px;text-wrap:balance}
.lead{margin:0 0 22px;color:var(--soft);font-size:16px}
.lead[role=status]::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--blue);margin:0 8px 1px 0;vertical-align:middle;animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.lead[role=status]::before{animation:none}}
a.btn,button{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;padding:13px 20px;border-radius:9999px;font-family:inherit;font-size:17px;font-weight:500;line-height:1.2;letter-spacing:-.01em;text-decoration:none;cursor:pointer;margin:0 0 10px;transition:background .18s ease,box-shadow .18s ease,translate .18s ease}
a.btn{color:#fff;border:1px solid #0062c4;background:linear-gradient(180deg,#1b7be3,#0066cc);box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 1px 2px rgba(0,51,122,.22),0 8px 18px -8px rgba(0,102,204,.55)}
a.btn:hover{background:linear-gradient(180deg,#2385ec,#0071e3)}
a.btn:active{translate:0 1px;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 1px 2px rgba(0,51,122,.22)}
button{background:var(--panel);color:var(--blue-ink);border:1px solid var(--line);box-shadow:0 1px 2px rgba(29,29,31,.04)}
button:hover{background:#fafafc;border-color:#c2c2c8}
button.ok{color:#1b7a3b;border-color:#bfe3cb;background:#e7f5ec}
:focus-visible{outline:2px solid var(--blue-hi);outline-offset:3px}
.card{background:var(--panel);border:1px solid var(--hair);border-radius:18px;padding:18px 18px 20px;margin:14px 0 16px;box-shadow:0 1px 2px rgba(29,29,31,.04),0 12px 24px -12px rgba(29,29,31,.12)}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:15px;padding:0 0 14px;margin:0 0 14px;border-bottom:1px solid var(--hair);word-break:break-word}
.meta dt{color:var(--dim)}.meta dd{margin:0;color:var(--ink)}
.meta dd.subj{font-weight:600}
.body{white-space:pre-wrap;word-break:break-word;font-size:16px;line-height:1.55;color:var(--ink)}
.note{font-size:14px;color:var(--dim);margin:6px 4px 0;text-align:center}
.alt{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:2px 0 6px;font-size:15px;color:var(--dim)}
.alt a{display:inline-flex;align-items:center;min-height:40px;padding:8px 16px;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--blue-ink);text-decoration:none;font-weight:500}
.alt a:hover{border-color:#c2c2c8;background:#fafafc}
.applink{display:block;text-align:center;margin:14px 0 0;font-size:14px;color:var(--blue-ink);text-underline-offset:3px}
</style></style></head><body><main><a class="brand" href="https://www.tryjunoapp.com" aria-label="Juno Pen"><img src="/juno_mark.png" alt="" width="30" height="30"><b><span>J</span>uno Pen</b></a>${inner}</main></body></html>`
  return new Response(html, { status, headers: HEADERS })
}

/** Phones and tablets that say so. An iPad says "Macintosh": script() catches it by touch. */
const isPhone = (ua: string | null) => /iPhone|iPod|Android|Mobile|Windows Phone/i.test(ua ?? '')

const copyText = (d: Draft) => `${d.subject}\n\n${d.body}`

function card(d: Draft, lang: Lang, t: (typeof T)[Lang]): string {
  return `<div class="card"><dl class="meta">${d.from ? `<dt>${lang === 'en' ? 'From' : 'De'}</dt><dd>${esc(d.from)}</dd>` : ''}<dt>${esc(t.to)}</dt><dd>${esc(d.toName)}${d.toEmail ? ` &lt;${esc(d.toEmail)}&gt;` : ''}</dd><dt>${esc(t.subject)}</dt><dd class="subj">${esc(d.subject)}</dd></dl><div class="body">${esc(d.body)}</div></div>`
}

/** Copy button, plus: open `auto` at once (phone), or `ipad` only on a touch "Mac" (an iPad). */
function script(text: string, t: (typeof T)[Lang], auto: string | null, ipad: string | null): string {
  return `<script>
(function(){var text=${js(text)},b=document.getElementById('c');
function done(){b.textContent=${js(t.copied)};b.className='ok'}
b.onclick=function(){if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(done,fallback)}else fallback()};
function fallback(){var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){}document.body.removeChild(ta)}
${auto ? `setTimeout(function(){location.href=${js(auto)}},150);` : ''}${ipad ? `if(navigator.maxTouchPoints>1)setTimeout(function(){location.href=${js(ipad)}},150);` : ''}
})();
</script>`
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

  // A computer (18 Oct, founder): mailto: there opens Apple Mail or nothing, so the page leads with
  // the web mail Juno picked for them, offers the other two, and keeps the mail app as a small link.
  // An iPad says "Macintosh"; the script below sends it to the mail app like a phone.
  if (!web && !isPhone(req.headers.get('user-agent'))) {
    const first: MailProvider = d.provider ?? 'gmail'
    const fam = (p: MailProvider) => (p === 'outlook_live' ? 'outlook' : p)
    const rest = (['gmail', 'outlook_live', 'yahoo'] as MailProvider[]).filter((p) => fam(p) !== fam(first))
    const main = fitLink('web', parts, first, d.from)
    const copyFirst = !main.full
    const alt = rest.map((p) => `<a href="${esc(fitLink('web', parts, p, d.from).url)}" rel="noopener">${esc(PROVIDER_NAME[p])}</a>`).join('')
    return page(
      lang,
      t.title,
      `<h1>${esc(t.title)}</h1>
<p class="lead">${esc(copyFirst ? t.long : t.desk)}</p>
${copyFirst ? `<button id="c" type="button">${esc(t.copy)}</button>` : ''}
<a class="btn" href="${esc(main.url)}" rel="noopener">${esc(t.open(PROVIDER_NAME[first]))}</a>
<div class="alt"><span>${esc(t.or)}</span>${alt}</div>
${card(d, lang, t)}
${copyFirst ? '' : `<button id="c" type="button">${esc(t.copy)}</button>`}
<a class="applink" href="${esc(link.url)}">${esc(t.appDesk)}</a>
<p class="note">${esc(t.twice)}</p>
${script(copyText(d), t, null, link.full && /Macintosh/.test(req.headers.get('user-agent') ?? '') ? link.url : null)}`,
    )
  }

  const label = web ? t.open(PROVIDER_NAME[web]) : t.app
  // The mail app opens at once when the whole email fits; when it doesn't, they copy first.
  const auto = !web && link.full
  return page(
    lang,
    t.title,
    `<h1>${esc(t.title)}</h1>
${auto ? `<p class="lead" role="status">${esc(t.opening)}</p>` : `<p class="lead">${esc(t.long)}</p>`}
${link.full ? '' : `<button id="c" type="button">${esc(t.copy)}</button>`}
<a class="btn" id="o" href="${esc(link.url)}"${web ? ' rel="noopener"' : ''}>${esc(label)}</a>
${card(d, lang, t)}
${link.full ? `<button id="c" type="button">${esc(t.copy)}</button>` : ''}
<p class="note">${esc(t.twice)}</p>
${script(copyText(d), t, auto ? link.url : null, null)}`,
  )
}
