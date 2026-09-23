'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ROLES } from '@/lib/pen/signup-fields'
import { postJson, errMessage } from '@/lib/pen/http'
import '../pen-theme.css'

type State = 'idle' | 'sending' | 'done'

export default function SignupPage() {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => firstField.current?.focus(), [])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (state === 'sending') return
    setError(null)
    setState('sending')
    const f = new FormData(e.currentTarget)
    try {
      const url = new URLSearchParams(window.location.search)
      const r = await postJson<{ checkoutUrl?: string | null }>('/api/pen/signup', {
        // Which plan and which offer, both carried in the link. A cold-email recipient arrives
        // on ?offer=posted-pen and gets the longer trial; someone who already owns a recorder
        // starts today and gets fourteen days.
        plan: url.get('plan') === 'annual' ? 'annual' : 'monthly',
        offer: url.get('offer') === 'own-recorder' ? 'own-recorder' : 'posted-pen',
        name: f.get('name'),
        email: f.get('email'),
        phone: f.get('phone'),
        role: f.get('role'),
        ship_line1: f.get('ship_line1'),
        ship_line2: f.get('ship_line2'),
        ship_city: f.get('ship_city'),
        ship_state: f.get('ship_state'),
        ship_postcode: f.get('ship_postcode'),
        ship_country: f.get('ship_country'),
        note: f.get('note'),
        company: f.get('company'), // honeypot
        elapsed: Date.now() - startedAt.current,
        source: url.get('from') ?? 'landing',
      })

      // Straight to Stripe, in the same sitting, while they are still willing. Taking the card
      // now is what makes a free recorder affordable — see lib/pen/stripe.
      if (r.checkoutUrl) {
        window.location.href = r.checkoutUrl
        return
      }
      setState('done')
    } catch (err) {
      setError(errMessage(err, 'Something went wrong. Try again.'))
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="pen-root">
        <main className="pen-su-wrap">
          <div className="pen-su-done">
            <div className="pen-su-tick" aria-hidden>&#10003;</div>
            <h1 className="pen-display text-[34px] leading-tight">You&rsquo;re on the list.</h1>
            <p className="mt-4 text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
              There&rsquo;s a confirmation in your inbox. We&rsquo;ll send a link to start your
              free trial, and get the recorder in the post.
            </p>
            <Link href="/pen" className="pen-lp-btn pen-lp-btn-ghost mt-8 inline-flex">Back to the site</Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="pen-root">
      <main className="pen-su-wrap">
        <header className="pen-su-head">
          <Link href="/pen" className="pen-su-back" aria-label="Back to Pen">
            <Image src="/juno_mark.png" alt="Juno" width={24} height={24} className="pen-mark" />
            <span aria-hidden>&larr;</span>
          </Link>
          <div className="pen-lp-eyebrow pen-su-eyebrow">Get started</div>
          <h1 className="pen-display pen-su-h1">Record the meeting. Read the write-up.</h1>
          <p className="mt-4 max-w-[52ch] text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
            Your plan includes a recorder, so we need somewhere to post it. Takes a minute.
          </p>
        </header>

        <form className="pen-su-form" onSubmit={submit} noValidate>
          {/* Hidden from people, irresistible to bots. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="pen-su-pot"
          />

          <div className="pen-su-grid">
            <label className="pen-su-field">
              <span className="pen-label">Your name</span>
              <input ref={firstField} name="name" required autoComplete="name" placeholder="Chris Dyas" />
            </label>

            <label className="pen-su-field">
              <span className="pen-label">Email</span>
              <input name="email" type="email" required autoComplete="email" placeholder="you@company.com" inputMode="email" />
            </label>

            <label className="pen-su-field">
              <span className="pen-label">Phone <em>optional</em></span>
              <input name="phone" type="tel" autoComplete="tel" placeholder="(305) 555 0142" inputMode="tel" />
            </label>

            <label className="pen-su-field">
              <span className="pen-label">What do you do</span>
              <select name="role" defaultValue="">
                <option value="" disabled>Choose one</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>

          <div className="pen-su-ship">
              <div className="pen-label pen-su-ship-head">Where to send the recorder</div>
              <div className="pen-su-grid">
                <label className="pen-su-field pen-su-wide">
                  <span className="pen-label">Street address</span>
                  <input name="ship_line1" required autoComplete="address-line1" placeholder="1200 Brickell Ave" />
                </label>
                <label className="pen-su-field pen-su-wide">
                  <span className="pen-label">Apartment, suite <em>optional</em></span>
                  <input name="ship_line2" autoComplete="address-line2" placeholder="Apt 4B" />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">City</span>
                  <input name="ship_city" required autoComplete="address-level2" placeholder="Miami" />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">State</span>
                  <input name="ship_state" autoComplete="address-level1" placeholder="FL" />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">ZIP / postcode</span>
                  <input name="ship_postcode" required autoComplete="postal-code" placeholder="33131" inputMode="numeric" />
                </label>
                <label className="pen-su-field">
                  <span className="pen-label">Country</span>
                  <input name="ship_country" autoComplete="country-name" defaultValue="United States" />
                </label>
              </div>
          </div>

          <label className="pen-su-field pen-su-wide">
            <span className="pen-label">Anything we should know <em>optional</em></span>
            <textarea name="note" rows={3} placeholder="What you'd want it for, or what you've tried before." />
          </label>

          {error && <div className="pen-su-err" role="alert">{error}</div>}

          <button className="pen-lp-btn pen-lp-btn-primary pen-su-submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Get started'}
          </button>

          <p className="pen-su-fine">
            We use this to set up your account and post your recorder. Nothing else.
          </p>
        </form>
      </main>
    </div>
  )
}
