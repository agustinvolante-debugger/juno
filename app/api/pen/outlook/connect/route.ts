import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { connectionsHref } from '@/lib/pen/settings-paths'
import { authedEmail } from '@/lib/news/auth'
import { readOnlyRefusal } from '@/lib/pen/access'
import { OUTLOOK_COOKIE, listOutlookAccounts, outlookAuthorizeUrl, outlookAvailable, outlookState } from '@/lib/pen/outlook'

export const dynamic = 'force-dynamic'

// Settings → Connections → "Connect an Outlook account": off to Microsoft's sign-in (work, school
// or personal account, any of them, not the Juno login). Comes back to /api/pen/outlook/callback.
//
// Every connect asks for the calendar AND sending (Microsoft's screen is all or nothing).
// ?address=x&add=cal|send — "Add calendar" / "Send email from it" on an address already connected:
// what it does now plus the new ability, that address preselected. ?only=cal — a calendar-only account.
export async function GET(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.redirect(new URL('/pen', req.url))
  if (!(await outlookAvailable())) return NextResponse.redirect(new URL(connectionsHref('outlook', 'error=setup'), req.url))
  if (await readOnlyRefusal(email)) return NextResponse.redirect(new URL(connectionsHref('outlook', 'error=readonly'), req.url))
  const u = new URL(req.url)
  const raw = (u.searchParams.get('address') ?? '').trim().toLowerCase()
  const hint = /^[^\s@]+@[^\s@]+$/.test(raw) ? raw : null
  const had = hint ? (await listOutlookAccounts(email).catch(() => [])).find((a) => a.address === hint) ?? null : null
  const add = u.searchParams.get('add')
  const want = had
    ? { cal: had.can_cal || add === 'cal' || !had.can_send, send: had.can_send || add === 'send' }
    : u.searchParams.get('only') === 'cal' ? { cal: true, send: false } : { cal: true, send: true }
  const nonce = crypto.randomBytes(16).toString('hex')
  const res = NextResponse.redirect(outlookAuthorizeUrl(outlookState(email, nonce, want), u.origin, { ...want, hint }))
  res.cookies.set(OUTLOOK_COOKIE, nonce, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: u.origin.startsWith('https') })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
