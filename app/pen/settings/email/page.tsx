import { notFound } from 'next/navigation'
import { authedEmail } from '@/lib/news/auth'
import { gmailAvailable, gmailReadAllowed, listAccounts } from '@/lib/pen/gmail'
import { defaultCalendar, listCalendars } from '@/lib/pen/calendars'
import EmailPanel from './EmailPanel'

export const dynamic = 'force-dynamic'

// Settings → Email (lib/pen/gmail.ts): the Gmail addresses drafts can go out from, one default.
// Hidden (404) until Google is configured and the pen_gmail table exists. Reading (team test) is
// offered per address only to accounts on PEN_GMAIL_READ_USERS; nobody else sees it.
export default async function EmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  if (!(await gmailAvailable())) notFound()
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const [accounts, readAllowed, cals] = await Promise.all([listAccounts(email).catch(() => []), gmailReadAllowed(email).catch(() => false), listCalendars(email).catch(() => [])])
  // Calendars (20 Oct): each address's calendar on/off, and which one new events go on.
  const def = cals.length ? (await defaultCalendar(email, cals).catch(() => null))?.key ?? null : null
  return (
    <EmailPanel
      accounts={accounts.map((a) => ({ address: a.address, isDefault: a.is_default, needsReconnect: Boolean(a.last_error), canRead: readAllowed && a.can_read, calendar: cals.some((c) => c.key === a.address) ? (def === a.address ? 'default' : 'on') : 'off' }))}
      severalCalendars={cals.length > 1}
      readAllowed={readAllowed}
      justConnected={one('connected')}
      readResult={readAllowed && (one('read') === 'on' || one('read') === 'denied') ? (one('read') as 'on' | 'denied') : null}
      calResult={one('cal') === 'on' || one('cal') === 'denied' || one('cal') === 'full' ? (one('cal') as 'on' | 'denied' | 'full') : null}
      error={one('error')}
    />
  )
}
