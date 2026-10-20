'use client'

// Settings on a phone keeps the app's bottom tab bar (critique 15 Oct): Settings is its own page,
// so the tabs are links back into the app (/pen?tab=…), and Chat opens WhatsApp or iMessage for
// a linked account, as it does in the app. Hidden above the phone breakpoint.

import Link from 'next/link'
import Icon, { type IconName } from '../Icon'
import { useCopy } from '../LangContext'
import type { Copy } from '@/lib/pen/i18n'

const ST: Copy<{ home: string; calendar: string; recordings: string; search: string; tabs: string }> = {
  en: { home: 'Home', calendar: 'Calendar', recordings: 'Recordings', search: 'Chat', tabs: 'Main' },
  es: { home: 'Inicio', calendar: 'Calendario', recordings: 'Grabaciones', search: 'Chat', tabs: 'Principal' },
  pt: { home: 'Início', calendar: 'Calendário', recordings: 'Gravações', search: 'Chat', tabs: 'Principal' },
}

const TABS: { id: 'home' | 'calendar' | 'recordings' | 'search'; icon: IconName }[] = [
  { id: 'home', icon: 'home' },
  { id: 'calendar', icon: 'calendar' },
  { id: 'recordings', icon: 'recordings' },
  { id: 'search', icon: 'chat' },
]

export default function SettingsTabs({ chatLink }: { chatLink: { href: string; label: string } | null }) {
  const T = useCopy(ST)
  return (
    <nav className="pen-m-tabs pen-set-tabs" aria-label={T.tabs}>
      {TABS.map((t) =>
        t.id === 'search' && chatLink ? (
          <a key={t.id} className="pen-m-tab" href={chatLink.href} target="_blank" rel="noreferrer">
            <Icon name="chat" size={23} />
            <span>{chatLink.label}</span>
          </a>
        ) : (
          <Link key={t.id} className="pen-m-tab" href={`/pen?tab=${t.id}`}>
            <Icon name={t.icon} size={23} />
            <span>{T[t.id]}</span>
          </Link>
        ),
      )}
    </nav>
  )
}
