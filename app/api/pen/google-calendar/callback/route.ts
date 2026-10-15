import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { STATE_COOKIE, connectGcal, verifyState } from '@/lib/pen/google-calendar'

export const dynamic = 'force-dynamic'

// Google sends them back here with a code. The state must be ours, unexpired, for this signed-in
// account and this browser; then the code is swapped and the refresh token kept sealed.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/pen/settings/calendar?${q}`, req.url))
    res.cookies.delete(STATE_COOKIE)
    return res
  }
  const email = await authedEmail()
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (u.searchParams.get('error')) return back('error=cancelled')
  const nonce = (await cookies()).get(STATE_COOKIE)?.value
  const code = u.searchParams.get('code')
  if (!code || !verifyState(u.searchParams.get('state'), email, nonce)) return back('error=state')
  if (await readOnlyRefusal(email)) return back('error=readonly')
  try {
    await connectGcal(email, code)
    return back('connected=1')
  } catch (e) {
    console.warn(`pen gcal connect: ${(e as Error).message}`)
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`)
  }
}
