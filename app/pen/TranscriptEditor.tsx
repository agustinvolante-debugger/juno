'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Utterance } from '@/lib/pen/store'

// The transcript is editable, but corrections are stored as an OVERLAY keyed by utterance
// index rather than written over the original. AssemblyAI's output stays intact, so a bad
// edit is recoverable and we can always tell machine output from human correction.
export default function TranscriptEditor({
  utterances,
  edits,
  onEdit,
  saveState,
}: {
  utterances: Utterance[]
  edits: Record<string, string>
  onEdit: (index: number, text: string) => void
  saveState: 'saved' | 'saving' | 'failed'
}) {
  const refs = useRef<Record<number, HTMLTextAreaElement | null>>({})

  const autoGrow = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    Object.values(refs.current).forEach(autoGrow)
  }, [utterances, edits, autoGrow])

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="pen-label">Transcript · click any line to correct it</span>
        <span className="pen-mono text-[10px]" style={{ color: saveState === 'failed' ? 'var(--bad)' : 'var(--faint)' }}>
          {saveState === 'failed' ? 'not saved' : saveState === 'saving' ? 'saving…' : 'saved'}
        </span>
      </div>
      {utterances.map((u, i) => {
        const edited = typeof edits[String(i)] === 'string' && edits[String(i)] !== u.text
        return (
          <div key={i} className="pen-utt" data-edited={edited}>
            <div className="pen-label pen-spk-tag pt-0.5">Speaker {u.speaker}</div>
            <textarea
              ref={(el) => { refs.current[i] = el; autoGrow(el) }}
              className="pen-utt-input"
              rows={1}
              spellCheck
              value={edits[String(i)] ?? u.text}
              onChange={(e) => { onEdit(i, e.target.value); autoGrow(e.currentTarget) }}
            />
          </div>
        )
      })}
    </div>
  )
}
