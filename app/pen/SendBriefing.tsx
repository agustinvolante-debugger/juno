'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

// Feature 4 — one button, four states, localised. Never a page-level spinner: the work is
// scoped to this recording, so the feedback should be too.

const SPRING = { type: 'spring' as const, stiffness: 480, damping: 30 }

type State = 'idle' | 'sending' | 'sent' | 'failed'

export default function SendBriefing({
  sessionId,
  sentAt,
  onSent,
  disabled,
}: {
  sessionId: string
  sentAt: string | null
  onSent: (iso: string) => void
  disabled?: boolean
}) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (state === 'sending') return
    setError(null)
    setState('sending')
    try {
      const r = await fetch('/api/pen/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'could not send the briefing')
      setState('sent')
      onSent(j.briefing_sent_at ?? new Date().toISOString())
      window.setTimeout(() => setState('idle'), 3200)
    } catch (e) {
      setError((e as Error).message)
      setState('failed')
      window.setTimeout(() => setState('idle'), 4000)
    }
  }

  const label =
    state === 'sending' ? 'Sending' : state === 'sent' ? 'Sent to you' : state === 'failed' ? 'Not sent' : 'Send briefing'

  return (
    <div className="relative">
      <motion.button
        className="pen-brief"
        data-state={state}
        onClick={send}
        disabled={disabled || state === 'sending'}
        whileTap={{ scale: 0.97 }}
        transition={SPRING}
        title={
          disabled
            ? 'Write the notes first — there is nothing to brief yet'
            : sentAt
              ? `Last sent ${new Date(sentAt).toLocaleString()}`
              : 'Email yourself the summary, what you missed, and what is still open'
        }
      >
        <span className="pen-brief-icon">
          <AnimatePresence mode="wait" initial={false}>
            {state === 'sending' ? (
              <motion.span
                key="spin"
                className="pen-spin"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={SPRING}
              />
            ) : state === 'sent' ? (
              <motion.svg
                key="tick"
                viewBox="0 0 20 20"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 640, damping: 22 }}
              >
                <motion.path
                  d="M4 10.5 L8 14.5 L16 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </motion.svg>
            ) : (
              <motion.svg
                key="mail"
                viewBox="0 0 20 20"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={SPRING}
              >
                <rect x="2.6" y="4.8" width="14.8" height="10.4" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3.4 6.2 L10 11 L16.6 6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {error && state === 'failed' && (
          <motion.div
            className="pen-brief-err"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
