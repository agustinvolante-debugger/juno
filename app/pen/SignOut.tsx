'use client'

import { signOut } from 'next-auth/react'
import { useState } from 'react'

/**
 * Sign out, back to the landing page.
 *
 * The callback URL is computed at click time rather than hardcoded, because the landing page
 * lives at a different path depending on the host: `/` on pen.tryjunoapp.com (proxy.ts
 * rewrites that root to /pen) but `/pen` on the main domain. A fixed '/' would drop someone
 * on tryjunoapp.com's marketing site instead of Pen's.
 *
 * `lib/auth.ts`'s redirect callback already allows any *.tryjunoapp.com host and localhost,
 * so an absolute URL is accepted.
 */
function landingUrl(): string {
  if (typeof window === 'undefined') return '/pen'
  const { origin, hostname } = window.location
  return hostname.startsWith('pen.') ? `${origin}/` : `${origin}/pen`
}

export default function SignOut({ email }: { email: string }) {
  const [going, setGoing] = useState(false)

  return (
    <span className="pen-acct">
      {/* Shown because the same browser can be signed into more than one account, and it is
          not otherwise visible anywhere which one you are looking at. */}
      <span className="pen-acct-email" title={email}>{email}</span>
      <button
        className="pen-acct-out"
        disabled={going}
        onClick={() => {
          setGoing(true)
          void signOut({ callbackUrl: landingUrl() })
        }}
      >
        {going ? 'Signing out…' : 'Sign out'}
      </button>
    </span>
  )
}
