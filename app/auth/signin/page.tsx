'use client'

import { signIn } from 'next-auth/react'

export default function SignIn() {
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
