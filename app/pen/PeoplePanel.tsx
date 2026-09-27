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
import { useCopy } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'

type Suggestion = { name: string; role: string | null; note: string | null }
type Loaded = { people: PenPerson[]; suggestions: Suggestion[] }

const PP_EN = {
  loadFailed: 'Could not load people.',
  addAllFailed: 'Could not add everyone.',
  addFailed: 'Could not add that person.',
  removeFailed: 'Could not remove them.',
  saveFailed: 'Could not save.',
  people: 'People',
  addEmail: 'Add email',
  fromCalls: 'From your calls',
  editAria: (n: string) => `Edit ${n}`,
  edit: 'Edit',
  removeAria: (n: string) => `Remove ${n} from this recording`,
  removeTitle: 'Remove from this recording',
  empty: 'Nobody added yet. Add who you spoke with, and ask about them later with @ in search.',
  detected: 'Detected on this call · not saved yet',
  addAll: 'Add all',
  detectedLede: 'Juno Pen heard these names. Add the ones who were on the call and they become People: searchable with @, and used for names in the transcript.',
  addToPeople: 'Add to People',
  name: 'Name',
  emailOptional: 'Email (optional)',
  email: 'Email',
  aboutOptional: 'Who they are to you, e.g. my realtor friend (optional)',
  aboutEdit: 'Who they are to you, e.g. my realtor friend and first user',
  aboutAria: 'Who they are',
  adding: 'Adding…',
  add: 'Add',
  cancel: 'Cancel',
  addPerson: 'Add person',
  tellAbout: (n: string) => `Tell Juno Pen about ${n}`,
  save: 'Save',
}

