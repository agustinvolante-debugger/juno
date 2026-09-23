'use client'

// "Who was this call?" at upload: pick people you already have, or add a new name.
//
// Same shape as the Send briefing recipients box: chosen people sit as chips, the field below
// narrows a dropdown of existing contacts as you type, and Enter on a name nobody has yet
// adds it as someone new. Leaving it empty is fine; the notes will suggest who they heard.

import { useMemo, useRef, useState } from 'react'
import type { PersonCard } from '@/lib/pen/people'

/** An existing contact carries its id; someone new is only a name until the upload creates them. */
export type Picked = { id?: string; name: string }

const MAX_SHOWN = 6

export default function PeoplePicker({
  people,
  value,
  onChange,
}: {
  people: PersonCard[]
  value: Picked[]
  onChange: (v: Picked[]) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const chosen = new Set(value.map((p) => (p.id ?? p.name).toLowerCase()))
  const needle = q.trim().toLowerCase()
  const matches = useMemo(
    () =>
      people
        .filter((p) => !chosen.has(p.id.toLowerCase()) && (!needle || p.name.toLowerCase().includes(needle) || p.email?.toLowerCase().includes(needle)))
        .slice(0, MAX_SHOWN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, needle, value],
  )
  // Offer "Add ..." only when the typed name is not already a contact.
  const exact = people.some((p) => p.name.toLowerCase() === needle)
  const canAdd = !!needle && !exact && !chosen.has(needle)
  const rows = matches.length + (canAdd ? 1 : 0)

  const pick = (p: Picked) => {
    onChange([...value, p])
    setQ('')
    setActive(0)
    input.current?.focus()
  }
  const addTyped = () => canAdd && pick({ name: q.trim().replace(/\s+/g, ' ') })
  const choose = (i: number) => (i < matches.length ? pick({ id: matches[i].id, name: matches[i].name }) : addTyped())

  return (
    <div className="pen-pick">
      {value.length > 0 && (
        <div className="pen-pick-chips">
          {value.map((p) => (
            <span key={p.id ?? p.name} className="pen-pick-chip" data-new={!p.id}>
              {p.name}
              {!p.id && <span className="pen-pick-new">new</span>}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((x) => x !== p))}>
                <svg viewBox="0 0 20 20" aria-hidden><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="pen-pick-field">
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && rows) {
              e.preventDefault()
              setActive((i) => (i + 1) % rows)
            } else if (e.key === 'ArrowUp' && rows) {
              e.preventDefault()
              setActive((i) => (i + rows - 1) % rows)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (rows) choose(Math.min(active, rows - 1))
            } else if (e.key === 'Backspace' && !q && value.length) {
              onChange(value.slice(0, -1))
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder={value.length ? 'Add someone else' : people.length ? 'Start typing a name' : 'Type a name'}
          aria-label="Who was on this call"
          aria-autocomplete="list"
          aria-expanded={open && rows > 0}
          className="pen-pick-input"
        />
        <button type="button" className="pen-btn pen-pick-add" disabled={!canAdd} onClick={addTyped}>
          Add person
        </button>

        {open && rows > 0 && (
          <ul className="pen-pick-menu" role="listbox">
            {matches.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  data-active={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(i)
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="pen-pick-name">{p.name}</span>
                  <span className="pen-pick-sub">
                    {[p.about || p.role, `${p.recordings} ${p.recordings === 1 ? 'call' : 'calls'}`].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
            {canAdd && (
              <li role="option" aria-selected={active === matches.length}>
                <button
                  type="button"
                  data-active={active === matches.length}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    addTyped()
                  }}
                  onMouseEnter={() => setActive(matches.length)}
                >
                  <span className="pen-pick-name">{`Add “${q.trim()}”`}</span>
                  <span className="pen-pick-sub">new person</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
