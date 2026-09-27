'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Utterance } from '@/lib/pen/store'
import { speakerName, type SpeakerMap } from '@/lib/pen/speakers'
import { useCopy, useLang } from './LangContext'
import { SPEAKER_WORD, type Copy } from '@/lib/pen/i18n'

const TE: Copy<{ head: string; notSaved: string; saving: string; saved: string }> = {
  en: { head: 'Transcript · click any line to correct it', notSaved: 'not saved', saving: 'saving…', saved: 'saved' },
  es: { head: 'Transcripción · haz clic en una línea para corregirla', notSaved: 'sin guardar', saving: 'guardando…', saved: 'guardado' },
  pt: { head: 'Transcrição · clique numa linha para corrigir', notSaved: 'não salvo', saving: 'salvando…', saved: 'salvo' },
}

// The transcript is editable, but corrections are stored as an OVERLAY keyed by utterance
// index rather than written over the original. AssemblyAI's output stays intact, so a bad
// edit is recoverable and we can always tell machine output from human correction.
export default function TranscriptEditor({
  utterances,
  edits,
  onEdit,
  saveState,
  speakerMap,
  translation,
}: {
  /** Names for the speaker labels, where known. */
  speakerMap?: SpeakerMap | null
  /** Shown under each line, read-only, when the user has switched the translation on. */
  translation?: string[] | null
  utterances: Utterance[]
  edits: Record<string, string>
  onEdit: (index: number, text: string) => void
  saveState: 'saved' | 'saving' | 'failed'
}) {
  const T = useCopy(TE)
  const lang = useLang()
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
        <span className="pen-label">{T.head}</span>
        <span className="pen-mono text-[13px]" style={{ color: saveState === 'failed' ? 'var(--bad)' : 'var(--faint)' }}>
          {saveState === 'failed' ? T.notSaved : saveState === 'saving' ? T.saving : T.saved}
        </span>
      </div>
      {utterances.map((u, i) => {
        const edited = typeof edits[String(i)] === 'string' && edits[String(i)] !== u.text
        return (
          <div key={i} className="pen-utt" data-edited={edited}>
            <div className="pen-label pen-spk-tag pt-0.5">{speakerName(speakerMap, u.speaker, { word: SPEAKER_WORD[lang] })}</div>
            <textarea
              ref={(el) => { refs.current[i] = el; autoGrow(el) }}
              className="pen-utt-input"
              rows={1}
              spellCheck
              value={edits[String(i)] ?? u.text}
              onChange={(e) => { onEdit(i, e.target.value); autoGrow(e.currentTarget) }}
            />
            {translation?.[i] ? <p className="pen-utt-tr">{translation[i]}</p> : null}
          </div>
        )
      })}
    </div>
  )
}
