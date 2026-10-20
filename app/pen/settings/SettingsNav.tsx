'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon, { type IconName } from '../Icon'
import { useCopy } from '../LangContext'
import type { Copy } from '@/lib/pen/i18n'
import { SUPPORT_EMAIL } from '@/lib/support'

// Settings, 20 Oct: Profile · Connections · Messages from Juno · Invite friends · Billing · Help.
// Connections replaced one item per company (Google, Email, Notion, Granola, WhatsApp), which
// told an Outlook user nothing applied to them and split one Gmail account across two pages.
const SN: Copy<{ aria: string; profile: string; connections: string; messages: string; invite: string; billing: string; help: string }> = {
  en: { aria: 'Settings', profile: 'Profile', connections: 'Connections', messages: 'Messages from Juno', invite: 'Invite friends', billing: 'Billing', help: 'Help' },
  es: { aria: 'Ajustes', profile: 'Perfil', connections: 'Conexiones', messages: 'Mensajes de Juno', invite: 'Invitar amigos', billing: 'Facturación', help: 'Ayuda' },
  pt: { aria: 'Configurações', profile: 'Perfil', connections: 'Conexões', messages: 'Mensagens do Juno', invite: 'Convidar amigos', billing: 'Cobrança', help: 'Ajuda' },
}

type Item = { href: string; key: 'profile' | 'connections' | 'messages' | 'invite' | 'billing'; icon: IconName }

/**
 * `messages`: WhatsApp or iMessage is switched on (Messages from Juno only goes out there).
 * `billing`: anyone Stripe knows (pause, and the way into Stripe's portal).
 */
export default function SettingsNav({ messages = false, billing = false }: { messages?: boolean; billing?: boolean }) {
  const T = useCopy(SN)
  const path = usePathname()
  const items: Item[] = [
    { href: '/pen/settings', key: 'profile', icon: 'person' },
    { href: '/pen/settings/connections', key: 'connections', icon: 'link' },
    ...(messages ? [{ href: '/pen/settings/messages', key: 'messages', icon: 'bell' } as Item] : []),
    { href: '/pen/settings/invite', key: 'invite', icon: 'people' },
    ...(billing ? [{ href: '/pen/settings/billing', key: 'billing', icon: 'lock' } as Item] : []),
  ]
  return (
    <nav className="pen-set-nav" aria-label={T.aria}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="pen-cat" data-active={path === i.href} aria-current={path === i.href ? 'page' : undefined}>
          <Icon name={i.icon} size={19} />
          <span className="pen-cat-label">{T[i.key]}</span>
        </Link>
      ))}
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