const PP: Copy<typeof PP_EN> = {
  en: PP_EN,
  es: {
    loadFailed: 'No se pudieron cargar las personas.',
    addAllFailed: 'No se pudo agregar a todos.',
    addFailed: 'No se pudo agregar a esa persona.',
    removeFailed: 'No se pudo quitar.',
    saveFailed: 'No se pudo guardar.',
    people: 'Personas',
    addEmail: 'Agregar correo',
    fromCalls: 'De tus reuniones',
    editAria: (n) => `Editar a ${n}`,
    edit: 'Editar',
    removeAria: (n) => `Quitar a ${n} de esta grabación`,
    removeTitle: 'Quitar de esta grabación',
    empty: 'Todavía no agregas a nadie. Agrega con quién hablaste y pregunta por ellos después con @ en la búsqueda.',
    detected: 'Detectados en esta reunión · sin guardar',
    addAll: 'Agregar a todos',
    detectedLede: 'Juno Pen escuchó estos nombres. Agrega a los que estuvieron en la reunión y pasan a Personas: los puedes buscar con @ y sus nombres aparecen en la transcripción.',
    addToPeople: 'Agregar a Personas',
    name: 'Nombre',
    emailOptional: 'Correo (opcional)',
    email: 'Correo',
    aboutOptional: 'Quién es para ti, p. ej. mi amiga corredora (opcional)',
    aboutEdit: 'Quién es para ti, p. ej. mi amiga corredora y primera usuaria',
    aboutAria: 'Quién es',
    adding: 'Agregando…',
    add: 'Agregar',
    cancel: 'Cancelar',
    addPerson: 'Agregar persona',
    tellAbout: (n) => `Cuéntale a Juno Pen sobre ${n}`,
    save: 'Guardar',
  },
  pt: {
    loadFailed: 'Não foi possível carregar as pessoas.',
    addAllFailed: 'Não foi possível adicionar todos.',
    addFailed: 'Não foi possível adicionar essa pessoa.',
    removeFailed: 'Não foi possível remover.',
    saveFailed: 'Não foi possível salvar.',
    people: 'Pessoas',
    addEmail: 'Adicionar e-mail',
    fromCalls: 'Das suas reuniões',
    editAria: (n) => `Editar ${n}`,
    edit: 'Editar',
    removeAria: (n) => `Remover ${n} desta gravação`,
    removeTitle: 'Remover desta gravação',
    empty: 'Ninguém adicionado ainda. Adicione com quem você falou e pergunte sobre eles depois com @ na busca.',
    detected: 'Detectados nesta reunião · ainda não salvos',
    addAll: 'Adicionar todos',
    detectedLede: 'O Juno Pen ouviu estes nomes. Adicione quem estava na reunião e eles viram Pessoas: dá para buscar com @, e os nomes aparecem na transcrição.',
    addToPeople: 'Adicionar a Pessoas',
    name: 'Nome',
    emailOptional: 'E-mail (opcional)',
    email: 'E-mail',
    aboutOptional: 'Quem é para você, ex.: minha amiga corretora (opcional)',
    aboutEdit: 'Quem é para você, ex.: minha amiga corretora e primeira usuária',
    aboutAria: 'Quem é',
    adding: 'Adicionando…',
    add: 'Adicionar',
    cancel: 'Cancelar',
    addPerson: 'Adicionar pessoa',
    tellAbout: (n) => `Conte ao Juno Pen sobre ${n}`,
    save: 'Salvar',
  },
}

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
  const T = useCopy(PP)
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
      setErr(errMessage(e, T.loadFailed))
    }
  }, [sessionId, T])
  useEffect(() => {
    setData(null)
    setAdding(false)
    setEditing(null)
    void load()
  }, [load, status])

  /** Every detected name at once. One request each; the list refreshes at the end. */
  async function addAll(names: string[]) {
    setBusy(true)
    setErr(null)
    try {
      let next: Loaded | null = null
      for (const n of names) next = await postJson<Loaded>('/api/pen/people', { sessionId, name: n })
      if (next) setData(next)
      onChanged()
      setTimeout(() => void load(), 6000)
    } catch (x) {
      setErr(errMessage(x, T.addAllFailed))
    } finally {
      setBusy(false)
    }
  }

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
      setErr(errMessage(x, T.addFailed))
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
      setErr(errMessage(x, T.removeFailed))
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
      setErr(errMessage(x, T.saveFailed))
    }
  }

  // Role-only entries ("the inspector") cannot be added as contacts, but they were in the
  // room, so they are still shown.
  // Not the user (marked by the notes), and not a placeholder for noise.
  const unnamed = (notes.people ?? []).filter(
    (p) => !p.name?.trim() && p.role && !/\(the user\)/i.test(p.speaker ?? '') && !/unclear|crosstalk|unknown/i.test(p.role),
  )

  return (
    <div className="pen-sec">
      <span className="pen-sec-head">
        <span className="pen-badge"><Icon name="people" size={13} /></span>{T.people}
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
                  <button type="button" className="pen-person-add-email" onClick={() => setEditing(p.id)}>{T.addEmail}</button>
                )}
                {p.summary && (
                  <p className="pen-person-summary">
                    <span className="pen-person-ai">{T.fromCalls}</span>
                    {p.summary}
                  </p>
                )}
              </div>
              <div className="pen-person-actions">
                <button type="button" onClick={() => setEditing(p.id)} aria-label={T.editAria(p.name)} title={T.edit}>{T.edit}</button>
                <button type="button" onClick={() => remove(p)} aria-label={T.removeAria(p.name)} title={T.removeTitle}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ),
        )}
        {data && data.people.length === 0 && !data.suggestions.length && (
          <p className="pen-people-empty">{T.empty}</p>
        )}
      </div>

      {/* Names the notes heard, not yet saved. Same row shape as People so the difference is
          one thing: these are not on the recording until you add them. */}
      {!!data?.suggestions.length && (
        <div className="pen-people-sugg">
          <div className="pen-people-sugg-head">
            <span className="pen-label">{T.detected}</span>
            {data.suggestions.length > 1 && (
              <button type="button" className="pen-people-sugg-all" disabled={busy} onClick={() => void addAll(data.suggestions.map((s) => s.name))}>
                {T.addAll}
              </button>
            )}
          </div>
          <p className="pen-people-sugg-lede">
            {T.detectedLede}
          </p>
          <div className="pen-people">
            {data.suggestions.map((s) => (
              <div key={s.name} className="pen-person pen-person-sugg">
                <span className="pen-avatar">{initials(s.name)}</span>
                <div className="pen-person-body">
                  <div className="pen-person-line">
                    <strong>{s.name}</strong>
                    {s.role && <span className="pen-person-meta">{s.role}</span>}
                  </div>
                  {s.note && <p className="pen-person-about">{s.note}</p>}
                </div>
                <div className="pen-person-actions">
                  <button type="button" className="pen-person-sugg-add" disabled={busy} onClick={() => add(s.name, undefined, undefined, true)}>
                    <Icon name="plus" size={14} />
                    {T.addToPeople}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!!unnamed.length && (
            <div className="pen-people-chips">
              {unnamed.map((p, i) => (
                <span key={`u${i}`} className="pen-people-unnamed" title={p.note}>{p.role}</span>
              ))}
            </div>
          )}
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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={T.name} aria-label={T.name} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={T.emailOptional} aria-label={T.email} type="email" />
          <input className="pen-people-about-in" value={aboutNew} onChange={(e) => setAboutNew(e.target.value)} placeholder={T.aboutOptional} aria-label={T.aboutAria} maxLength={300} />
          <button type="submit" className="pen-btn pen-btn-accent" disabled={busy || !name.trim()}>{busy ? T.adding : T.add}</button>
          <button type="button" className="pen-btn" onClick={() => setAdding(false)}>{T.cancel}</button>
        </form>
      ) : (
        <button type="button" className="pen-people-add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={15} />
          {T.addPerson}
        </button>
      )}
    </div>
  )
}

function EditRow({ person, onSave, onCancel }: { person: PenPerson; onSave: (p: { name: string; email: string; about: string }) => void; onCancel: () => void }) {
  const T = useCopy(PP)
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
      <p className="pen-people-edit-head">{T.tellAbout(person.name.split(' ')[0])}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={T.name} aria-label={T.name} />
      {/* Focus lands on the first thing still missing. */}
      <input autoFocus={!!person.email === false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={T.email} aria-label={T.email} type="email" />
      <input
        className="pen-people-about-in"
        autoFocus={!!person.email}
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        placeholder={T.aboutEdit}
        aria-label={T.aboutAria}
        maxLength={300}
      />
      <button type="submit" className="pen-btn pen-btn-accent" disabled={!name.trim()}>{T.save}</button>
      <button type="button" className="pen-btn" onClick={onCancel}>{T.cancel}</button>
    </form>
  )
}

function initials(s: string) {
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
