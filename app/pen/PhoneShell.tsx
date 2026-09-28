'use client'

// The phone app: a fixed screen with a bottom tab bar, like an installed app, instead of the
// desktop page squeezed into a column. The page itself never scrolls; each screen scrolls
// inside its own area (or, for chat, only the conversation does, with the composer pinned).
//
// Purely layout. PenApp owns the state and hands in the screen to show, so the phone and the
// desktop share every piece of behaviour: data, uploads, chat, billing, translations.

import { useEffect, useRef, useState } from 'react'
import Icon, { type IconName } from './Icon'
import { useCopy } from './LangContext'
import type { Copy } from '@/lib/pen/i18n'

export type PhoneTab = 'home' | 'upload' | 'recordings' | 'search'

const TABS: { id: PhoneTab; icon: IconName }[] = [
  { id: 'home', icon: 'home' },
  { id: 'upload', icon: 'plus' },
  { id: 'recordings', icon: 'recordings' },
  { id: 'search', icon: 'chat' },
]

const PS: Copy<Record<PhoneTab, string> & { back: string; tabs: string }> = {
  en: { home: 'Home', upload: 'Upload', recordings: 'Recordings', search: 'Chat', back: 'Back', tabs: 'Main' },
  es: { home: 'Inicio', upload: 'Subir', recordings: 'Grabaciones', search: 'Chat', back: 'Atrás', tabs: 'Principal' },
  pt: { home: 'Início', upload: 'Enviar', recordings: 'Gravações', search: 'Chat', back: 'Voltar', tabs: 'Principal' },
}

export default function PhoneShell({
  tab,
  onTab,
  title,
  onBack,
  left,
  right,
  banners,
  fill = false,
  scrollKey,
  children,
}: {
  tab: PhoneTab
  onTab: (t: PhoneTab) => void
  title: string
  /** Shows a back arrow in place of `left`. */
  onBack?: () => void
  left?: React.ReactNode
  right?: React.ReactNode
  /** Errors and notices, shown at the top of the screen. */
  banners?: React.ReactNode
  /** The screen manages its own scrolling (chat): the content area doesn't scroll. */
  fill?: boolean
  /** When this changes the content scrolls back to the top, as a new screen would. */
  scrollKey?: string
  children: React.ReactNode
}) {
  const T = useCopy(PS)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [scrollKey])

  // The page behind the app must not scroll or bounce; only the screens do.
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('pen-m-lock')
    return () => html.classList.remove('pen-m-lock')
  }, [])

  // The iPhone keyboard doesn't resize the page; it slides over it, hiding the chat's text box
  // and the @ list that rises from it. Size the app to the part of the screen still visible
  // (visualViewport), as messaging apps do, so the composer sits right above the keyboard.
  const shell = useRef<HTMLDivElement>(null)
  const [kb, setKb] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const fit = () => {
      const el = shell.current
      if (!el) return
      const open = window.innerHeight - vv.height > 120
      setKb(open)
      el.style.height = open ? `${vv.height}px` : ''
      el.style.top = open ? `${vv.offsetTop}px` : ''
    }
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    fit()
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [])

  return (
    <div className="pen-m" ref={shell} data-kb={kb}>
      <header className="pen-m-top">
        <div className="pen-m-top-side">
          {onBack ? (
            <button type="button" className="pen-m-iconbtn" onClick={onBack} aria-label={T.back}>
              <Icon name="back" size={20} />
            </button>
          ) : (
            left
          )}
        </div>
        <h1 className="pen-m-title">{title}</h1>
        <div className="pen-m-top-side pen-m-top-right">{right}</div>
      </header>

      <main ref={body} className="pen-m-body" data-fill={fill}>
        {banners}
        {children}
      </main>

      <nav className="pen-m-tabs" aria-label={T.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="pen-m-tab"
            data-on={tab === t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => onTab(t.id)}
          >
            <Icon name={t.icon} size={23} />
            <span>{T[t.id]}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
