import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { connectionsHref } from '@/lib/pen/settings-paths'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { STATE_COOKIE } from '@/lib/pen/google-calendar'
import { gmailAuthorizeUrl, gmailAvailable, gmailReadAllowed, gmailState, scopesOf } from '@/lib/pen/gmail'

export const dynamic = 'force-dynamic'

// Settings → Email → Connect Gmail: off to Google's consent screen for send-only Gmail, with the
// account picker (any Google account, not just the Juno login). Comes back to the Calendar
// callback (one redirect URI), which recognises the 'm.' state.
//
// ?read=1&address=x — "Let Juno read this inbox" (team test, lib/pen/gmail.ts gmailReadAllowed):
// the same screen asking send + readonly, with that address preselected. Ignored for anyone else.
//
// Calendar (20 Oct): every connect also asks for that account's calendar (the user can untick it).
// ?cal=1&address=x — "Add calendar" on an address already connected: what it allows now (send,
// reading) plus the calendar, so the new token loses nothing. ?cal=1 alone = a calendar-only account.
// Re-asking an address keeps what it had (reading stays on for an address that reads).
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (!(await gmailAvailable())) return NextResponse.redirect(new URL(connectionsHref('email', 'error=setup'), req.url))
  if (await readOnlyRefusal(email)) return NextResponse.redirect(new URL(connectionsHref('email', 'error=readonly'), req.url))
  const u = new URL(req.url)
  const origin = u.origin
  const raw = (u.searchParams.get('address') ?? '').trim().toLowerCase()
  const hint = /^[^\s@]+@[^\s@]+$/.test(raw) ? raw : null
  const cal = u.searchParams.get('cal') === '1'
  const had = hint ? await scopesOf(email, hint) : null
  const readOk = await gmailReadAllowed(email)
  const read = readOk && (u.searchParams.get('read') === '1' || Boolean(had?.read))
  const send = cal && !had ? false : had ? had.send || !cal : true
  const nonce = crypto.randomBytes(16).toString('hex')
  const res = NextResponse.redirect(gmailAuthorizeUrl(gmailState(email, nonce, Date.now(), read && u.searchParams.get('read') === '1', true), origin, { read: read && send, hint, send, calendar: true }))
  res.cookies.set(STATE_COOKIE, nonce, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: origin.startsWith('https') })
  return res
}
