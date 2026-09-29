import { getDraftById } from '@/lib/pen/whatsapp/store'

export const dynamic = 'force-dynamic'

// "Or send it from your own email": the link under a WhatsApp draft. One button that opens the
// phone's own mail app with To, Subject and body filled in, so it goes from their address and
// lands in their Sent folder, with no Gmail or Outlook connection. The id is random and the
// draft expires after a day (or when Juno sends it), so the page needs no sign-in.

type Lang = 'en' | 'es' | 'pt'
const T: Record<Lang, { title: string; open: string; copy: string; copied: string; to: string; subject: string; twice: string; gone: string }> = {
  en: {
    title: 'Send from your own email',
    open: 'Open in my email',
    copy: 'Copy the text',
    copied: 'Copied',
    to: 'To',
    subject: 'Subject',
    twice: 'Sent it from here? Don\'t also reply "send it" on WhatsApp, or it goes twice.',
    gone: 'This draft has expired or was already sent. Ask Juno on WhatsApp for a new one.',
  },
  es: {
    title: 'Mándalo desde tu correo',
    open: 'Abrir en mi correo',
    copy: 'Copiar el texto',
    copied: 'Copiado',
    to: 'Para',
    subject: 'Asunto',
    twice: '¿Lo mandaste desde aquí? No respondas también "envíalo" en WhatsApp, o sale dos veces.',
    gone: 'Este borrador expiró o ya se envió. Pídele uno nuevo a Juno por WhatsApp.',
  },
  pt: {
    title: 'Envie do seu email',
    open: 'Abrir no meu email',
    copy: 'Copiar o texto',
    copied: 'Copiado',
    to: 'Para',
    subject: 'Assunto',
    twice: 'Enviou daqui? Não responda também "enviar" no WhatsApp, ou vai duas vezes.',
    gone: 'Este rascunho expirou ou já foi enviado. Peça um novo ao Juno no WhatsApp.',
  },
}

function langOf(req: Request): Lang {
  const a = (req.headers.get('accept-language') ?? '').toLowerCase()
  return a.startsWith('pt') ? 'pt' : a.startsWith('es') ? 'es' : 'en'
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(lang: Lang, title: string, inner: string): Response {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{--paper:#F2EFE5;--panel:#FFFFFF;--line:#DCD5C4;--ink:#16150F;--soft:#514E45;--accent:#0B6B44;--accent-ink:#08482E}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:560px;margin:0 auto;padding:28px 16px 40px}h1{font-size:22px;margin:0 0 16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:16px}
.meta{font-size:14px;color:var(--soft);margin-bottom:10px;word-break:break-word}.meta b{color:var(--ink)}
.body{white-space:pre-wrap;word-break:break-word;font-size:15px}
a.btn,button{display:block;width:100%;text-align:center;border-radius:12px;padding:14px;font:600 16px/1.2 inherit;font-family:inherit;text-decoration:none;cursor:pointer;margin-bottom:10px}
a.btn{background:var(--accent);color:#fff;border:0}button{background:var(--panel);color:var(--accent-ink);border:1px solid var(--line)}
.note{font-size:13px;color:var(--soft)}
</style></head><body><main>${inner}</main></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = langOf(req)
  const t = T[lang]
  const d = await getDraftById(id).catch(() => null)
  if (!d || !d.toEmail) return page(lang, t.title, `<h1>${esc(t.title)}</h1><p>${esc(t.gone)}</p>`)

  // CRLF line breaks, per RFC 6068; iOS Mail and Gmail both keep the paragraphs.
  const mailto =
    `mailto:${encodeURIComponent(d.toEmail).replace(/%40/g, '@')}` +
    `?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body.replace(/\r?\n/g, '\r\n'))}`
  const copyText = JSON.stringify(`${d.subject}\n\n${d.body}`).replace(/</g, '\\u003c')

  return page(
    lang,
    t.title,
    `<h1>${esc(t.title)}</h1>
<div class="card"><div class="meta"><b>${esc(t.to)}:</b> ${esc(d.toName)} &lt;${esc(d.toEmail)}&gt;<br><b>${esc(t.subject)}:</b> ${esc(d.subject)}</div><div class="body">${esc(d.body)}</div></div>
<a class="btn" href="${esc(mailto)}">${esc(t.open)}</a>
<button id="c" type="button">${esc(t.copy)}</button>
<p class="note">${esc(t.twice)}</p>
<script>document.getElementById('c').onclick=function(){var b=this;navigator.clipboard.writeText(${copyText}).then(function(){b.textContent=${JSON.stringify(t.copied)}})}</script>`,
  )
}
