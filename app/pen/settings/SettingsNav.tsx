'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon, { type IconName } from '../Icon'

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: '/pen/settings', label: 'Profile', icon: 'person' },
  { href: '/pen/settings/hours', label: 'Buy hours', icon: 'hourglass' },
]

export default function SettingsNav() {
  const path = usePathname()
  return (
    <nav className="pen-set-nav" aria-label="Settings">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className="pen-cat" data-active={path === i.href} aria-current={path === i.href ? 'page' : undefined}>
          <Icon name={i.icon} size={19} />
          <span className="pen-cat-label">{i.label}</span>
        </Link>
      ))}
    </nav>
  )
}
