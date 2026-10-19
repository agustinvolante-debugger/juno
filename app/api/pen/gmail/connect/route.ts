import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { STATE_COOKIE } from '@/lib/pen/google-calendar'
import { gmailAuthorizeUrl, gmailAvailable, gmailReadAllowed, gmailState } from '@/lib/pen/gmail'

export const dynamic = 'force-dynamic'

// Settings → Email → Connect Gmail: off to Google's consent screen for send-only Gmail, with the
// account picker (any Google account, not just the Juno login). Comes back to the Calendar
// callback (one redirect URI), which recognises the 'm.' state.
//
// ?read=1&address=x — "Let Juno read this inbox" (team test, lib/pen/gmail.ts gmailReadAllowed):
// the same screen asking send + readonly, with that address preselected. Ignored for anyone else.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (!(await gmailAvailable())) return NextResponse.redirect(new URL('/pen/settings/email?error=setup', req.url))
  if (await readOnlyRefusal(email)) return NextResponse.redirect(new URL('/pen/settings/email?error=readonly', req.url))
  const u = new URL(req.url)
  const origin = u.origin
  const read = u.searchParams.get('read') === '1' && (await gmailReadAllowed(email))
  const hint = read ? (u.searchParams.get('address') ?? '').trim().toLowerCase() : ''
  const nonce = crypto.randomBytes(16).toString('hex')
  const res = NextResponse.redirect(gmailAuthorizeUrl(gmailState(email, nonce, Date.now(), read), origin, { read, hint: /^[^\s@]+@[^\s@]+$/.test(hint) ? hint : null }))
  res.cookies.set(STATE_COOKIE, nonce, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: origin.startsWith('https') })
  return res
}
