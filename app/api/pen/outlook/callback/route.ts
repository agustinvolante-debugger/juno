import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authedEmail } from '@/lib/news/auth'
import { OUTLOOK_COOKIE } from '@/lib/pen/outlook'
import { handleOutlookCallback } from '@/lib/pen/outlook-callback'

export const dynamic = 'force-dynamic'

// Microsoft sends them back here (the redirect URI registered in Entra: www and localhost:3100).
// What it does is lib/pen/outlook-callback.ts: website or chat connect, an IT admin's approval,
// and the "your IT admin has to approve Juno Pen" path for locked-down Microsoft 365 tenants.
export async function GET(req: Request) {
  const nonce = (await cookies()).get(OUTLOOK_COOKIE)?.value
  const r = await handleOutlookCallback(req.url, { nonce, sessionEmail: authedEmail, acceptLanguage: req.headers.get('accept-language') })
  if ('page' in r) return r.page
  const res = NextResponse.redirect(new URL(r.redirect, req.url))
  if (r.clearCookie) res.cookies.delete(OUTLOOK_COOKIE)
  return res
}
