'use client'

// Who was on this recording.
//
// Three rows of the same idea: the people the user has put on it (with the email only they
// can supply, and a card the model writes from every call they share), the people the notes
// heard but nobody has added (one click each), and a form for anyone else.

import { useCallback, useEffect, useState } from 'react'
import type { PenNotes } from '@/lib/pen/store'
import type { PenPerson } from '@/lib/pen/people'
import { getJson, postJson, patchJson, del, errMessage } from '@/lib/pen/http'
import Icon from './Icon'

type Suggestion = { name: string; role: string | null; note: string | null }
type Loaded = { people: PenPerson[]; suggestions: Suggestion[] }

export default function PeoplePanel({
  sessionId,
  notes,
  status,
  onChanged,
}: {
  sessionId: string
  notes: PenNotes
  /** Reloads when the notes land, because that is when suggestions appear. */
  status: string
  /** Someone was added, edited or removed: refresh anything that lists people. */
  onChanged: () => void
}) {
  const [data, setData] = useState<Loaded | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [aboutNew, setAboutNew] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await getJson<Loaded>(`/api/pen/people?session=${sessionId}`))
      setErr(null)
    } catch (e) {
      setErr(errMessage(e, 'Could not load people.'))
    }
  }, [sessionId])
  useEffect(() => {
    setData(null)
    setAdding(false)
    setEditing(null)
    void load()
  }, [load, status])

  /** `ask` opens the new person's details straight away, for an AI suggestion just accepted. */
  async function add(n: string, e?: string, about?: string, ask = false) {
    setBusy(true)
    setErr(null)
    try {
      const next = await postJson<Loaded>('/api/pen/people', { sessionId, name: n, ...(e ? { email: e } : {}), ...(about ? { about } : {}) })
      setData(next)
      setName('')
      setEmail('')
      setAboutNew('')
      setAdding(false)
      if (ask) {
        const p = next.people.find((x) => x.name.toLowerCase() === n.toLowerCase())
        // Only when there is something to fill: a returning contact already has both.
        if (p && (!p.email || !p.about)) setEditing(p.id)
      }
      onChanged()
      // The card is written in the background; pick it up once it has had time.
      setTimeout(() => void load(), 6000)
    } catch (x) {
      setErr(errMessage(x, 'Could not add that person.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: PenPerson) {
    setErr(null)
    try {
      await del(`/api/pen/people/${p.id}?session=${sessionId}`)
      await load()
      onChanged()
    } catch (x) {
      setErr(errMessage(x, 'Could not remove them.'))
    }
  }

  async function save(p: PenPerson, patch: { name: string; email: string; about: string }) {
    setErr(null)
    try {
      await patchJson(`/api/pen/people/${p.id}`, patch)
      setEditing(null)
      await load()
      onChanged()
    } catch (x) {
      setErr(errMessage(x, 'Could not save.'))
    }
  }

  // Role-only entries ("the inspector") cannot be added as contacts, but they were in the
  // room, so they are still shown.
  const unnamed = (notes.people ?? []).filter((p) => !p.name?.trim() && p.role)

  return (
    <div className="pen-sec">
      <span className="pen-sec-head">
        <span className="pen-badge"><Icon name="people" size={13} /></span>People
      </span>

      {err && <p className="pen-people-err">{err}</p>}

      <div className="pen-people">
        {data?.people.map((p) =>
          editing === p.id ? (
            <EditRow key={p.id} person={p} onCancel={() => setEditing(null)} onSave={(patch) => save(p, patch)} />
          ) : (
            <div key={p.id} className="pen-person">
              <span className="pen-avatar">{initials(p.name)}</span>
              <div className="pen-person-body">
                <div className="pen-person-line">
                  <strong>{p.name}</strong>
                  {(p.role || p.company) && <span className="pen-person-meta">{[p.role, p.company].filter(Boolean).join(' · ')}</span>}
                </div>
                {p.about && <p className="pen-person-about">{p.about}</p>}
                {p.email ? (
                  <span className="pen-person-email">{p.email}</span>
                ) : (
                  <button type="button" className="pen-person-add-email" onClick={() => setEditing(p.id)}>Add email</button>
                )}
                {p.summary && (
                  <p className="pen-person-summary">
                    <span className="pen-person-ai">From your calls</span>
                    {p.summary}
                  </p>
                )}
              </div>
              <div className="pen-person-actions">
                <button type="button" onClick={() => setEditing(p.id)} aria-label={`Edit ${p.name}`} title="Edit">Edit</button>
                <button type="button" onClick={() => remove(p)} aria-label={`Remove ${p.name} from this recording`} title="Remove from this recording">
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ),
        )}
        {data && data.people.length === 0 && !data.suggestions.length && (
          <p className="pen-people-empty">Nobody added yet. Add who you spoke with, and ask about them later with @ in search.</p>
        )}
      </div>

      {!!data?.suggestions.length && (
        <div className="pen-people-sugg">
          <span className="pen-label">Detected on this call</span>
          <div className="pen-people-chips">
            {data.suggestions.map((s) => (
              <button key={s.name} type="button" className="pen-set-chip" disabled={busy} onClick={() => add(s.name, undefined, undefined, true)} title={s.note ?? `Add ${s.name}`}>
                {`+ ${s.name}${s.role ? ` · ${s.role}` : ''}`}
              </button>
            ))}
            {unnamed.map((p, i) => (
              <span key={`u${i}`} className="pen-people-unnamed" title={p.note}>{p.role}</span>
            ))}
          </div>
        </div>
      )}

      {adding ? (
        <form
          className="pen-people-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void add(name.trim(), email.trim() || undefined, aboutNew.trim() || undefined)
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" aria-label="Email" type="email" />
          <input className="pen-people-about-in" value={aboutNew} onChange={(e) => setAboutNew(e.target.value)} placeholder="Who they are to you, e.g. my realtor friend (optional)" aria-label="Who they are" maxLength={300} />
          <button type="submit" className="pen-btn pen-btn-accent" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add'}</button>
          <button type="button" className="pen-btn" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="pen-people-add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={15} />
          Add person
        </button>
      )}
    </div>
  )
}

function EditRow({ person, onSave, onCancel }: { person: PenPerson; onSave: (p: { name: string; email: string; about: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [about, setAbout] = useState(person.about ?? '')
  return (
    <form
      className="pen-people-form pen-people-edit"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSave({ name: name.trim(), email: email.trim(), about: about.trim() })
      }}
    >
      <p className="pen-people-edit-head">{`Tell Juno Pen about ${person.name.split(' ')[0]}`}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" />
      {/* Focus lands on the first thing still missing. */}
      <input autoFocus={!!person.email === false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" type="email" />
      <input
        className="pen-people-about-in"
        autoFocus={!!person.email}
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        placeholder="Who they are to you, e.g. my realtor friend and first user"
        aria-label="Who they are"
        maxLength={300}
      />
      <button type="submit" className="pen-btn pen-btn-accent" disabled={!name.trim()}>Save</button>
      <button type="button" className="pen-btn" onClick={onCancel}>Cancel</button>
    </form>
  )
}

function initials(s: string) {
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
