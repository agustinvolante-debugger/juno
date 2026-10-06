import { authedEmail } from '@/lib/news/auth'
import { getConnection, notionConfigured } from '@/lib/pen/notion'
import NotionPanel from './NotionPanel'

export const dynamic = 'force-dynamic'

// Settings → Notion (lib/pen/notion.ts): connect, automatic sending on/off, disconnect.
export default async function NotionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  const sp = await searchParams
  const conn = await getConnection(email).catch(() => null)
  return (
    <NotionPanel
      configured={notionConfigured()}
      conn={conn}
      justConnected={sp.connected === '1'}
      error={typeof sp.error === 'string' ? sp.error : null}
    />
  )
}
