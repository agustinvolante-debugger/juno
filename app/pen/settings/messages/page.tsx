import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authedEmail } from '@/lib/news/auth'
import { configured as whatsappReady } from '@/lib/pen/whatsapp/provider'
import { imessageFor } from '@/lib/pen/imessage/sendblue'
import { appLangFor } from '../../app-lang'
import JunoMessages from '../whatsapp/JunoMessages'
import { loadMessages } from '../connections/data'

export const dynamic = 'force-dynamic'

// Settings → Messages from Juno (20 Oct): the switch for the messages Juno sends first. Was a card
// inside Settings → WhatsApp & iMessage; it is a preference, not a connection, so it got its own
// place in Settings when WhatsApp moved into Connections. Shown once a phone is linked.
const C = {
  en: { title: 'Messages from Juno', need: 'Juno writes first on WhatsApp or iMessage. Link your phone in Connections, then choose here what Juno may send you.', go: 'Link your phone' },
  es: { title: 'Mensajes de Juno', need: 'Juno escribe primero por WhatsApp o iMessage. Vincula tu teléfono en Conexiones y después elige aquí qué te puede enviar Juno.', go: 'Vincular tu teléfono' },
  pt: { title: 'Mensagens do Juno', need: 'O Juno escreve primeiro no WhatsApp ou no iMessage. Vincule seu telefone em Conexões e depois escolha aqui o que o Juno pode te mandar.', go: 'Vincular seu telefone' },
} as const

export default async function MessagesPage() {
  const email = (await authedEmail())!
  if (!whatsappReady() && !imessageFor(email)) notFound()
  const [lang, m] = await Promise.all([appLangFor(email), loadMessages(email)])
  const T = C[lang]
  if (m.linked) return <div className="pen-set-stack"><JunoMessages initial={m.prefs} /></div>
  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.title}</h2>
          <p className="pen-set-lede">{T.need}</p>
        </div>
        <div className="pen-set-actions">
          <Link className="pen-btn pen-btn-accent" href="/pen/settings/connections#whatsapp">{T.go}</Link>
        </div>
      </div>
    </div>
  )
}
