import { authedEmail } from '@/lib/news/auth'
import { listSessions } from '@/lib/pen/store'
import PenApp from './PenApp'
import Landing from './Landing'

export const dynamic = 'force-dynamic'

export default async function PenPage() {
  const email = await authedEmail()

  // Signed out gets the landing page; signed in goes straight to the app. Same URL, so a
  // shared link works for someone who has never seen it and for someone who lives in it.
  if (!email) return <Landing />

  let sessions: Awaited<ReturnType<typeof listSessions>> = []
  let loadError: string | null = null
  try {
    sessions = await listSessions(email)
  } catch (e) {
    // Almost always "table does not exist" before lib/pen/schema.sql has been run.
    loadError = (e as Error).message
  }

  return <PenApp initial={sessions} loadError={loadError} />
}
