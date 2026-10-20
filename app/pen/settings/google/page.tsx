import { redirect } from 'next/navigation'
import { connectionsHref } from '@/lib/pen/settings-paths'

export const dynamic = 'force-dynamic'

// Settings → google became a section of Settings → Connections on 20 Oct. Old links (OAuth
// callbacks in flight, emails, WhatsApp messages, bookmarks) land on it, status and all.
export default async function Old({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  redirect(connectionsHref('google', Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])))))
}
