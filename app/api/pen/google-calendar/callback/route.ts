import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { announceConnected, connectedPage, readChatState } from '@/lib/pen/connect-link'
import { STATE_COOKIE, connectGcal, verifyState } from '@/lib/pen/google-calendar'

export const dynamic = 'force-dynamic'

// Google sends them back here with a code. The state must be ours, unexpired, for this signed-in
// account and this browser; then the code is swapped and the refresh token kept sealed.
//
// A connect started from the chat (lib/pen/connect-link.ts) has no session: its state is a
// signed "chat state" carrying the account, tied to this browser by the same nonce cookie. It
// lands on /pen/connected and Juno says "Connected ✓" in the chat.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const nonce = (await cookies()).get(STATE_COOKIE)?.value
  const state = u.searchParams.get('state')
  const chat = readChatState(state, 'gcal', nonce)
  const email = chat?.email ?? (await authedEmail())
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  const back = async (q: string) => {
    const err = new URLSearchParams(q).get('error') ?? undefined
    const res = NextResponse.redirect(new URL(chat ? await connectedPage('gcal', email, chat.via, err) : `/pen/settings/calendar?${q}`, req.url))
    res.cookies.delete(STATE_COOKIE)
    return res
  }
  if (u.searchParams.get('error')) return back('error=cancelled')
  const code = u.searchParams.get('code')
  if (!code || (!chat && !verifyState(state, email, nonce))) return back('error=state')
  if (await readOnlyRefusal(email)) return back('error=readonly')
  try {
    await connectGcal(email, code, u.origin)
    if (chat) await announceConnected(email, 'gcal', chat.via)
    return back('connected=1')
  } catch (e) {
    console.warn(`pen gcal connect: ${(e as Error).message}`)
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`)
  }
}
