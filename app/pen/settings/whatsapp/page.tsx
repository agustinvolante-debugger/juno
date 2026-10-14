import { authedEmail } from '@/lib/news/auth'
import { getLinkByEmail } from '@/lib/pen/whatsapp/store'
import { botNumber, configured } from '@/lib/pen/whatsapp/provider'
import { imessageFor } from '@/lib/pen/imessage/sendblue'
import WhatsAppLink from './WhatsAppLink'

export const dynamic = 'force-dynamic'

export default async function WhatsAppPage() {
  const email = (await authedEmail())!
  let phone: string | null = null
  let loadError: string | null = null
  try {
    const link = await getLinkByEmail(email)
    phone = link?.linked_at ? link.phone : null
  } catch (e) {
    loadError = (e as Error).message
  }
  return <WhatsAppLink initialPhone={phone} number={botNumber()} ready={configured()} loadError={loadError} imessage={imessageFor(email) ? process.env.SENDBLUE_NUMBER! : null} />
}
