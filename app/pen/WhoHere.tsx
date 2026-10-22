'use client'

// "Who was here?" (22 Oct). One card per recording that nobody has said who was on: the names
// heard and the calendar guests as chips, pre-ticked by the rules in lib/pen/who.ts, plus
// "Someone else". Save puts the ticked people on the recording as the user's own; Skip stops
// asking. Home shows a few (WhoCardHome); "Review all" and the review after a multi-file upload
// list every one (WhoList) inside Home's morphing panel.
//
// Built for a quick yes: the likely answer is already ticked, so most cards are one tap on Save.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { PersonCard } from '@/lib/pen/people'
import type { WhoCard } from '@/lib/pen/who-server'
import type { WhoChip } from '@/lib/pen/who'
import { getJson, postJson, errMessage } from '@/lib/pen/http'
import { fmtDate, type Copy } from '@/lib/pen/i18n'
import { useCopy, useLang } from './LangContext'
import Icon from './Icon'
import PeoplePicker, { type Picked } from './PeoplePicker'

const W_EN = {
  title: 'Who was here?',
  sub: 'Tick who was on each call, then Save.',
  reviewTitle: 'Who was in each?',
  invite: 'On the invite',
  heard: 'We heard',
  added: 'Added by you',
  noNames: 'No names were said on this one.',
  someoneElse: 'Someone else',
  save: 'Save',
  saving: 'Saving…',
  skip: 'Skip',
  skipTitle: 'Don’t ask about this recording again',
  failed: 'That did not save. Try again.',
  loadFailed: 'Could not load these recordings.',
  retry: 'Try again',
  reviewAll: (n: number) => `Review all ${n}`,
  pending: 'Still being written up. You can add who was there now.',
  saved: (names: string) => (names ? `Saved: ${names}` : 'Saved'),
  skipped: 'Skipped. It won’t ask again.',
  already: 'People already added',
  min: (n: number) => `${n} min`,
  fromInvite: 'From your calendar invite',
  empty: 'Nothing to confirm. Every recording has its people.',
  untitled: 'Untitled recording',
  wasHere: (n: string) => `${n} was here`,
}

