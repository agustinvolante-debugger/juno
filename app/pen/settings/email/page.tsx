import { notFound } from 'next/navigation'
import { authedEmail } from '@/lib/news/auth'
import { gmailAvailable, listAccounts } from '@/lib/pen/gmail'
import EmailPanel from './EmailPanel'

export const dynamic = 'force-dynamic'

// Settings → Email (lib/pen/gmail.ts): the Gmail addresses drafts can go out from, one default.
// Hidden (404) until Google is configured and the pen_gmail table exists.
export default async function EmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  if (!(await gmailAvailable())) notFound()
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const accounts = await listAccounts(email).catch(() => [])
  return (
    <EmailPanel
      accounts={accounts.map((a) => ({ address: a.address, isDefault: a.is_default, needsReconnect: Boolean(a.last_error) }))}
      justConnected={one('connected')}
      error={one('error')}
    />
  )
}
