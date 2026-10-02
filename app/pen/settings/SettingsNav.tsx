'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon, { type IconName } from '../Icon'
import { useCopy } from '../LangContext'
import type { Copy } from '@/lib/pen/i18n'

const SN: Copy<{ profile: string; aria: string; billing: string; invite: string }> = {
  en: { profile: 'Profile', aria: 'Settings', billing: 'Billing', invite: 'Invite friends' },
  es: { profile: 'Perfil', aria: 'Ajustes', billing: 'Facturación', invite: 'Invitar amigos' },
  pt: { profile: 'Perfil', aria: 'Configurações', billing: 'Cobrança', invite: 'Convidar amigos' },
}

const ITEMS: { href: string; label: 'profile' | 'WhatsApp'; icon: IconName }[] = [
  { href: '/pen/settings', label: 'profile', icon: 'person' },
  { href: '/pen/settings/whatsapp', label: 'WhatsApp', icon: 'chat' },
]

/**
 * `whatsapp` is false until the Vonage env vars exist, so nobody finds a page that can't work.
 * `billing` is true for anyone Stripe knows: pause, and the way into Stripe's portal.
 */
export default function SettingsNav({ whatsapp = false, billing = false }: { whatsapp?: boolean; billing?: boolean }) {
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
      <Link href="/pen/settings/invite" className="pen-cat" data-active={path === '/pen/settings/invite'} aria-current={path === '/pen/settings/invite' ? 'page' : undefined}>
        <Icon name="link" size={19} />
        <span className="pen-cat-label">{T.invite}</span>
      </Link>
      {billing && (
        <Link href="/pen/settings/billing" className="pen-cat" data-active={path === '/pen/settings/billing'} aria-current={path === '/pen/settings/billing' ? 'page' : undefined}>
          <Icon name="lock" size={19} />
          <span className="pen-cat-label">{T.billing}</span>
        </Link>
      )}
    </nav>
  )
}
