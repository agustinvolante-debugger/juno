// Google-login gate for VC Constellation (vc.tryjunoapp.com).
// The NextAuth session cookie is scoped to .tryjunoapp.com (lib/auth.ts), so the
// static vc. frontend can call these APIs with credentials:'include'. Credentialed
// CORS forbids the wildcard origin — we echo the origin back for our own surfaces.
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, ALLOWED_EMAILS } from '@/lib/auth'

const ORIGIN_OK = /^https:\/\/([a-z0-9-]+\.)?tryjunoapp\.com$|^http:\/\/localhost(:\d+)?$/

export function vcCors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ORIGIN_OK.test(origin) ? origin : 'https://vc.tryjunoapp.com',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

// -> allowed email, or null when not signed in / not on the list.
// Dev bypass: local next dev has no production cookie domain — don't gate there.
export async function vcSessionEmail(): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') return 'dev@localhost'
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase() || ''
  return email && ALLOWED_EMAILS.includes(email) ? email : null
}
