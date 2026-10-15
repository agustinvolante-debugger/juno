import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { STATE_COOKIE, asWant, authorizeUrl, gcalConfigured, makeState } from '@/lib/pen/google-calendar'

export const dynamic = 'force-dynamic'

// Settings → Google → Connect: off to Google's consent screen for one ability (?want=gcal, the
// default; ?want=drive for Docs & Sheets; ?want=both). The state is signed with the signed-in
// email and the ability; its nonce is also a cookie, so the callback only accepts the answer to a
// request this browser and this account made.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (!gcalConfigured()) return NextResponse.redirect(new URL('/pen/settings/google?error=setup', req.url))
  if (await readOnlyRefusal(email)) return NextResponse.redirect(new URL('/pen/settings/google?error=readonly', req.url))
  const want = asWant(new URL(req.url).searchParams.get('want'))
  const nonce = crypto.randomBytes(16).toString('hex')
  const res = NextResponse.redirect(authorizeUrl(email, makeState(email, nonce, Date.now(), want), new URL(req.url).origin, want))
  res.cookies.set(STATE_COOKIE, nonce, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: new URL(req.url).protocol === 'https:' })
  return res
}
