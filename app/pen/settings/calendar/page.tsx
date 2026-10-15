import { authedEmail } from '@/lib/news/auth'
import { gcalConfigured, getGcalConnection } from '@/lib/pen/google-calendar'
import CalendarPanel from './CalendarPanel'

export const dynamic = 'force-dynamic'

// Settings → Calendar (lib/pen/google-calendar.ts): connect Google Calendar, see which account, disconnect.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  const sp = await searchParams
  const conn = await getGcalConnection(email).catch(() => null)
  return (
    <CalendarPanel
      configured={gcalConfigured()}
      conn={conn}
      justConnected={sp.connected === '1'}
      justDisconnected={sp.disconnected === '1'}
      error={typeof sp.error === 'string' ? sp.error : null}
    />
  )
}
