import { authedEmail } from '@/lib/news/auth'
import { getLinkByEmail } from '@/lib/pen/whatsapp/store'
import { botNumber, configured } from '@/lib/pen/whatsapp/provider'
import { imessageFor } from '@/lib/pen/imessage/sendblue'
import WhatsAppLink from './WhatsAppLink'
import { getPrefs } from '@/lib/pen/proactive'

export const dynamic = 'force-dynamic'

export default async function WhatsAppPage() {
  const email = (await authedEmail())!
  let phone: string | null = null
  let loadError: string | null = null
  let prefs = { off: false, offKinds: [] as import('@/lib/pen/suggestions-types').ProactiveKind[] }
  try {
    const link = await getLinkByEmail(email)
    phone = link?.linked_at ? link.phone : null
    const p = await getPrefs(email)
    prefs = { off: !!p.off, offKinds: p.offKinds ?? [] }
  } catch (e) {
    loadError = (e as Error).message
  }
  return <WhatsAppLink initialPhone={phone} number={botNumber()} ready={configured()} loadError={loadError} prefs={prefs} imessage={imessageFor(email) ? process.env.SENDBLUE_NUMBER! : null} />
}
