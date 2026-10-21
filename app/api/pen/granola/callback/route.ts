import { NextResponse } from 'next/server'
import { connectionsHref } from '@/lib/pen/settings-paths'
import { cookies } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { announceConnected, announceFromSettings, connectedPage, readChatState } from '@/lib/pen/connect-link'
import { STATE_COOKIE, connectOAuth, readAttempt } from '@/lib/pen/granola'

export const dynamic = 'force-dynamic'

// Granola sends them back here with a code. Checked against the sealed cookie (state nonce and
// PKCE verifier), swapped for tokens, kept sealed; then back to Settings → Granola.
//
// A connect started from the chat (lib/pen/connect-link.ts) has no session: its state is a signed
// "chat state" carrying the account, checked against the nonce in the same cookie. It lands on
// /pen/connected and Juno says "Connected ✓" in the chat.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const attempt = readAttempt((await cookies()).get(STATE_COOKIE)?.value)
  const chat = readChatState(u.searchParams.get('state'), 'granola', attempt?.nonce)
  const email = chat?.email ?? (await authedEmail())
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  const back = async (q: string) => {
    const err = new URLSearchParams(q).get('error') ?? undefined
    const res = NextResponse.redirect(new URL(chat ? await connectedPage('granola', email, chat.via, err) : connectionsHref('granola', q), req.url))
    res.cookies.delete(STATE_COOKIE)
    return res
  }
  if (u.searchParams.get('error')) return back('error=cancelled')
  const code = u.searchParams.get('code')
  if (!code || !attempt || (!chat && attempt.nonce !== u.searchParams.get('state'))) return back('error=state')
  if (chat && (await readOnlyRefusal(email))) return back('error=readonly')
  try {
    await connectOAuth(email, code, attempt.verifier, u.origin)
    if (chat) await announceConnected(email, 'granola', chat.via)
    else await announceFromSettings(email, 'granola')
    return back('connected=1')
  } catch (e) {
    console.warn(`pen granola callback: ${(e as Error).message}`)
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`)
  }
}
