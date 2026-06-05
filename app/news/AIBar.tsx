'use client'
import { useState } from 'react'

export default function AIBar({ authed, signInHref = '/api/auth/signin' }: { authed: boolean; signInHref?: string }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  if (!authed) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-neutral-100 px-7 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <span>🔒 <b>Sign in for full access</b> — AI briefings, custom topics, set-up chat & video sections.</span>
        <a href={signInHref} className="rounded-md bg-neutral-900 px-3 py-1.5 font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">
          Sign in with Google
        </a>
      </div>
    )
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!q.trim()) return
        setBusy(true)
        try {
          await fetch('/api/news/topic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q.trim() }),
          })
        } finally {
          location.reload()
        }
      }}
      className="flex flex-wrap items-center gap-2 px-7 py-2.5"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Meeting in 15 min? Type a topic — NBA Finals, AI healthcare, a company…"
        className="min-w-[260px] flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm transition-colors placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950"
      />
      <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
        {busy ? 'Briefing…' : 'Brief me ▸'}
      </button>
    </form>
  )
}
