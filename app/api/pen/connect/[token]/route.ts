import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { readOnlyRefusal } from '@/lib/pen/access'
import { APP_NAME, COPY, chatState, claimNonce, isPreviewBot, verifyConnectToken, type ConnectApp } from '@/lib/pen/connect-link'
import { STATE_COOKIE, authorizeUrl as gcalAuthorizeUrl, gcalConfigured } from '@/lib/pen/google-calendar'
import { gmailAuthorizeUrl, gmailAvailable, gmailReadAllowed, scopesOf } from '@/lib/pen/gmail'
import { authorizeUrl as notionAuthorizeUrl, notionConfigured } from '@/lib/pen/notion'
import { STATE_COOKIE as GRANOLA_COOKIE, authorizeUrl as granolaAuthorizeUrl, granolaAvailable, makeAttempt } from '@/lib/pen/granola'
import type { Lang } from '@/lib/pen/i18n'

export const dynamic = 'force-dynamic'

// The personal link the chat sends (lib/pen/connect-link.ts): verify it, spend it, and go straight
// to Google's / Notion's consent screen for that account. No website sign-in: the token is the
// proof, and the OAuth state carries the account to the callback, tied to this browser by the
// same nonce cookie the website flow uses.

function langFrom(req: Request): Lang {
  const a = (req.headers.get('accept-language') ?? '').toLowerCase()
  return a.startsWith('es') ? 'es' : a.startsWith('pt') ? 'pt' : 'en'
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** A plain page for a link that can't be used. Same words as /pen/connected. */
function refuse(status: number, lang: Lang, reason: string): Response {
  const L = COPY[lang]
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Juno</title>
<style>body{margin:0;background:#F2EFE5;color:#16150F;font:16px/1.5 -apple-system,system-ui,sans-serif}main{max-width:420px;margin:18vh auto 0;padding:0 20px}h1{font:400 30px/1.2 Georgia,serif;margin:0 0 10px}p{margin:0 0 8px;color:#514E45}</style></head>
<body><main><h1>${esc(L.failTitle)}</h1><p>${esc(L.errors[reason] ?? L.errors.failed)}</p><p>${esc(L.askAgain)}</p></main></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}

async function lang(email: string): Promise<Lang> {
  const { userLang } = await import('@/lib/pen/user-lang')
  return userLang(email).catch(() => 'en' as Lang)
}

/**
 * Gmail's consent screen from the chat. Reading for the allowlist (team test). Calendar on the same
 * screen (20 Oct). "Connect my work calendar" (`cal`): calendar only for a new address; for one
 * already connected (`hint`), what it allows now plus the calendar, so the new token loses nothing.
 */
async function gmailUrl(email: string, state: string, origin: string, hint: string | null, cal: boolean): Promise<string> {
  const read = await gmailReadAllowed(email)
  const had = hint ? await scopesOf(email, hint) : null
  if (cal && !had) return gmailAuthorizeUrl(state, origin, { send: false, calendar: true, hint })
  return gmailAuthorizeUrl(state, origin, { read: read && (had ? had.read || !cal : true), send: had ? had.send || !cal : true, calendar: true, hint })
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const origin = new URL(req.url).origin
  const v = verifyConnectToken(token)
  if (!v.ok) return v.reason === 'expired' ? refuse(410, await lang(v.email), 'expired') : refuse(400, langFrom(req), 'bad')

  // A chat app fetching the link for its preview must not spend it.
  if (isPreviewBot(req.headers.get('user-agent'))) {
    return new Response(`<!doctype html><title>Juno · ${APP_NAME.en[v.app]}</title>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }

  const L = await lang(v.email)
  const configured: Record<ConnectApp, boolean> = { gcal: gcalConfigured(), gdrive: gcalConfigured(), notion: notionConfigured(), granola: v.app === 'granola' ? await granolaAvailable() : false, gmail: v.app === 'gmail' ? await gmailAvailable() : false }
  if (!configured[v.app]) return refuse(503, L, 'setup')
  if (await readOnlyRefusal(v.email)) return refuse(403, L, 'readonly')
  if (!(await claimNonce(v.email, v.nonce, v.app))) return refuse(410, L, 'used')

  // Granola: PKCE, so the nonce travels with the verifier in its sealed cookie.
  if (v.app === 'granola') {
    try {
      const a = makeAttempt()
      const res = NextResponse.redirect(await granolaAuthorizeUrl(origin, chatState(v.email, 'granola', a.nonce, v.via), a.verifier))
      res.cookies.set(GRANOLA_COOKIE, a.cookie, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: origin.startsWith('https') })
      res.headers.set('Cache-Control', 'no-store')
      res.headers.set('Referrer-Policy', 'no-referrer')
      return res
    } catch (e) {
      console.warn(`pen connect granola: ${(e as Error).message}`)
      return refuse(502, L, 'failed')
    }
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  const state = chatState(v.email, v.app, nonce, v.via)
  const google = v.app === 'gcal' || v.app === 'gdrive' || v.app === 'gmail'
  const res = NextResponse.redirect(
    v.app === 'gmail' ? await gmailUrl(v.email, state, origin, v.hint, v.cal) : google ? gcalAuthorizeUrl(v.email, state, origin, v.app === 'gdrive' ? 'drive' : 'gcal') : notionAuthorizeUrl(origin, state),
  )
  res.cookies.set(google ? STATE_COOKIE : 'juno_notion_state', nonce, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: origin.startsWith('https') })
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
