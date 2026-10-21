'use client'

// The Chats page (21 Oct): every thread, newest first, with what it was about. The preview is
// the first question and the start of Juno's latest answer, cut on the server from the stored
// messages (app/api/pen/chats/preview.ts), so it costs nothing and shows at once. Rows are the
// sidebar's ChatRow in its roomier form, so rename and delete work the same in both places.

import { useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { useCopy, useLang } from './LangContext'
import { ago, shortDate, type Lang } from '@/lib/pen/i18n'
import type { ChatPreview } from '@/app/api/pen/chats/preview'
import './chats.css'

const CP = {
  en: {
    title: 'Chats',
    newChat: 'New chat',
    filter: 'Filter chats',
    empty: 'Ask anything in the search bar and your chats land here.',
    noMatch: (q: string) => `No chats match “${q}”.`,
    clear: 'Clear filter',
    loading: 'Loading your chats…',
    failed: 'Your chats didn’t load.',
    retry: 'Try again',
    shown: (n: number, all: number) => (n === all ? `${all} ${all === 1 ? 'chat' : 'chats'}` : `${n} of ${all}`),
  },
  es: {
    title: 'Chats',
    newChat: 'Nuevo chat',
    filter: 'Filtrar chats',
    empty: 'Pregunta lo que quieras en la barra de búsqueda y tus chats aparecerán aquí.',
    noMatch: (q: string) => `Ningún chat coincide con «${q}».`,
    clear: 'Borrar filtro',
    loading: 'Cargando tus chats…',
    failed: 'No se pudieron cargar tus chats.',
    retry: 'Reintentar',
    shown: (n: number, all: number) => (n === all ? `${all} ${all === 1 ? 'chat' : 'chats'}` : `${n} de ${all}`),
  },
  pt: {
    title: 'Conversas',
    newChat: 'Nova conversa',
    filter: 'Filtrar conversas',
    empty: 'Pergunte qualquer coisa na barra de busca e suas conversas aparecem aqui.',
    noMatch: (q: string) => `Nenhuma conversa corresponde a “${q}”.`,
    clear: 'Limpar filtro',
    loading: 'Carregando suas conversas…',
    failed: 'Não foi possível carregar suas conversas.',
    retry: 'Tentar de novo',
    shown: (n: number, all: number) => (n === all ? `${all} ${all === 1 ? 'conversa' : 'conversas'}` : `${n} de ${all}`),
  },
}

const REL = {
  en: { now: 'Just now', min: (n: number) => `${n} min ago`, h: (n: number) => `${n} h ago` },
  es: { now: 'Ahora', min: (n: number) => `hace ${n} min`, h: (n: number) => `hace ${n} h` },
  pt: { now: 'Agora', min: (n: number) => `há ${n} min`, h: (n: number) => `há ${n} h` },
}

/** "2 h ago" today, "Yesterday", then the date ("Oct 12"). */
export function chatWhen(iso: string, lang: Lang): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const mins = Math.floor((Date.now() - t) / 60_000)
  const sameDay = new Date(t).toDateString() === new Date().toDateString()
  if (sameDay || mins < 60) {
    if (mins < 1) return REL[lang].now
    if (mins < 60) return REL[lang].min(mins)
    return REL[lang].h(Math.floor(mins / 60))
  }
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (new Date(t).toDateString() === y.toDateString()) {
    const w = ago(new Date(Date.now() - 86_400_000).toISOString(), lang)
    return w.charAt(0).toUpperCase() + w.slice(1)
  }
  return shortDate(t, lang)
}

/**
 * The question line, unless it only repeats the title. A thread is named after its first question
 * (titleFromQuestion), so for most chats the two say the same thing; a renamed chat shows both.
 */
export function questionLine(c: ChatPreview): string {
  const q = c.firstQuestion.trim()
  const t = (c.title ?? '').replace(/…$/, '').trim()
  if (!q || (t && q.toLowerCase().startsWith(t.toLowerCase()))) return ''
  return q
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ChatsPage({
  chats,
  failed,
  onRetry,
  onNew,
  row,
}: {
  /** null while the first load is in flight. */
  chats: ChatPreview[] | null
  failed: boolean
  onRetry: () => void
  onNew: () => void
  row: (c: ChatPreview, when: string) => React.ReactNode
}) {
  const T = useCopy(CP)
  const lang = useLang()
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => {
    if (!chats) return []
    const needle = fold(q.trim())
    if (!needle) return chats
    return chats.filter((c) => fold(`${c.title ?? ''} ${c.firstQuestion} ${c.lastAnswer}`).includes(needle))
  }, [chats, q])

  const all = chats?.length ?? 0

  return (
    <div className="pen-chats">
      <header className="pen-chats-bar">
        <h2 className="pen-chats-h">
          {T.title}
          {all > 0 && <span className="pen-chats-count" aria-live="polite">{T.shown(shown.length, all)}</span>}
        </h2>
        <button type="button" className="pen-btn pen-btn-accent pen-chats-new" onClick={onNew}>
          <Icon name="plus" size={16} />
          {T.newChat}
        </button>
      </header>

      {all > 0 && (
        <div className="pen-chats-filter">
          <Icon name="search" size={17} className="pen-chats-filter-ic" />
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.preventDefault(); setQ('') } }}
            placeholder={T.filter}
            aria-label={T.filter}
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" className="pen-chats-clear" onClick={() => { setQ(''); input.current?.focus() }} aria-label={T.clear}>
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
      )}

      {chats === null && failed ? (
        <div className="pen-chats-state" role="alert">
          <p>{T.failed}</p>
          <button type="button" className="pen-btn" onClick={onRetry}>{T.retry}</button>
        </div>
      ) : chats === null ? (
        <div className="pen-chats-list" aria-busy="true" aria-label={T.loading}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="pen-chats-skel" aria-hidden="true"><i /><i /><i /></div>)}
        </div>
      ) : all === 0 ? (
        <div className="pen-chats-state">
          <span className="pen-chats-state-ic" aria-hidden="true"><Icon name="chat" size={22} /></span>
          <p>{T.empty}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="pen-chats-state">
          <p>{T.noMatch(q.trim())}</p>
          <button type="button" className="pen-btn" onClick={() => { setQ(''); input.current?.focus() }}>{T.clear}</button>
        </div>
      ) : (
        <ul className="pen-chats-list" role="list">
          {shown.map((c) => <li key={c.id}>{row(c, chatWhen(c.updated_at, lang))}</li>)}
        </ul>
      )}
    </div>
  )
}
