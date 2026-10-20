import { NextResponse } from 'next/server'
import { connectionsHref } from '@/lib/pen/settings-paths'
import { cookies } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { announceConnected, connectedPage, readChatState } from '@/lib/pen/connect-link'
import { STATE_COOKIE, connectGcal, stateWant, verifyState, type GoogleWant } from '@/lib/pen/google-calendar'
import { GMAIL_STATE_PREFIX, GmailError, connectGmail, gmailReadAllowed, gmailStateWantsCal, gmailStateWantsRead, verifyGmailState } from '@/lib/pen/gmail'

export const dynamic = 'force-dynamic'

// Google sends them back here with a code. The state must be ours, unexpired, for this signed-in
// account and this browser; then the code is swapped and the refresh token kept sealed.
//
// A connect started from the chat (lib/pen/connect-link.ts) has no session: its state is a
// signed "chat state" carrying the account, tied to this browser by the same nonce cookie. It
// lands on /pen/connected and Juno says "Connected ✓" in the chat.
//
// One callback for both Google abilities (Calendar, Docs & Sheets): the state says which was
// asked for (a chat state's app, or the website state's `w`). Its path is the redirect URI
// registered in Google Cloud, so it keeps its calendar name.
//
// Gmail (send only, lib/pen/gmail.ts) comes back here too, so no new redirect URI is needed: a
// Settings state starting 'm.' or a chat state for app 'gmail' goes to gmailCallback.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const nonce = (await cookies()).get(STATE_COOKIE)?.value
  const state = u.searchParams.get('state')
  const chatGmail = readChatState(state, 'gmail', nonce)
  if (chatGmail || state?.startsWith(GMAIL_STATE_PREFIX)) return gmailCallback(req, u, state, nonce, chatGmail)
  const chatCal = readChatState(state, 'gcal', nonce)
  const chatDrive = chatCal ? null : readChatState(state, 'gdrive', nonce)
  const chat = chatCal ?? chatDrive
  const app = chatDrive ? 'gdrive' : 'gcal'
  const want: GoogleWant = chat ? (chatDrive ? 'drive' : 'gcal') : stateWant(state)
  const email = chat?.email ?? (await authedEmail())
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  const back = async (q: string) => {
    const err = new URLSearchParams(q).get('error') ?? undefined
    const res = NextResponse.redirect(new URL(chat ? await connectedPage(app, email, chat.via, err) : connectionsHref('google', q), req.url))
    res.cookies.delete(STATE_COOKIE)
    return res
  }
  if (u.searchParams.get('error')) return back('error=cancelled')
  const code = u.searchParams.get('code')
  if (!code || (!chat && !verifyState(state, email, nonce))) return back('error=state')
  if (await readOnlyRefusal(email)) return back('error=readonly')
  try {
    await connectGcal(email, code, u.origin, want)
    if (chat) await announceConnected(email, app, chat.via)
    return back(`connected=${want}`)
  } catch (e) {
    console.warn(`pen gcal connect: ${(e as Error).message}`)
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`)
  }
}

async function gmailCallback(req: Request, u: URL, state: string | null, nonce: string | undefined, chat: { email: string; via: 'wa' | 'im' } | null) {
  const email = chat?.email ?? (await authedEmail())
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  const back = async (q: Record<string, string>) => {
    const res = NextResponse.redirect(new URL(chat ? await connectedPage('gmail', email, chat.via, q.error) : connectionsHref('email', q), req.url))
    res.cookies.delete(STATE_COOKIE)
    return res
  }
  if (u.searchParams.get('error')) return back({ error: 'cancelled' })
  const code = u.searchParams.get('code')
  if (!code || (!chat && !verifyGmailState(state, email, nonce))) return back({ error: 'state' })
  if (await readOnlyRefusal(email)) return back({ error: 'readonly' })
  try {
    const r = await connectGmail(email, code, u.origin)
    // Reading was asked (allowlisted users: always from the chat, "Let Juno read" in Settings): say whether Google gave it.
    const wantRead = chat ? await gmailReadAllowed(email) : gmailStateWantsRead(state)
    if (chat) await announceConnected(email, 'gmail', chat.via, r.address, { canRead: r.canRead, canSend: r.canSend, canCal: r.canCal, calFull: r.calFull })
    // Calendar (20 Oct): asked on every connect; say whether it came (and the 5-calendar cap).
    const wantCal = chat ? true : gmailStateWantsCal(state)
    return back({ connected: r.address, ...(wantRead ? { read: r.canRead ? 'on' : 'denied' } : {}), ...(wantCal ? { cal: r.canCal ? 'on' : r.calFull ? 'full' : 'denied' } : {}) })
  } catch (e) {
    console.warn(`pen gmail connect: ${(e as Error).message}`)
    const codeOf = e instanceof GmailError && (e.code === 'not_granted' || e.code === 'too_many') ? e.code : null
    return back({ error: codeOf ?? (e as Error).message.slice(0, 200) })
  }
}
