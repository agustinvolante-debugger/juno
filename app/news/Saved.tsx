'use client'
import { useEffect, useState } from 'react'
import { getSaved, subscribeSaved, setDone, removeSaved, initSaved, type SavedItem } from './savedStore'
import { CheckIcon, CloseIcon, ShareIcon } from './Icons'

function rel(d: string | number | null): string {
  if (!d) return ''
  const t = typeof d === 'number' ? d : Date.parse(d)
  if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function useSaved(initial: SavedItem[], authed: boolean): SavedItem[] | null {
  // null until the store is ready on the client, so signed-out users don't flash "empty".
  const [list, setList] = useState<SavedItem[] | null>(authed ? initial : null)
  useEffect(() => {
    initSaved(initial, authed)
    setList(getSaved())
    return subscribeSaved((x) => setList([...x]))
  }, [initial, authed])
  return list
}

// Saved tab — read-later list, grouped Unread / Done.
export function SavedList({ initial, authed, lang = 'en' }: { initial: SavedItem[]; authed: boolean; lang?: string }) {
  const es = lang === 'es'
  const list = useSaved(initial, authed)
  if (list === null) return <div className="db-empty" aria-busy="true" />
  if (!list.length) {
    return (
      <div className="db-empty">
        <p className="db-empty-t">{es ? 'Nada guardado todavía' : 'Nothing saved yet'}</p>
        <p>{es ? 'Pasa el cursor sobre un titular y toca la estrella, o pulsa' : 'Hover a headline and tap the star, or press'} <kbd className="db-kbd">s</kbd> {es ? 'sobre la fila seleccionada.' : 'on the selected row.'}</p>
        {!authed && <p className="db-empty-sub">{es ? 'Sin sesión, lo guardado vive solo en este dispositivo.' : 'Signed out, saved stories live on this device only.'}</p>}
      </div>
    )
  }
  const unread = list.filter((x) => !x.done)
  const done = list.filter((x) => x.done)
  const group = (title: string, items: SavedItem[]) => items.length > 0 && (
    <section className="db-block" aria-label={title}>
      <h2 className="db-label"><span>{title}</span><span className="db-count">{items.length}</span></h2>
      <ul className="db-rows">
        {items.map((it) => (
          <li key={it.l} className={`db-row${it.done ? ' is-read' : ''}`} data-row data-l={it.l}>
            <a className="db-row-t" href={it.l} target="_blank" rel="noopener noreferrer">{it.t}</a>
            <div className="db-meta">
              <span className="db-src">{it.s}</span>
              {it.d && <time suppressHydrationWarning className="db-time">· {rel(it.d)}</time>}
              <span suppressHydrationWarning className="db-meta-quiet">· {es ? 'guardado hace' : 'saved'} {rel(it.savedAt)}{es ? '' : ' ago'}</span>
            </div>
            <div className="db-row-acts is-on">
              <button type="button" className="db-act" aria-pressed={!!it.done} aria-label={it.done ? (es ? 'Marcar como no leído' : 'Mark unread') : (es ? 'Marcar como hecho' : 'Mark done')} onClick={() => setDone(it.l, !it.done)}><CheckIcon /></button>
              <button type="button" className="db-act db-share" data-l={it.l} data-t={it.t} aria-label={es ? 'Compartir' : 'Share'}><ShareIcon /></button>
              <button type="button" className="db-act" aria-label={es ? 'Quitar' : 'Remove'} onClick={() => removeSaved(it.l)}><CloseIcon /></button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
  return (
    <div className="db-saved">
      {group(es ? 'Por leer' : 'Unread', unread)}
      {group(es ? 'Hecho' : 'Done', done)}
    </div>
  )
}

// Rail block — count + the three latest.
export function SavedRail({ initial, authed, lang = 'en' }: { initial: SavedItem[]; authed: boolean; lang?: string }) {
  const es = lang === 'es'
  const list = useSaved(initial, authed) || []
  const unread = list.filter((x) => !x.done)
  return (
    <section className="db-rail-block" aria-labelledby="db-rail-saved">
      <h2 className="db-label" id="db-rail-saved">
        <a href="/news?tab=saved">{es ? 'Guardados' : 'Saved'}</a>
        <span className="db-count">{unread.length}</span>
      </h2>
      {unread.length ? (
        <ul className="db-rail-list">
          {unread.slice(0, 3).map((it) => (
            <li key={it.l} data-l={it.l}><a href={it.l} target="_blank" rel="noopener noreferrer">{it.t}</a><span className="db-src">{it.s}</span></li>
          ))}
        </ul>
      ) : (
        <p className="db-rail-empty">{es ? 'Guarda con la estrella o la tecla s.' : 'Save with the star, or press s.'}</p>
      )}
    </section>
  )
}
