import { notFound } from 'next/navigation'
import { authedEmail } from '@/lib/news/auth'
import { gmailAvailable, gmailReadAllowed, listAccounts } from '@/lib/pen/gmail'
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
  const [accounts, readAllowed] = await Promise.all([listAccounts(email).catch(() => []), gmailReadAllowed(email).catch(() => false)])
  return (
    <EmailPanel
      accounts={accounts.map((a) => ({ address: a.address, isDefault: a.is_default, needsReconnect: Boolean(a.last_error), canRead: readAllowed && a.can_read }))}
      readAllowed={readAllowed}
      justConnected={one('connected')}
      readResult={readAllowed && (one('read') === 'on' || one('read') === 'denied') ? (one('read') as 'on' | 'denied') : null}
      error={one('error')}
    />
  )
}
