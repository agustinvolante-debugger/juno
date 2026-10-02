import { NextResponse } from 'next/server'
import { REF_COOKIE, REF_DAYS, cleanCode, referrerFor } from '@/lib/pen/referrals'

export const dynamic = 'force-dynamic'

// A customer's referral link: tryjunoapp.com/r/diane. Remembers who sent them for 60 days and
// lands on the home page, which says who invited them (app/pen/page.tsx). An unknown code
// still lands on the home page, just without the invitation.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code)
  const ok = code ? await referrerFor(code).catch(() => null) : null
  // The live site serves Pen at its root; anywhere else (localhost, previews) it's /pen.
  const host = new URL(req.url).hostname
  const url = new URL(host === 'tryjunoapp.com' || host === 'www.tryjunoapp.com' ? '/' : '/pen', req.url)
  for (const k of ['m', 'for']) {
    const v = new URL(req.url).searchParams.get(k)
    if (v) url.searchParams.set(k, v)
  }
  const res = NextResponse.redirect(url, 302)
  if (code && ok) res.cookies.set(REF_COOKIE, code, { path: '/', maxAge: REF_DAYS * 86400, sameSite: 'lax', httpOnly: true })
  return res
}
