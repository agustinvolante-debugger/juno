import { NextResponse } from 'next/server'
import { requestLink } from '@/lib/auth-link'
import { safeCallback } from '@/lib/safe-callback'

export const dynamic = 'force-dynamic'

// "Email me a sign-in link" (lib/auth-link.ts). Always the same answer, whether or not a link
// was sent, so it can't be used to learn who has an account.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; callbackUrl?: string; lang?: string }
  const origin = new URL(req.url).origin
  const lang = b.lang === 'es' || b.lang === 'pt' ? b.lang : 'en'
  // A path here or a tryjunoapp.com address (news., vc.); the NextAuth redirect callback checks again.
  const cb = safeCallback(b.callbackUrl)
  try {
    await requestLink({ email: String(b.email ?? ''), callbackUrl: cb, origin, lang })
  } catch (e) {
    console.warn(`auth-link: ${(e as Error).message}`)
  }
  return NextResponse.json({ ok: true })
}
