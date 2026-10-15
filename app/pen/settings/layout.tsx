import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authedEmail } from '@/lib/news/auth'
import SettingsNav from './SettingsNav'
import { configured as whatsappReady } from '@/lib/pen/whatsapp/provider'
import { imessageFor } from '@/lib/pen/imessage/sendblue'
import { LangProvider } from '../LangContext'
import { appLangFor } from '../app-lang'
import { getAccount } from '@/lib/pen/accounts'
import { notionConfigured } from '@/lib/pen/notion'
import { gcalConfigured } from '@/lib/pen/google-calendar'
import { getLinkByEmail } from '@/lib/pen/whatsapp/store'
import { botNumber } from '@/lib/pen/whatsapp/provider'
import { channelFor } from '@/lib/pen/proactive'
import SettingsTabs from './SettingsTabs'

const COPY = {
  en: { back: 'Back to recordings', title: 'Settings' },
  es: { back: 'Volver a las grabaciones', title: 'Ajustes' },
  pt: { back: 'Voltar para as gravações', title: 'Configurações' },
} as const

export const dynamic = 'force-dynamic'

// Settings: who you are (for the notes) and recording hours. Signed-in only; anyone else
// goes back to Pen, which shows them the landing page.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const email = await authedEmail()
  if (!email) redirect('/pen')
  const [lang, account] = await Promise.all([appLangFor(email), getAccount(email)])
  const T = COPY[lang]
  // The phone tab bar's Chat: WhatsApp or iMessage when linked (as in the app), else the web chat.
  let chatLink: { href: string; label: string } | null = null
  if (whatsappReady() || imessageFor(email)) {
    const link = await getLinkByEmail(email).catch(() => null)
    if (link?.linked_at) {
      const channel = await channelFor(email).catch(() => null)
      const im = channel?.imessage ? process.env.SENDBLUE_NUMBER : null
      chatLink = im ? { href: `sms:+${im.replace(/\D/g, '')}`, label: 'iMessage' } : { href: `https://wa.me/${botNumber()}`, label: 'WhatsApp' }
    }
  }

  return (
    <LangProvider lang={lang}>
    <main className="pen-set">
      <header className="pen-set-head">
        <Link href="/pen" className="pen-set-brand">
          <Image src="/juno_mark.png" alt="" width={30} height={30} className="pen-mark" priority />
          <span className="pen-display pen-brand-name">Juno Pen</span>
        </Link>
        <Link href="/pen" className="pen-back">{T.back}</Link>
      </header>
      <div className="pen-set-body">
        <aside className="pen-set-side">
          <h1 className="pen-display pen-set-title">{T.title}</h1>
          <div className="pen-set-email">{email}</div>
          <SettingsNav whatsapp={whatsappReady() || imessageFor(email)} imessage={imessageFor(email)} billing={Boolean(account?.stripe_customer_id)} notion={notionConfigured()} calendar={gcalConfigured()} />
        </aside>
        <section className="pen-set-main">{children}</section>
      </div>
      <SettingsTabs chatLink={chatLink} />
    </main>
    </LangProvider>
  )
}
