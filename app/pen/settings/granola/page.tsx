import { authedEmail } from '@/lib/news/auth'
import { getConnection, granolaAvailable } from '@/lib/pen/granola'
import GranolaPanel from './GranolaPanel'

export const dynamic = 'force-dynamic'

// Settings → Granola (lib/pen/granola.ts): an API key or Granola's sign-in, last import, disconnect.
export default async function GranolaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  const sp = await searchParams
  const [available, conn] = await Promise.all([granolaAvailable().catch(() => false), getConnection(email).catch(() => null)])
  return (
    <GranolaPanel
      available={available}
      conn={conn}
      justConnected={sp.connected === '1'}
      error={typeof sp.error === 'string' ? sp.error : null}
    />
  )
}
