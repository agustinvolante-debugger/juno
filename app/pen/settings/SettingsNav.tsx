'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon, { type IconName } from '../Icon'
import { useCopy } from '../LangContext'
import type { Copy } from '@/lib/pen/i18n'
import { SUPPORT_EMAIL } from '@/lib/support'

const SN: Copy<{ profile: string; aria: string; billing: string; invite: string; help: string; calendar: string; hours: string }> = {
  en: { profile: 'Profile', aria: 'Settings', billing: 'Billing', invite: 'Invite friends', help: 'Help', calendar: 'Google', hours: 'Recording hours' },
  es: { profile: 'Perfil', aria: 'Ajustes', billing: 'Facturación', invite: 'Invitar amigos', help: 'Ayuda', calendar: 'Google', hours: 'Horas de grabación' },
  pt: { profile: 'Perfil', aria: 'Configurações', billing: 'Cobrança', invite: 'Convidar amigos', help: 'Ajuda', calendar: 'Google', hours: 'Horas de gravação' },
}

const ITEMS: { href: string; label: 'profile' | 'WhatsApp'; icon: IconName }[] = [
  { href: '/pen/settings', label: 'profile', icon: 'person' },
  { href: '/pen/settings/whatsapp', label: 'WhatsApp', icon: 'chat' },
]

/**
 * `whatsapp` is false until WhatsApp (Meta Cloud API) or iMessage is configured, so nobody finds a page that can't work.
 * `billing` is true for anyone Stripe knows: pause, and the way into Stripe's portal.
 */
export default function SettingsNav({ whatsapp = false, billing = false, notion = false, calendar = false, imessage = false, granola = false }: { whatsapp?: boolean; billing?: boolean; notion?: boolean; calendar?: boolean; imessage?: boolean; granola?: boolean }) {
  const T = useCopy(SN)
  const path = usePathname()
  return (
    <nav className="pen-set-nav" aria-label={T.aria}>
      {ITEMS.filter((i) => whatsapp || !i.href.endsWith('/whatsapp')).map((i) => (
        <Link key={i.href} href={i.href} className="pen-cat" data-active={path === i.href} aria-current={path === i.href ? 'page' : undefined}>
          <Icon name={i.icon} size={19} />
          <span className="pen-cat-label">{i.label === 'profile' ? T.profile : imessage ? 'WhatsApp & iMessage' : i.label}</span>
        </Link>
      ))}
      {notion && (
        <Link href="/pen/settings/notion" className="pen-cat" data-active={path === '/pen/settings/notion'} aria-current={path === '/pen/settings/notion' ? 'page' : undefined}>
          <Icon name="link" size={19} />
          <span className="pen-cat-label">Notion</span>
        </Link>
      )}
      {granola && (
        <Link href="/pen/settings/granola" className="pen-cat" data-active={path === '/pen/settings/granola'} aria-current={path === '/pen/settings/granola' ? 'page' : undefined}>
          <Icon name="link" size={19} />
          <span className="pen-cat-label">Granola</span>
        </Link>
      )}
      {calendar && (
        <Link href="/pen/settings/google" className="pen-cat" data-active={path === '/pen/settings/google'} aria-current={path === '/pen/settings/google' ? 'page' : undefined}>
          <Icon name="calendar" size={19} />
          <span className="pen-cat-label">{T.calendar}</span>
        </Link>
      )}
      <Link href="/pen/settings/invite" className="pen-cat" data-active={path === '/pen/settings/invite'} aria-current={path === '/pen/settings/invite' ? 'page' : undefined}>
        <Icon name="link" size={19} />
        <span className="pen-cat-label">{T.invite}</span>
      </Link>
      {/* The page WhatsApp's out-of-hours message points to: what's left this month, and buy more. */}
      <Link href="/pen/settings/hours" className="pen-cat" data-active={path === '/pen/settings/hours'} aria-current={path === '/pen/settings/hours' ? 'page' : undefined}>
        <Icon name="clock" size={19} />
        <span className="pen-cat-label">{T.hours}</span>
      </Link>
      {billing && (
        <Link href="/pen/settings/billing" className="pen-cat" data-active={path === '/pen/settings/billing'} aria-current={path === '/pen/settings/billing' ? 'page' : undefined}>
          <Icon name="lock" size={19} />
          <span className="pen-cat-label">{T.billing}</span>
        </Link>
      )}
      {/* Goes to the support inbox (a Google Group the founders read). The address is shown too,
          because a mailto does nothing on a computer with no mail app set up. */}
      <a href={`mailto:${SUPPORT_EMAIL}?subject=Juno%20Pen`} className="pen-cat">
        <Icon name="mail" size={19} />
        <span className="pen-cat-label">
          {T.help}
          <span className="pen-help-addr">{SUPPORT_EMAIL}</span>
        </span>
      </a>
    </nav>
  )
}
