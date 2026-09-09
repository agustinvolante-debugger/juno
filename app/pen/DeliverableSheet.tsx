'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Deliverable } from '@/lib/pen/store'

// Apple-sheet presentation: rises from the bottom, backdrop blurs, Escape or a tap outside
// dismisses. Anchored low rather than centred because it is a response to something you
// clicked further up the page — the note stays visible behind it.

const SPRING = { type: 'spring' as const, stiffness: 340, damping: 32, mass: 0.9 }

const KIND_LABEL: Record<Deliverable['kind'], string> = {
  email: 'Draft email',
  memo: 'Memo',
  tracker: 'Tracker entry',
}

export type SheetRequest = { kind: Deliverable['kind']; item: string }

export default function DeliverableSheet({
  request,
  sessionId,
  onClose,
}: {
  request: SheetRequest | null
  sessionId: string
  onClose: () => void
}) {
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && request) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request, onClose])

  useEffect(() => {
    if (!request) {
      setDeliverable(null)
      setError(null)
      setCopied(false)
      setDraft('')
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    setDeliverable(null)
    fetch('/api/pen/deliverable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId, kind: request.kind, item: request.item }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'could not draft that')
        return r.json()
      })
      .then((j: { deliverable: Deliverable }) => {
        if (!alive) return
        setDeliverable(j.deliverable)
        setDraft(j.deliverable.body)
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.kind, request?.item, sessionId])

  async function copy() {
    if (await writeClipboard(draft)) {
      setError(null)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      setError('Copying is blocked here — select the text and copy it manually.')
    }
  }

  return (
    <AnimatePresence>
      {request && (
        <>
          <motion.div
            className="pen-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <div className="pen-sheet-wrap">
            <motion.div
              className="pen-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={KIND_LABEL[request.kind]}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={SPRING}
            >
              <div className="pen-sheet-grip" />

              <div className="pen-sheet-head">
                <div className="min-w-0">
                  <div className="pen-label">{KIND_LABEL[request.kind]}</div>
                  <div className="pen-sheet-title">
                    {loading ? 'Drafting…' : (deliverable?.title ?? 'Couldn’t draft this')}
                  </div>
                </div>
                <button className="pen-sheet-x" onClick={onClose} aria-label="Close">
                  ×
                </button>
              </div>

              <div className="pen-sheet-body">
                <p className="pen-sheet-ref">From: “{request.item}”</p>

                {loading && (
                  <div className="pen-sheet-skeleton">
                    {[92, 78, 96, 61, 84, 44].map((w, i) => (
                      <motion.span
                        key={i}
                        style={{ width: `${w}%` }}
                        initial={{ opacity: 0.3 }}
                        animate={{ opacity: [0.3, 0.62, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.09 }}
                      />
                    ))}
                  </div>
                )}

                {error && (
                  <p className="text-[13px]" style={{ color: 'var(--bad)' }}>
                    {error}
                  </p>
                )}

                {deliverable && !loading && (
                  <motion.textarea
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="pen-sheet-text"
                    value={draft}
                    spellCheck
                    onChange={(e) => setDraft(e.target.value)}
                  />
                )}
              </div>

              <div className="pen-sheet-foot">
                <span className="pen-mono text-[10px]" style={{ color: 'var(--faint)' }}>
                  {deliverable ? 'Edit it before you send — it’s a draft, not a decision.' : ''}
                </span>
                <motion.button
                  className="pen-copy"
                  data-done={copied}
                  onClick={copy}
                  disabled={!deliverable || loading}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING}
                >
                  <span className="pen-copy-icon">
                    <AnimatePresence mode="wait" initial={false}>
                      {copied ? (
                        <motion.svg
                          key="tick"
                          viewBox="0 0 20 20"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 620, damping: 24 }}
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
                            transition={{ duration: 0.28, ease: 'easeOut' }}
                          />
                        </motion.svg>
                      ) : (
                        <motion.svg
                          key="box"
                          viewBox="0 0 20 20"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 620, damping: 24 }}
                        >
                          <rect x="6.5" y="6.5" width="10" height="10" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                          <path d="M13.2 4H5.2A1.2 1.2 0 0 0 4 5.2v8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </motion.svg>
                      )}
                    </AnimatePresence>
                  </span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? 'copied' : 'copy'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * navigator.clipboard needs a secure context AND permission, and is missing or blocked in
 * several in-app browsers and older Safari. Fall back to the execCommand trick so Copy works
 * everywhere rather than only on the happy path.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // Off-screen but still focusable — display:none would make the selection fail.
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** The hover row that appears beside an action or takeaway. */
export function DeliverableActions({ onPick }: { onPick: (kind: Deliverable['kind']) => void }) {
  const opts: { kind: Deliverable['kind']; label: string }[] = [
    { kind: 'email', label: 'Draft email' },
    { kind: 'memo', label: 'Memo' },
    { kind: 'tracker', label: 'Tracker' },
  ]
  return (
    <div className="pen-do">
      {opts.map((o) => (
        <button key={o.kind} className="pen-do-btn" onClick={() => onPick(o.kind)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
