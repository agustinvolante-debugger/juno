import { NextResponse } from 'next/server'
import { requestLink } from '@/lib/auth-link'

export const dynamic = 'force-dynamic'

// "Email me a sign-in link" (lib/auth-link.ts). Always the same answer, whether or not a link
// was sent, so it can't be used to learn who has an account.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; callbackUrl?: string; lang?: string }
  const origin = new URL(req.url).origin
  const lang = b.lang === 'es' || b.lang === 'pt' ? b.lang : 'en'
  // Relative paths only; the NextAuth redirect callback restricts where it can go after that.
  const cb = typeof b.callbackUrl === 'string' && b.callbackUrl.startsWith('/') && !b.callbackUrl.startsWith('//') ? b.callbackUrl : '/pen'
  try {
    await requestLink({ email: String(b.email ?? ''), callbackUrl: cb, origin, lang })
  } catch (e) {
    console.warn(`auth-link: ${(e as Error).message}`)
  }
  return NextResponse.json({ ok: true })
}
