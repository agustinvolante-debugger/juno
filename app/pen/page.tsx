import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { authedEmail } from '@/lib/news/auth'
import { listSessions } from '@/lib/pen/store'
import { archiveStats } from '@/lib/pen/stats'
import { adoptLegacyChat } from '@/lib/pen/chats'
import { getAllowance, type Allowance } from '@/lib/pen/allowance'
import PenApp from './PenApp'
import { getLinkByEmail } from '@/lib/pen/whatsapp/store'
import { botNumber, configured as whatsappReady } from '@/lib/pen/whatsapp/vonage'
import Landing from './Landing'
import { headers, cookies } from 'next/headers'
import { marketFor } from './landing-copy'

export const dynamic = 'force-dynamic'

export default async function PenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = await authedEmail()
  // Name and picture come free with the Google session; the mock shows both, and an avatar is
  // a far better "you are signed in as" signal than an elided email address.
  const session = await getServerSession(authOptions)

  // Signed out gets the landing page; signed in goes straight to the app. Same URL, so a
  // shared link works for someone who has never seen it and for someone who lives in it.
  if (!email) {
    // Which version of the landing page: ?m= (the footer switch) wins, then the remembered
    // choice, then the country Vercel reports for the visitor.
    const sp = await searchParams
    const m = typeof sp.m === 'string' ? sp.m : null
    const [h, c] = await Promise.all([headers(), cookies()])
    return <Landing market={marketFor(h.get('x-vercel-ip-country'), m ?? c.get('juno_lang')?.value ?? null)} />
  }

  let sessions: Awaited<ReturnType<typeof listSessions>> = []
  let stats: Awaited<ReturnType<typeof archiveStats>> | null = null
  let allowance: Allowance | null = null
  let loadError: string | null = null
  let whatsapp: { number: string; linked: boolean } | null = null
  try {
    // Sequential on purpose: if the tables are missing, the first call already tells us
    // and there is no point paying for the second.
    sessions = await listSessions(email)
    stats = await archiveStats(email)
    // The bar in the sidebar. A failure here must not take the recordings down with it.
    allowance = await getAllowance(email).catch(() => null)
    // Moves any pre-threads conversation into pen_chats once, so the overhaul doesn't
    // silently eat someone's existing chat history.
    await adoptLegacyChat(email).catch(() => {})
    if (whatsappReady()) {
      const link = await getLinkByEmail(email).catch(() => null)
      whatsapp = { number: botNumber(), linked: Boolean(link?.linked_at) }
    }
  } catch (e) {
    // Almost always "table does not exist" before lib/pen/schema.sql has been run.
    loadError = (e as Error).message
  }

  return (
    <PenApp
      initial={sessions}
      stats={stats}
      allowance={allowance}
      whatsapp={whatsapp}
      loadError={loadError}
      email={email}
      name={session?.user?.name ?? null}
      avatar={session?.user?.image ?? null}
    />
  )
}
