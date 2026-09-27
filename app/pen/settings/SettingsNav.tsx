'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon, { type IconName } from '../Icon'
import { useCopy } from '../LangContext'
import type { Copy } from '@/lib/pen/i18n'

const SN: Copy<{ profile: string; aria: string }> = {
  en: { profile: 'Profile', aria: 'Settings' },
  es: { profile: 'Perfil', aria: 'Ajustes' },
  pt: { profile: 'Perfil', aria: 'Configurações' },
}

const ITEMS: { href: string; label: 'profile' | 'WhatsApp'; icon: IconName }[] = [
  { href: '/pen/settings', label: 'profile', icon: 'person' },
  { href: '/pen/settings/whatsapp', label: 'WhatsApp', icon: 'chat' },
]

/** `whatsapp` is false until the Vonage env vars exist, so nobody finds a page that can't work. */
export default function SettingsNav({ whatsapp = false }: { whatsapp?: boolean }) {
  const T = useCopy(SN)
  const path = usePathname()
  return (
    <nav className="pen-set-nav" aria-label={T.aria}>
      {ITEMS.filter((i) => whatsapp || !i.href.endsWith('/whatsapp')).map((i) => (
        <Link key={i.href} href={i.href} className="pen-cat" data-active={path === i.href} aria-current={path === i.href ? 'page' : undefined}>
          <Icon name={i.icon} size={19} />
          <span className="pen-cat-label">{i.label === 'profile' ? T.profile : i.label}</span>
        </Link>
      ))}
    </nav>
  )
}
