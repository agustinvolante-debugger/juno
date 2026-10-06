import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { authorizeUrl, notionConfigured } from '@/lib/pen/notion'

export const dynamic = 'force-dynamic'

// Settings → Notion → Connect: off to Notion's own page picker, with a state cookie so the
// callback only accepts the answer to a request this browser made.
export async function GET(req: Request) {
  const email = await authedEmail()
  const origin = new URL(req.url).origin
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (!notionConfigured()) return NextResponse.redirect(new URL('/pen/settings/notion?error=setup', req.url))
  const state = crypto.randomBytes(16).toString('hex')
  const res = NextResponse.redirect(authorizeUrl(origin, state))
  res.cookies.set('juno_notion_state', state, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: origin.startsWith('https') })
  return res
}