const W: Copy<typeof W_EN> = {
  en: W_EN,
  es: {
    title: '¿Quién estuvo?',
    sub: 'Marca quién estuvo en cada reunión y toca Guardar.',
    reviewTitle: '¿Quién estuvo en cada una?',
    invite: 'En la invitación',
    heard: 'Escuchamos',
    added: 'Agregados por ti',
    noNames: 'En esta no se dijo ningún nombre.',
    someoneElse: 'Alguien más',
    save: 'Guardar',
    saving: 'Guardando…',
    skip: 'Omitir',
    skipTitle: 'No volver a preguntar por esta grabación',
    failed: 'No se guardó. Inténtalo otra vez.',
    loadFailed: 'No se pudieron cargar estas grabaciones.',
    retry: 'Reintentar',
    reviewAll: (n) => `Revisar las ${n}`,
    pending: 'Todavía se está escribiendo. Ya puedes agregar quién estuvo.',
    saved: (names) => (names ? `Guardado: ${names}` : 'Guardado'),
    skipped: 'Omitida. No volverá a preguntar.',
    already: 'Personas ya agregadas',
    min: (n) => `${n} min`,
    fromInvite: 'De tu invitación del calendario',
    empty: 'Nada que confirmar. Todas las grabaciones tienen a sus personas.',
    untitled: 'Grabación sin título',
    wasHere: (n) => `${n} estuvo`,
  },
  pt: {
    title: 'Quem estava lá?',
    sub: 'Marque quem estava em cada reunião e toque em Salvar.',
    reviewTitle: 'Quem estava em cada uma?',
    invite: 'No convite',
    heard: 'Ouvimos',
    added: 'Adicionados por você',
    noNames: 'Nenhum nome foi dito nesta.',
    someoneElse: 'Outra pessoa',
    save: 'Salvar',
    saving: 'Salvando…',
    skip: 'Pular',
    skipTitle: 'Não perguntar de novo sobre esta gravação',
    failed: 'Não salvou. Tente de novo.',
    loadFailed: 'Não foi possível carregar estas gravações.',
    retry: 'Tentar de novo',
    reviewAll: (n) => `Revisar as ${n}`,
    pending: 'Ainda sendo escrita. Você já pode adicionar quem estava.',
    saved: (names) => (names ? `Salvo: ${names}` : 'Salvo'),
    skipped: 'Pulada. Não vai perguntar de novo.',
    already: 'Pessoas já adicionadas',
    min: (n) => `${n} min`,
    fromInvite: 'Do seu convite da agenda',
    empty: 'Nada para confirmar. Todas as gravações têm as suas pessoas.',
    untitled: 'Gravação sem título',
    wasHere: (n) => `${n} estava lá`,
  },
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const

/* ------------------------------------------------ hidden here (Skip before the ALTER) */

// Skip is stored on the recording (pen_sessions.who_at). Until that column exists the server
// answers stored: false, and the card is hidden in this browser only.
const HIDE_KEY = 'pen-who-hidden'
function hiddenHere(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDE_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function hideHere(id: string) {
  try {
    const s = hiddenHere()
    s.add(id)
    localStorage.setItem(HIDE_KEY, JSON.stringify([...s].slice(-300)))
  } catch {}
}

/* ------------------------------------------------ data */

export type WhoState = {
  cards: WhoCard[]
  total: number
  loaded: boolean
  failed: boolean
  reload: () => void
  /** A card was answered: drop it here at once; the server agrees on the next load. */
  drop: (id: string) => void
}

/** Home's cards (no ids), or the review of these recordings (ids). */
export function useWho(ids: string[] | null = null, enabled = true): WhoState {
  const [cards, setCards] = useState<WhoCard[]>([])
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const key = ids?.join(',') ?? ''
  const gone = useRef(new Set<string>())
  const reload = useCallback(async () => {
    if (!enabled) return
    try {
      const j = await getJson<{ cards: WhoCard[]; total: number }>(`/api/pen/who${key ? `?ids=${encodeURIComponent(key)}` : ''}`)
      const hide = key ? new Set<string>() : new Set([...hiddenHere(), ...gone.current])
      const shown = j.cards.filter((c) => !hide.has(c.id))
      setCards(shown)
      setTotal(Math.max(shown.length, j.total - (j.cards.length - shown.length)))
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoaded(true)
    }
  }, [key, enabled])
  useEffect(() => { void reload() }, [reload])
  const drop = useCallback((id: string) => {
    gone.current.add(id)
    setCards((xs) => xs.filter((c) => c.id !== id))
    setTotal((n) => Math.max(0, n - 1))
  }, [])
  return { cards, total, loaded, failed, reload: () => void reload(), drop }
}

/* ------------------------------------------------ one recording */

type Outcome = { kind: 'saved'; names: string[] } | { kind: 'skipped' }

function WhoItem({ card, people, onAnswered, keepDone = false }: {
  card: WhoCard
  people: PersonCard[]
  onAnswered: (id: string, o: Outcome) => void
  /** The review list keeps an answered recording, showing what was saved; Home lets it go. */
  keepDone?: boolean
}) {
  const T = useCopy(W)
  const lang = useLang()
  const [chips, setChips] = useState<WhoChip[]>(card.chips)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<'save' | 'skip' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<Outcome | null>(null)
  useEffect(() => setChips(card.chips), [card.chips])

  const toggle = (i: number) => setChips((cs) => cs.map((c, j) => (j === i ? { ...c, ticked: !c.ticked } : c)))
  // Someone picked or typed in "Someone else" joins the chips, ticked.
  const addPicked = (v: Picked[]) => {
    const p = v[v.length - 1]
    if (!p) return
    setChips((cs) => {
      const at = cs.findIndex((c) => (p.id && c.personId === p.id) || c.name.toLowerCase() === p.name.toLowerCase())
      if (at >= 0) return cs.map((c, j) => (j === at ? { ...c, ticked: true } : c))
      return [...cs, { name: p.name, personId: p.id ?? null, ticked: true, why: 'linked' as const }]
    })
  }

  const answer = async (kind: 'save' | 'skip') => {
    setBusy(kind)
    setErr(null)
    const ticked = chips.filter((c) => c.ticked)
    try {
      if (kind === 'save' && ticked.length) {
        const r = await postJson<{ people: { id: string; name: string }[]; stored: boolean }>('/api/pen/who', {
          action: 'confirm',
          id: card.id,
          people: ticked.map((c) => (c.personId ? { personId: c.personId } : { name: c.name })),
        })
        const o: Outcome = { kind: 'saved', names: r.people.map((p) => p.name) }
        setDone(o)
        onAnswered(card.id, o)
      } else {
        // Save with nobody ticked is a Skip: there is nothing to put on the recording.
        const r = await postJson<{ stored: boolean }>('/api/pen/who', { action: 'skip', id: card.id })
        if (!r.stored) hideHere(card.id)
        const o: Outcome = { kind: 'skipped' }
        setDone(o)
        onAnswered(card.id, o)
      }
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(null)
    }
  }

  const when = fmtDate(card.when, lang, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const mins = card.durationSec ? Math.max(1, Math.round(card.durationSec / 60)) : null
  const invite = chips.map((c, i) => ({ c, i })).filter(({ c }) => c.why === 'calendar')
  const heard = chips.map((c, i) => ({ c, i })).filter(({ c }) => c.why !== 'calendar' && c.why !== 'linked')
  const added = chips.map((c, i) => ({ c, i })).filter(({ c }) => c.why === 'linked')
  const anyTicked = chips.some((c) => c.ticked)

  const chip = ({ c, i }: { c: WhoChip; i: number }) => (
    <li key={`${c.personId ?? c.name}-${i}`}>
      <button
        type="button"
        className="pen-who-chip"
        aria-pressed={c.ticked}
        aria-label={T.wasHere(c.name)}
        title={c.why === 'calendar' ? T.fromInvite : undefined}
        onClick={() => toggle(i)}
        disabled={!!busy || !!done}
      >
        <span className="pen-who-box" aria-hidden>{c.ticked && <Icon name="check" size={13} />}</span>
        <span className="pen-who-chip-name">{c.name}</span>
      </button>
    </li>
  )

  const group = (label: string, list: { c: WhoChip; i: number }[], icon?: 'calendar') =>
    list.length > 0 && (
      <div className="pen-who-group">
        <span className="pen-who-label">{icon && <Icon name={icon} size={13} />}{label}</span>
        <ul className="pen-who-chips">{list.map(chip)}</ul>
      </div>
    )

  if (done && keepDone) {
    return (
      <div className="pen-who-item" data-done>
        <div className="pen-who-head">
          <span className="pen-who-title">{card.title || T.untitled}</span>
          <span className="pen-who-meta">{when}{mins ? ` · ${T.min(mins)}` : ''}</span>
        </div>
        <p className="pen-who-result" role="status">
          <Icon name="check" size={15} />
          {done.kind === 'saved' ? T.saved(done.names.join(', ')) : T.skipped}
        </p>
      </div>
    )
  }

  return (
    <div className="pen-who-item">
      <div className="pen-who-head">
        <span className="pen-who-title">{card.title || T.untitled}</span>
        <span className="pen-who-meta">{when}{mins ? ` · ${T.min(mins)}` : ''}</span>
      </div>

      {card.pending && <p className="pen-who-note">{T.pending}</p>}
      {!card.pending && !chips.length && <p className="pen-who-note">{T.noNames}</p>}

      {group(T.invite, invite, 'calendar')}
      {group(T.heard, heard)}
      {group(card.confirmed ? T.already : T.added, added)}

      {adding ? (
        <div className="pen-who-else">
          <PeoplePicker people={people.filter((p) => !chips.some((c) => c.personId === p.id))} value={[]} onChange={addPicked} />
        </div>
      ) : null}

      <div className="pen-who-actions">
        {!adding && (
          <button type="button" className="pen-who-add" onClick={() => setAdding(true)} disabled={!!busy}>
            <Icon name="plus" size={15} />
            {T.someoneElse}
          </button>
        )}
        <span className="pen-who-acts">
          <button type="button" className="pen-btn pen-who-skip" onClick={() => void answer('skip')} disabled={!!busy} title={T.skipTitle}>
            {busy === 'skip' ? T.saving : T.skip}
          </button>
          <button type="button" className="pen-btn pen-btn-accent pen-who-save" onClick={() => void answer('save')} disabled={!!busy || !anyTicked}>
            {busy === 'save' ? T.saving : T.save}
          </button>
        </span>
      </div>
      {err && <p className="pen-who-err" role="alert">{err}</p>}
    </div>
  )
}

/* ------------------------------------------------ Home */

const itemMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.24, ease: EASE_OUT },
}

/**
 * Home's card: the newest few recordings to confirm, then "Review all". Hidden when there are
 * none, so Home never carries an empty box.
 */
export function WhoCardHome({ who, people, max, onReviewAll, onAnswered }: {
  who: WhoState
  people: PersonCard[]
  max: number
  onReviewAll: () => void
  onAnswered?: () => void
}) {
  const T = useCopy(W)
  const reduce = useReducedMotion()
  if (!who.cards.length) return null
  const shown = who.cards.slice(0, max)
  return (
    <section className="pen-whocard" aria-labelledby="pen-who-title">
      <header className="pen-who-cardhead">
        <span className="pen-card-icon" data-kind="who" aria-hidden><Icon name="people" size={16} /></span>
        <h3 id="pen-who-title" className="pen-card-title">{T.title}</h3>
        <p className="pen-who-sub">{T.sub}</p>
      </header>
      <ul className="pen-who-list">
        <AnimatePresence initial={false}>
          {shown.map((c) => (
            <motion.li key={c.id} {...(reduce ? {} : itemMotion)}>
              <WhoItem card={c} people={people} onAnswered={(id) => { who.drop(id); onAnswered?.() }} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {who.total > shown.length && (
        <button type="button" className="pen-card-more" onClick={onReviewAll} aria-haspopup="dialog">
          {T.reviewAll(who.total)}
          <Icon name="chevron" size={15} />
        </button>
      )}
    </section>
  )
}

/** The panel's list: every recording to confirm (Home's), or the ones just uploaded (ids). */
export function WhoList({ ids, home, people, onAnswered }: {
  ids: string[] | null
  /** Home's list, shared so answering here updates the card behind the panel. */
  home: WhoState
  people: PersonCard[]
  onAnswered?: () => void
}) {
  const T = useCopy(W)
  const own = useWho(ids, Boolean(ids))
  const src = ids ? own : home
  // The answered ones stay listed with what was saved, until the panel closes.
  const [kept] = useState(() => new Map<string, WhoCard>())
  const list = useMemo(() => {
    const live = src.cards
    for (const c of live) kept.set(c.id, c)
    return [...kept.values()]
  }, [src.cards, kept])
  if (!src.loaded) return <p className="pen-who-empty" aria-busy="true">…</p>
  if (src.failed && !list.length) {
    return (
      <p className="pen-who-empty">
        {T.loadFailed}{' '}
        <button type="button" className="pen-who-retry" onClick={src.reload}>{T.retry}</button>
      </p>
    )
  }
  if (!list.length) return <p className="pen-who-empty">{T.empty}</p>
  return (
    <div className="pen-who-panel">
      {ids && <p className="pen-who-panel-sub">{T.sub}</p>}
      <ul className="pen-who-list">
        {list.map((c) => (
          <li key={c.id}>
            <WhoItem
              card={c}
              people={people}
              keepDone
              onAnswered={(id) => {
                // Answered here is answered on Home too (the card behind the panel).
                home.drop(id)
                onAnswered?.()
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
