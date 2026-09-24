import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authedEmail } from '@/lib/news/auth'
import SettingsNav from './SettingsNav'
import { configured as whatsappReady } from '@/lib/pen/whatsapp/vonage'

export const dynamic = 'force-dynamic'

// Settings: who you are (for the notes) and recording hours. Signed-in only; anyone else
// goes back to Pen, which shows them the landing page.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const email = await authedEmail()
  if (!email) redirect('/pen')

  return (
    <main className="pen-set">
      <header className="pen-set-head">
        <Link href="/pen" className="pen-set-brand">
          <Image src="/juno_mark.png" alt="" width={30} height={30} className="pen-mark" priority />
          <span className="pen-display pen-brand-name">Juno Pen</span>
        </Link>
        <Link href="/pen" className="pen-back">Back to recordings</Link>
      </header>
      <div className="pen-set-body">
        <aside className="pen-set-side">
          <h1 className="pen-display pen-set-title">Settings</h1>
          <div className="pen-set-email">{email}</div>
          <SettingsNav whatsapp={whatsappReady()} />
        </aside>
        <section className="pen-set-main">{children}</section>
      </div>
    </main>
  )
}
