'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { NoteBlock } from '@/lib/pen/store'

// Jot and Enhance.
//
// Provenance is per BLOCK, not per character, which is the decision that makes the whole thing
// tractable: each paragraph is its own borderless textarea, so editing is ordinary controlled
// state — no contenteditable, no selection or paste or IME edge cases.
//
// Black  = you wrote it.
// Grey   = a machine wrote it and you have not endorsed it yet.
// Editing a grey block promotes it to black, because once you have corrected a line you own it.

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.7 }

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/** Legacy plain-text notes become blocks on first edit, so nothing typed before is lost. */
export function blocksFrom(existing: NoteBlock[] | undefined, legacy: string | null): NoteBlock[] {
  if (existing?.length) return existing
  const paras = (legacy ?? '').split(/\n{2,}|\n/).map((t) => t.trim()).filter(Boolean)
  if (!paras.length) return [{ id: uid(), text: '', source: 'user' }]
  return paras.map((text) => ({ id: uid(), text, source: 'user' }))
}

export default function NoteEditor({
  sessionId,
  blocks,
  onChange,
  saveState,
  canEnhance,
}: {
  sessionId: string
  blocks: NoteBlock[]
  onChange: (next: NoteBlock[]) => void
  saveState: 'saved' | 'saving' | 'failed'
  canEnhance: boolean
}) {
  const [enhancing, setEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealing, setRevealing] = useState<Set<string>>(new Set())
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const focusNext = useRef<string | null>(null)

  const hasUserText = useMemo(() => blocks.some((b) => b.source === 'user' && b.text.trim()), [blocks])

  /* --------------------------------------------------------------- sizing */

  const autoGrow = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    for (const b of blocks) autoGrow(refs.current[b.id])
  }, [blocks, autoGrow])

  // Focus a block created by Enter, after it has rendered.
  useEffect(() => {
    if (!focusNext.current) return
    const el = refs.current[focusNext.current]
    focusNext.current = null
    el?.focus()
  }, [blocks])

  /* ---------------------------------------------------------------- edits */

  function setText(id: string, text: string) {
    onChange(
      blocks.map((b) =>
        b.id === id
          ? // Editing machine text is an act of endorsement, so it becomes yours.
            { ...b, text, source: b.source === 'ai' ? ('user' as const) : b.source }
          : b,
      ),
    )
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, id: string, i: number) {
    const el = e.currentTarget

    // Enter splits the paragraph at the caret and always yields a black block.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const before = el.value.slice(0, el.selectionStart)
      const after = el.value.slice(el.selectionStart)
      const newId = uid()
      const next = [...blocks]
      next[i] = { ...next[i], text: before, source: next[i].source === 'ai' ? 'user' : next[i].source }
      next.splice(i + 1, 0, { id: newId, text: after, source: 'user' })
      focusNext.current = newId
      onChange(next)
      return
    }

    // Backspace at the very start merges into the block above, the way a document behaves.
    if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && i > 0) {
      e.preventDefault()
      const prev = blocks[i - 1]
      const next = [...blocks]
      next[i - 1] = { ...prev, text: prev.text + el.value, source: prev.source === 'ai' ? 'user' : prev.source }
      next.splice(i, 1)
      focusNext.current = prev.id
      onChange(next)
      // Caret lands where the join happened.
      requestAnimationFrame(() => {
        const p = refs.current[prev.id]
        if (p) p.setSelectionRange(prev.text.length, prev.text.length)
      })
    }
  }

  /* -------------------------------------------------------------- enhance */

  async function enhance() {
    setError(null)
    setEnhancing(true)
    try {
      const r = await fetch('/api/pen/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, blocks }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'could not enhance')
      const { expansions } = (await r.json()) as { expansions: Record<string, string> }

      if (!Object.keys(expansions).length) {
        setError('Nothing in the recording backed up those notes, so nothing was added.')
        return
      }

      // Insert each expansion directly beneath the note it belongs to. Replaces a previous
      // expansion for the same note rather than stacking them up on repeated presses.
      const fresh = new Set<string>()
      const next: NoteBlock[] = []
      for (const b of blocks) {
        if (b.source === 'ai' && expansions[b.id.replace(/^ai-/, '')] !== undefined) continue
        next.push(b)
        const exp = expansions[b.id]
        if (b.source === 'user' && exp) {
          const id = `ai-${b.id}`
          next.push({ id, text: exp, source: 'ai' })
          fresh.add(id)
        }
      }
      setRevealing(fresh)
      onChange(next)
      // Word-by-word reveal is a one-off; afterwards the block is an ordinary editable field.
      window.setTimeout(() => setRevealing(new Set()), 2600)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnhancing(false)
    }
  }

  /* ----------------------------------------------------------------- view */

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="pen-label">Your notes</span>
        <div className="flex items-center gap-3">
          {/* Never claim a save that did not happen. A failed write is loud. */}
          <span
            className="pen-mono text-[10px] tabular-nums"
            style={{ color: saveState === 'failed' ? 'var(--bad)' : 'var(--faint)' }}
            title={saveState === 'failed' ? 'The last save failed — your text is still here but is not stored yet' : undefined}
          >
            {saveState === 'failed' ? 'not saved' : saveState === 'saving' ? 'saving…' : 'saved'}
          </span>
          {canEnhance && (
            <motion.button
              onClick={enhance}
              disabled={enhancing || !hasUserText}
              whileTap={{ scale: 0.97 }}
              transition={SPRING}
              className="pen-enhance"
              title={hasUserText ? 'Expand your shorthand using the recording' : 'Write a note first'}
            >
              <AnimatePresence mode="wait" initial={false}>
                {enhancing ? (
                  <motion.span key="w" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Enhancing<span className="pen-dots ml-1"><span /><span /><span /></span>
                  </motion.span>
                ) : (
                  <motion.span key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Enhance
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}
        </div>
      </div>

      <div className="pen-blocks">
        <AnimatePresence initial={false}>
          {blocks.map((b, i) => (
            <motion.div
              key={b.id}
              layout
              initial={b.source === 'ai' ? { opacity: 0, y: -6 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
              transition={SPRING}
              className="pen-block"
              data-source={b.source}
            >
              {revealing.has(b.id) ? (
                <TypeReveal text={b.text} />
              ) : (
                <textarea
                  ref={(el) => {
                    refs.current[b.id] = el
                    autoGrow(el)
                  }}
                  value={b.text}
                  rows={1}
                  spellCheck
                  onChange={(e) => {
                    setText(b.id, e.target.value)
                    autoGrow(e.currentTarget)
                  }}
                  onKeyDown={(e) => onKeyDown(e, b.id, i)}
                  placeholder={
                    i === 0 && blocks.length === 1
                      ? 'Jot it down however you like — “kitchen big win, price still an issue”. Then press Enhance.'
                      : undefined
                  }
                  className="pen-block-input"
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className="mt-2 text-[12.5px]"
            style={{ color: 'var(--warn)' }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {blocks.some((b) => b.source === 'ai') && (
        <p className="pen-mono mt-3 text-[10px]" style={{ color: 'var(--faint)' }}>
          Grey text was written from the recording. Click it to edit — it turns black once you do.
        </p>
      )}
    </div>
  )
}

/** Word-by-word arrival. Reads as typing without the cost of a per-character timer. */
function TypeReveal({ text }: { text: string }) {
  const words = useMemo(() => text.split(/(\s+)/), [text])
  return (
    <p className="pen-block-input pen-block-reveal" aria-label={text}>
      {words.map((w, i) =>
        /^\s+$/.test(w) ? (
          w
        ) : (
          <motion.span
            key={i}
            initial={{ opacity: 0, filter: 'blur(3px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ ...SPRING, delay: Math.min(i * 0.018, 1.6) }}
            style={{ display: 'inline-block' }}
          >
            {w}
          </motion.span>
        ),
      )}
    </p>
  )
}
