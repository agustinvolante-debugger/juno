// The Outlook OAuth callback's logic (21 Oct), kept apart from the route so the dry-run sims can
// drive it without a Next request (app/api/pen/outlook/callback/route.ts only wires the cookie and
// the session in).
//   · A website connect: state 'o.…' signed for this signed-in account + this browser's nonce cookie.
//   · A chat connect (lib/pen/connect-link.ts): a chat state for app 'outlook' carrying the account;
//     lands on /pen/connected and Juno says "Connected ✓" in the chat.
//   · An IT admin approving Juno Pen for their organisation (the admin-consent link) comes back with
//     admin_consent=True (or an error) and state 'admin': a plain page, no session needed.
//   · A work account whose organisation lets only IT approve apps (AADSTS65001 / 90094): a clear
//     message and the admin-consent link to forward, on the page and in the chat.

import { connectionsHref } from './settings-paths'
import { readOnlyRefusal } from './access'
import { announceAdminConsent, announceConnected, connectedPage, readChatState } from './connect-link'
import { OutlookError, connectOutlook, outlookAdminUrl, verifyOutlookState, type Want } from './outlook'
import { classifyMsError } from './outlook-graph'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const ADMIN = {
  en: { ok: 'Approved', okLine: 'Juno Pen is approved for your organization. People there can now connect their Outlook from Juno.', no: 'Not approved', noLine: 'Microsoft didn’t record an approval. You can open the approval link again.' },
  es: { ok: 'Aprobado', okLine: 'Juno Pen quedó aprobado para tu organización. Las personas de tu organización ya pueden conectar su Outlook desde Juno.', no: 'No se aprobó', noLine: 'Microsoft no registró una aprobación. Puedes abrir el link de aprobación otra vez.' },
  pt: { ok: 'Aprovado', okLine: 'O Juno Pen foi aprovado para a sua organização. As pessoas de lá já podem conectar o Outlook pelo Juno.', no: 'Não aprovado', noLine: 'A Microsoft não registrou uma aprovação. Você pode abrir o link de aprovação de novo.' },
}

export function adminPage(acceptLanguage: string | null, ok: boolean): Response {
  const a = (acceptLanguage ?? '').toLowerCase()
  const lang = a.startsWith('es') ? 'es' : a.startsWith('pt') ? 'pt' : 'en'
  const L = ADMIN[lang]
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Juno Pen</title>
<style>body{margin:0;background:#F2EFE5;color:#16150F;font:16px/1.5 -apple-system,system-ui,sans-serif}main{max-width:440px;margin:18vh auto 0;padding:0 20px}h1{font:400 30px/1.2 Georgia,serif;margin:0 0 10px}p{margin:0;color:#514E45}</style></head>
<body><main><h1>${esc(ok ? L.ok : L.no)}</h1><p>${esc(ok ? L.okLine : L.noLine)}</p></main></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}

const wantOf = (w: string | undefined): Want => (w ? { cal: w.includes('c'), send: w.includes('s') } : { cal: true, send: true })

export type CallbackResult = { redirect: string; clearCookie: boolean } | { page: Response }

/** Everything the callback does. `sessionEmail`: the signed-in account (website flow), looked up only when needed. */
export async function handleOutlookCallback(url: string, o: { nonce: string | null | undefined; sessionEmail: () => Promise<string | null>; acceptLanguage?: string | null }): Promise<CallbackResult> {
  const u = new URL(url)
  const state = u.searchParams.get('state')
  if (u.searchParams.has('admin_consent') || state === 'admin') return { page: adminPage(o.acceptLanguage ?? null, /^true$/i.test(u.searchParams.get('admin_consent') ?? '')) }

  const chat = readChatState(state, 'outlook', o.nonce)
  const email = chat?.email ?? (await o.sessionEmail())
  if (!email) return { redirect: '/pen', clearCookie: false }
  const back = async (q: Record<string, string>): Promise<CallbackResult> => {
    let to: string
    if (chat) {
      to = await connectedPage('outlook', email, chat.via, q.error)
      if (q.tenant) to += `&tenant=${encodeURIComponent(q.tenant)}`
    } else to = connectionsHref('outlook', q)
    return { redirect: to, clearCookie: true }
  }
  const adminConsent = async (tenant: string | null) => {
    if (chat) await announceAdminConsent(email, chat.via, outlookAdminUrl({ tenant }))
    return back({ error: 'admin_consent', ...(tenant ? { tenant } : {}) })
  }

  const err = u.searchParams.get('error')
  if (err) {
    const kind = classifyMsError(err, u.searchParams.get('error_description'))
    if (kind === 'admin_consent') return adminConsent(null)
    return back({ error: kind === 'cancelled' ? 'cancelled' : 'failed' })
  }
  const code = u.searchParams.get('code')
  const site = chat ? null : verifyOutlookState(state, email, o.nonce)
  if (!code || (!chat && !site)) return back({ error: 'state' })
  if (await readOnlyRefusal(email)) return back({ error: 'readonly' })
  try {
    const r = await connectOutlook(email, code, u.origin, chat ? wantOf(chat.w) : site!)
    if (chat) await announceConnected(email, 'outlook', chat.via, r.address, { canSend: r.canSend, canCal: r.canCal, calFull: r.calFull })
    return back({ connected: r.address, cal: r.canCal ? 'on' : r.calFull ? 'full' : 'off', send: r.canSend ? 'on' : 'off' })
  } catch (e) {
    console.warn(`pen outlook connect: ${(e as Error).message}`)
    if (e instanceof OutlookError && e.code === 'admin_consent') return adminConsent(e.tenant)
    const map: Record<string, string> = { not_granted: chat ? 'ms_not_granted' : 'not_granted', too_many: chat ? 'ms_too_many' : 'too_many', cal_full: chat ? 'ms_cal_full' : 'cal_full', cancelled: 'cancelled' }
    return back({ error: e instanceof OutlookError && map[e.code] ? map[e.code] : 'failed' })
  }
}
