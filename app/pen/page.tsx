import Link from 'next/link'
import { authedEmail } from '@/lib/news/auth'
import { listSessions } from '@/lib/pen/store'
import PenApp from './PenApp'

export const dynamic = 'force-dynamic'

export default async function PenPage() {
  const email = await authedEmail()

  if (!email) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Pen</h1>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--pen-soft)' }}>
          Plug in the pen, get the showing written up. Sign in to continue.
        </p>
        <Link href="/auth/signin?callbackUrl=/pen" className="pen-btn pen-btn-primary mt-6 inline-block">
          Sign in with Google
        </Link>
      </main>
    )
  }

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
