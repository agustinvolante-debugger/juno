import { authedEmail } from '@/lib/news/auth'
import { listSessions } from '@/lib/pen/store'
import { archiveStats } from '@/lib/pen/stats'
import PenApp from './PenApp'
import Landing from './Landing'

export const dynamic = 'force-dynamic'

export default async function PenPage() {
  const email = await authedEmail()

  // Signed out gets the landing page; signed in goes straight to the app. Same URL, so a
  // shared link works for someone who has never seen it and for someone who lives in it.
  if (!email) return <Landing />

  let sessions: Awaited<ReturnType<typeof listSessions>> = []
  let stats: Awaited<ReturnType<typeof archiveStats>> | null = null
  let loadError: string | null = null
  try {
    // Sequential on purpose: if the tables are missing, the first call already tells us
    // and there is no point paying for the second.
    sessions = await listSessions(email)
    stats = await archiveStats(email)
  } catch (e) {
    // Almost always "table does not exist" before lib/pen/schema.sql has been run.
    loadError = (e as Error).message
  }

  return <PenApp initial={sessions} stats={stats} loadError={loadError} />
}
