import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { STATE_COOKIE } from '@/lib/pen/google-calendar'
import { gmailAuthorizeUrl, gmailAvailable, gmailState } from '@/lib/pen/gmail'

export const dynamic = 'force-dynamic'

// Settings → Email → Connect Gmail: off to Google's consent screen for send-only Gmail, with the
// account picker (any Google account, not just the Juno login). Comes back to the Calendar
// callback (one redirect URI), which recognises the 'm.' state.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (!(await gmailAvailable())) return NextResponse.redirect(new URL('/pen/settings/email?error=setup', req.url))
  if (await readOnlyRefusal(email)) return NextResponse.redirect(new URL('/pen/settings/email?error=readonly', req.url))
  const origin = new URL(req.url).origin
  const nonce = crypto.randomBytes(16).toString('hex')
  const res = NextResponse.redirect(gmailAuthorizeUrl(gmailState(email, nonce), origin))
  res.cookies.set(STATE_COOKIE, nonce, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: origin.startsWith('https') })
  return res
}
