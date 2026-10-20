import { NextResponse } from 'next/server'
import { connectionsHref } from '@/lib/pen/settings-paths'
import { authedEmail } from '@/lib/news/auth'
import { STATE_COOKIE, authorizeUrl, granolaAvailable, makeAttempt } from '@/lib/pen/granola'

export const dynamic = 'force-dynamic'

// Settings → Granola → "Connect with Granola": off to Granola's own sign-in (OAuth with PKCE; Juno's
// client is registered with Granola once, by DCR). The cookie holds the state nonce and the PKCE
// verifier, sealed, so the callback only accepts the answer to a request this browser made.
export async function GET(req: Request) {
  const email = await authedEmail()
  const origin = new URL(req.url).origin
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (!(await granolaAvailable())) return NextResponse.redirect(new URL(connectionsHref('granola', 'error=setup'), req.url))
  try {
    const a = makeAttempt()
    const res = NextResponse.redirect(await authorizeUrl(origin, a.nonce, a.verifier))
    res.cookies.set(STATE_COOKIE, a.cookie, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: origin.startsWith('https') })
    return res
  } catch (e) {
    console.warn(`pen granola connect: ${(e as Error).message}`)
    return NextResponse.redirect(new URL(connectionsHref('granola', { error: (e as Error).message.slice(0, 200) }), req.url))
  }
}
