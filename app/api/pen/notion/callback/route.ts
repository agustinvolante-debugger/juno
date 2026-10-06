import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { connect } from '@/lib/pen/notion'

export const dynamic = 'force-dynamic'

// Notion sends them back here with a code. Checked against the state cookie, swapped for a
// token, and the "Juno Pen notes" table made; then back to Settings → Notion.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/pen/settings/notion?${q}`, req.url))
    res.cookies.delete('juno_notion_state')
    return res
  }
  const email = await authedEmail()
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (u.searchParams.get('error')) return back('error=cancelled')
  const state = (await cookies()).get('juno_notion_state')?.value
  const code = u.searchParams.get('code')
  if (!code || !state || state !== u.searchParams.get('state')) return back('error=state')
  try {
    await connect(email, code, u.origin)
    return back('connected=1')
  } catch (e) {
    console.warn(`pen notion connect: ${(e as Error).message}`)
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`)
  }
}
