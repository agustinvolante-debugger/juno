import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { announceConnected, connectedPage, readChatState } from '@/lib/pen/connect-link'
import { connect } from '@/lib/pen/notion'

export const dynamic = 'force-dynamic'

// Notion sends them back here with a code. Checked against the state cookie, swapped for a
// token, and the "Juno Pen notes" table made; then back to Settings → Notion.
//
// A connect started from the chat (lib/pen/connect-link.ts) has no session: its state is a
// signed "chat state" carrying the account, checked against the same cookie (holding its
// nonce). It lands on /pen/connected and Juno says "Connected ✓" in the chat.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const cookie = (await cookies()).get('juno_notion_state')?.value
  const chat = readChatState(u.searchParams.get('state'), 'notion', cookie)
  const email = chat?.email ?? (await authedEmail())
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  const back = async (q: string) => {
    const err = new URLSearchParams(q).get('error') ?? undefined
    const res = NextResponse.redirect(new URL(chat ? await connectedPage('notion', email, chat.via, err) : `/pen/settings/notion?${q}`, req.url))
    res.cookies.delete('juno_notion_state')
    return res
  }
  if (u.searchParams.get('error')) return back('error=cancelled')
  const code = u.searchParams.get('code')
  if (!code || (!chat && (!cookie || cookie !== u.searchParams.get('state')))) return back('error=state')
  if (chat && (await readOnlyRefusal(email))) return back('error=readonly')
  try {
    await connect(email, code, u.origin)
    if (chat) await announceConnected(email, 'notion', chat.via)
    return back('connected=1')
  } catch (e) {
    console.warn(`pen notion connect: ${(e as Error).message}`)
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`)
  }
}
