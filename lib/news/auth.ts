import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Returns the signed-in email, or null. NextAuth's signIn callback already enforces
// the ALLOWED_EMAILS allowlist, so any valid session here is an authorized user.
export async function authedEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (session?.user?.email) return session.user.email
  // DEV-ONLY test identity so signed-in features can be built/verified without Google OAuth.
  // Hard-gated to non-production; never active on the deployed site.
  if (process.env.NODE_ENV !== 'production' && process.env.NEWS_DEV_EMAIL) {
    return process.env.NEWS_DEV_EMAIL
  }
  return null
}
