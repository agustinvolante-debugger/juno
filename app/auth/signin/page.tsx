'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SignInContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const denied = error === 'AccessDenied'

  if (denied) {
    return (
      <div className="min-h-screen bg-[#0c0c0b] flex items-center justify-center">
        <div className="bg-[#141412] border border-[#222220] rounded-xl p-10 w-full max-w-sm text-center">
          <div className="font-serif text-3xl text-[#f0ead2] mb-2">juno</div>
          <p className="text-[#8a8678] text-sm mb-6">Keyword-level CAC for B2B teams</p>
          <div className="bg-[#1a1a18] border border-[#2a2a28] rounded-lg p-4 mb-6">
            <p className="text-[#e09a30] text-sm font-medium mb-1">Access restricted</p>
            <p className="text-[#8a8678] text-xs">Juno is currently in private beta. Reach out to request access.</p>
          </div>
          <a
            href="mailto:agustinvolantesilva@gmail.com?subject=Juno%20access%20request"
            className="block w-full bg-[#c8f04a] text-[#0c0c0b] font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity mb-3 no-underline"
          >
            Request access
          </a>
          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="w-full bg-transparent text-[#8a8678] border border-[#2a2a28] py-3 px-6 rounded-lg hover:border-[#8a8678] hover:text-[#f0ead2] transition-all"
          >
            Try another account
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0c0c0b] flex items-center justify-center">
      <div className="bg-[#141412] border border-[#222220] rounded-xl p-10 w-full max-w-sm text-center">
        <div className="font-serif text-3xl text-[#f0ead2] mb-2">juno</div>
        <p className="text-[#8a8678] text-sm mb-8">Keyword-level CAC for B2B teams</p>
        <button
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          className="w-full bg-[#c8f04a] text-[#0c0c0b] font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity"
        >
          Continue with Google
        </button>
      </div>
    </div>
  )
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}
