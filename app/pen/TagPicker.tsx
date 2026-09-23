'use client'

// The @ picker, shared by the header search and the chat composer.
//
// Typing "@" offers people and recordings. Choosing one writes a short label into the text
// ("@Recruiter…", ten characters) rather than the whole title, so a question that tags two
// long recordings still reads as a question. Which recording or person each label means is
// held alongside the text, because a label is not unique and the text is.

import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Mention } from '@/lib/pen/store'
import Icon from './Icon'

export type Taggable = { id: string; kind: 'recording' | 'person'; title: string; sub: string }

/** Characters of a title shown in the text before it is cut with an ellipsis. */
export const LABEL_CHARS = 10
const PEOPLE_MAX = 4
const RECORDINGS_MAX = 5

/**
 * "Recruiter screen: Investment…" becomes "Recruiter…". Grows a character at a time when the
 * short form is already in use by a different tag, so two tags never read the same.
 */
export function shortLabel(title: string, taken: Set<string>): string {
  const full = title.trim()
  for (let n = LABEL_CHARS; n < full.length; n++) {
    const l = `${full.slice(0, n).trimEnd()}…`
    if (!taken.has(l)) return l
  }
  return full
}

/**
 * The @-query right before the caret, if any. "@" has to start a word, so an email address
 * never opens the picker. Spaces are allowed because names and titles have them.
 */
function tagQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^@\n]{0,40})$/.exec(text.slice(0, caret))
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null
}

type Field = HTMLInputElement | HTMLTextAreaElement

export function useTagPicker(opts: {
  value: string
  setValue: (v: string) => void
  field: React.RefObject<Field | null>
  options: Taggable[]
}) {
  const { value, setValue, field, options } = opts
  const [picker, setPicker] = useState<{ start: number; query: string } | null>(null)
  const [pick, setPick] = useState(0)
  const [tags, setTags] = useState<Mention[]>([])

  const filter = useCallback(
    (query: string) => {
      const needle = query.trim().toLowerCase()
      const hit = (o: Taggable) => !needle || o.title.toLowerCase().includes(needle)
      return [
        ...options.filter((o) => o.kind === 'person' && hit(o)).slice(0, PEOPLE_MAX),
        ...options.filter((o) => o.kind === 'recording' && hit(o)).slice(0, RECORDINGS_MAX),
      ]
    },
    [options],
  )
  const matches = useMemo(() => (picker ? filter(picker.query) : []), [picker, filter])

  /** Call from onChange with the new text and caret. */
  const sync = useCallback(
    (text: string, caret: number) => {
      const t = tagQuery(text, caret)
      // No matches closes it, so a sentence that happens to follow an "@" is not held
      // hostage by an empty menu.
      setPicker(t && filter(t.query).length ? t : null)
      setPick(0)
    },
    [filter],
  )

  const choose = useCallback(
    (o: Taggable) => {
      if (!picker) return
      const el = field.current
      const caret = el?.selectionStart ?? value.length
      const existing = tags.find((t) => t.id === o.id)
      const label = existing?.label ?? shortLabel(o.title, new Set(tags.map((t) => t.label ?? '')))
      const insert = `@${label} `
      setValue(value.slice(0, picker.start) + insert + value.slice(caret))
      if (!existing) setTags((t) => [...t, { id: o.id, title: o.title, label, kind: o.kind }])
      setPicker(null)
      requestAnimationFrame(() => {
        if (!el) return
        const at = picker.start + insert.length
        el.focus()
        el.setSelectionRange(at, at)
      })
    },
    [picker, field, value, tags, setValue],
  )

  /** Call first in onKeyDown. True means the picker used the key and the caller should stop. */
  const onKey = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!picker || !matches.length) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setPick((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(matches[pick] ?? matches[0])
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setPicker(null)
        return true
      }
      return false
    },
    [picker, matches, pick, choose],
  )

  /** The tags still present in `text`, then a clean slate for the next question. */
  const take = useCallback(
    (text: string): Mention[] => {
      const live = tags.filter((t) => text.includes(`@${t.label ?? t.title}`))
      setTags([])
      setPicker(null)
      return live
    },
    [tags],
  )

  const close = useCallback(() => setPicker(null), [])
  const open = !!picker && matches.length > 0

  return { open, matches, pick, setPick, sync, choose, onKey, take, close, setTags }
}

/** The dropdown. Place it inside a positioned parent; `up` opens it above the field. */
export function TagMenu({
  open,
  matches,
  pick,
  setPick,
  choose,
  up = false,
}: {
  open: boolean
  matches: Taggable[]
  pick: number
  setPick: (i: number) => void
  choose: (o: Taggable) => void
  up?: boolean
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.ul
          className="pen-tagpick"
          data-up={up}
          role="listbox"
          aria-label="People and recordings"
          initial={{ opacity: 0, y: up ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: up ? 4 : -4 }}
          transition={{ duration: 0.12 }}
        >
          {matches.map((o, i) => (
            <li key={`${o.kind}-${o.id}`} role="option" aria-selected={i === pick}>
              {(i === 0 || matches[i - 1].kind !== o.kind) && (
                <div className="pen-tagpick-head">{o.kind === 'person' ? 'People' : 'Recordings'}</div>
              )}
              <button
                type="button"
                className="pen-tagpick-row"
                data-active={i === pick}
                // mousedown, so the pick lands before the field's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(o)
                }}
                onMouseEnter={() => setPick(i)}
              >
                <Icon name={o.kind === 'person' ? 'person' : 'recordings'} size={15} className="pen-tagpick-icon" />
                <span className="pen-tagpick-title">{o.title}</span>
                <span className="pen-tagpick-when">{o.sub}</span>
              </button>
            </li>
          ))}
        </motion.ul>
      )}
    </AnimatePresence>
  )
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Text with its @-tags drawn as chips. Recording chips open the recording. */
export function TaggedText({ text, mentions, onOpen }: { text: string; mentions: Mention[]; onOpen: (id: string) => void }) {
  if (!mentions.length) return <>{text}</>
  const shown = (m: Mention) => `@${m.label ?? m.title}`
  // Longest first, so "@Call with Ana" wins over "@Call" when both are tagged.
  const sorted = [...mentions].sort((a, b) => shown(b).length - shown(a).length)
  const re = new RegExp(`(${sorted.map((m) => escapeRe(shown(m))).join('|')})`, 'g')
  return (
    <>
      {text.split(re).map((part, i) => {
        const m = sorted.find((x) => shown(x) === part)
        if (!m) return <span key={i}>{part}</span>
        return m.kind === 'person' ? (
          <span key={i} className="pen-tag" data-kind="person" title={m.title}>
            {part}
          </span>
        ) : (
          <button key={i} type="button" className="pen-tag" onClick={() => onOpen(m.id)} title={`Open “${m.title}”`}>
            {part}
          </button>
        )
      })}
    </>
  )
}
