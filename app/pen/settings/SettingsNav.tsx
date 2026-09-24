'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon, { type IconName } from '../Icon'

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: '/pen/settings', label: 'Profile', icon: 'person' },
  { href: '/pen/settings/hours', label: 'Buy hours', icon: 'hourglass' },
  { href: '/pen/settings/whatsapp', label: 'WhatsApp', icon: 'chat' },
]

/** `whatsapp` is false until the Vonage env vars exist, so nobody finds a page that can't work. */
export default function SettingsNav({ whatsapp = false }: { whatsapp?: boolean }) {
  const path = usePathname()
  return (
    <nav className="pen-set-nav" aria-label="Settings">
      {ITEMS.filter((i) => whatsapp || !i.href.endsWith('/whatsapp')).map((i) => (
        <Link key={i.href} href={i.href} className="pen-cat" data-active={path === i.href} aria-current={path === i.href ? 'page' : undefined}>
          <Icon name={i.icon} size={19} />
          <span className="pen-cat-label">{i.label}</span>
        </Link>
      ))}
    </nav>
  )
}
