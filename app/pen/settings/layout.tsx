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
import { getLinkByEmail } from '@/lib/pen/whatsapp/store'
import { botNumber } from '@/lib/pen/whatsapp/provider'
import { channelFor } from '@/lib/pen/proactive'
import SettingsTabs from './SettingsTabs'
import BackHome from './BackHome'
import { headers } from 'next/headers'

const COPY = {
  en: { back: 'Back to Home', title: 'Settings' },
  es: { back: 'Volver al inicio', title: 'Ajustes' },
  pt: { back: 'Voltar para o início', title: 'Configurações' },
} as const

export const dynamic = 'force-dynamic'

// Settings: who you are (for the notes) and recording hours. Signed-in only; anyone else
// goes back to Pen, which shows them the landing page.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const email = await authedEmail()
  if (!email) redirect('/pen')
  const [lang, account] = await Promise.all([appLangFor(email), getAccount(email)])
  const T = COPY[lang]
  // Home's address. On tryjunoapp.com it is "/": /pen there 308-redirects to "/" and drops the
  // query, so a link to /pen cost an extra round trip (and lost ?tab= on the phone tabs).
  const host = ((await headers()).get('host') || '').split(':')[0]
  const home = host === 'tryjunoapp.com' || host === 'www.tryjunoapp.com' ? '/' : '/pen'
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
        <Link href={home} className="pen-set-brand">
          <Image src="/juno_mark.png" alt="" width={30} height={30} className="pen-mark" priority />
          <span className="pen-wordmark pen-brand-name"><span className="pen-wordmark-j">J</span>uno Pen</span>
        </Link>
        <BackHome href={home} label={T.back} />
      </header>
      <div className="pen-set-body">
        <aside className="pen-set-side">
          <h1 className="pen-display pen-set-title">{T.title}</h1>
          <div className="pen-set-email">{email}</div>
          <SettingsNav messages={whatsappReady() || imessageFor(email)} billing={Boolean(account?.stripe_customer_id)} />
        </aside>
        <section className="pen-set-main">{children}</section>
      </div>
      <SettingsTabs chatLink={chatLink} home={home} />
    </main>
    </LangProvider>
  )
}
