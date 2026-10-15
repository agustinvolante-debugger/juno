import { authedEmail } from '@/lib/news/auth'
import { abilities, asWant, gcalConfigured, getGcalConnection } from '@/lib/pen/google-calendar'
import GooglePanel from './GooglePanel'

export const dynamic = 'force-dynamic'

// Settings → Google (lib/pen/google-calendar.ts, lib/pen/google-drive.ts): one Google account,
// two abilities, each connected and disconnected on its own: Calendar, and Docs & Sheets.
export default async function GooglePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const conn = await getGcalConnection(email).catch(() => null)
  const connected = one('connected')
  const disconnected = one('disconnected')
  return (
    <GooglePanel
      configured={gcalConfigured()}
      conn={conn}
      on={abilities(conn)}
      justConnected={connected ? (connected === '1' ? 'gcal' : asWant(connected)) : null}
      justDisconnected={disconnected === 'drive' ? 'drive' : disconnected ? 'gcal' : null}
      error={one('error')}
    />
  )
}
