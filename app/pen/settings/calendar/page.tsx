import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Settings → Calendar became Settings → Google (Calendar + Docs & Sheets) on 15 Oct. Old links
// (emails, chats, bookmarks) still land in the right place, query and all.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])))
  redirect(`/pen/settings/google${q.size ? `?${q}` : ''}`)
}
