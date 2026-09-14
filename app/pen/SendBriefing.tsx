'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { postJson, errMessage } from '@/lib/pen/http'

// Feature 4 — one button, four states, localised. Never a page-level spinner: the work is
// scoped to this recording, so the feedback should be too.

const SPRING = { type: 'spring' as const, stiffness: 480, damping: 30 }

type State = 'idle' | 'sending' | 'sent' | 'failed'

const MAX_EXTRA = 5

export default function SendBriefing({
  sessionId,
  sentAt,
  onSent,
  disabled,
  selfEmail,
}: {
  sessionId: string
  sentAt: string | null
  onSent: (iso: string) => void
  disabled?: boolean
  /** Shown as the always-included recipient, so it is clear who gets it. */
  selfEmail?: string
}) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [extras, setExtras] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [sentTo, setSentTo] = useState<string[]>([])
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function addDraft() {
    // Accepts a pasted list as easily as a single address.
    const parts = draft.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!parts.length) return
    setExtras((prev) => Array.from(new Set([...prev, ...parts])).slice(0, MAX_EXTRA))
    setDraft('')
  }

  async function send() {
    if (state === 'sending') return
    // An address typed but not yet committed should still be included, rather than silently
    // dropped because the user pressed Send instead of Enter.
    const pending = draft.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
    const also = Array.from(new Set([...extras, ...pending])).slice(0, MAX_EXTRA)

    setError(null)
    setState('sending')
    try {
      const j = await postJson<{ briefing_sent_at?: string; to?: string[] }>('/api/pen/briefing', {
        id: sessionId,
        ...(also.length ? { also } : {}),
      })
      setState('sent')
      setSentTo(j.to ?? [])
      setOpen(false)
      setDraft('')
      onSent(j.briefing_sent_at ?? new Date().toISOString())
      window.setTimeout(() => setState('idle'), 3600)
    } catch (e) {
      setError(errMessage(e, 'Could not send the briefing.'))
      setState('failed')
      window.setTimeout(() => setState('idle'), 6000)
    }
  }

  const others = sentTo.length - 1
  const label =
    state === 'sending'
      ? 'Sending'
      : state === 'sent'
        ? others > 0
          ? `Sent to ${sentTo.length}`
          : 'Sent to you'
        : state === 'failed'
          ? 'Not sent'
          : 'Send briefing'

  return (
    <div className="relative flex items-center gap-1.5" ref={wrap}>
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

      {/* A popover rather than a permanent second field: the common case is a note to self,
          and an always-visible recipients box would imply otherwise. */}
      <button
        className="pen-brief-more"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        title="Also send to someone else"
      >
        {extras.length ? `+${extras.length}` : '+'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="pen-brief-pop"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={SPRING}
          >
            <div className="pen-label">Also send to</div>
            {selfEmail && (
              <p className="pen-brief-self">
                {selfEmail} <span>always included</span>
              </p>
            )}

            {extras.length > 0 && (
              <div className="pen-brief-chips">
                {extras.map((e) => (
                  <span key={e} className="pen-brief-chip">
                    {e}
                    <button onClick={() => setExtras((p) => p.filter((x) => x !== e))} aria-label={`Remove ${e}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                addDraft()
              }}
            >
              <input
                className="pen-brief-input"
                type="email"
                multiple
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={addDraft}
                placeholder={extras.length >= MAX_EXTRA ? `Limit ${MAX_EXTRA}` : 'name@company.com'}
                disabled={extras.length >= MAX_EXTRA}
              />
            </form>
            <p className="pen-brief-hint">
              Enter to add. Up to {MAX_EXTRA}. They receive the same briefing, and replies come back to you.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

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
