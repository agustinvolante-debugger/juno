'use client'

import { useId, useState } from 'react'

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string }

/** The newsletter box. Posts to /api/blog/subscribe, which adds the address to a Resend audience. */
export default function Newsletter({ from = 'blog' }: { from?: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const id = useId()

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setState({ kind: 'error', message: 'That address looks incomplete. Check it and try again.' })
      return
    }
    setState({ kind: 'sending' })
    try {
      const res = await fetch('/api/blog/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company: String(form.get('company') ?? ''), from }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Something went wrong on our side. Try again in a minute.')
      setState({ kind: 'done' })
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message })
    }
  }

  return (
    <section className="blog-news" aria-labelledby={`${id}-h`}>
      <div className="blog-news-copy">
        <h2 id={`${id}-h`} className="blog-news-h">New posts, in your inbox.</h2>
        <p className="blog-news-sub">One short email when we publish. No spam, unsubscribe in one click.</p>
      </div>
      {state.kind === 'done' ? (
        <p className="blog-news-done" role="status">
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.6 10.4 8 13.8l7-7.6" /></svg>
          You&rsquo;re on the list. See you in your inbox.
        </p>
      ) : (
        <form className="blog-news-form" onSubmit={submit} noValidate>
          <label htmlFor={`${id}-email`} className="bl-sr">Email address</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            aria-invalid={state.kind === 'error' || undefined}
            aria-describedby={state.kind === 'error' ? `${id}-err` : undefined}
            onInput={() => state.kind === 'error' && setState({ kind: 'idle' })}
          />
          {/* Honeypot: hidden from people, filled in by naive bots. */}
          <div className="blog-hp" aria-hidden>
            <label htmlFor={`${id}-company`}>Company</label>
            <input id={`${id}-company`} name="company" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <button type="submit" className="lpa-btn" disabled={state.kind === 'sending'}>
            {state.kind === 'sending' ? 'Subscribing…' : 'Subscribe'}
          </button>
          {state.kind === 'error' && <p id={`${id}-err`} className="blog-news-err" role="alert">{state.message}</p>}
        </form>
      )}
    </section>
  )
}
