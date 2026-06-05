import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { curateSection } from '@/lib/news/ai'
import { getFeedCache, setSectionInstruction, updateSectionCache } from '@/lib/news/store'
import { SECTIONS } from '@/lib/news/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Save a per-section curation instruction and re-curate that section immediately from the
// cached pool so the change is visible on the next reload (no need to wait for the cron).
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { section, instruction } = await req.json().catch(() => ({}))
  if (!section || !SECTIONS.some((s) => s.key === section)) return NextResponse.json({ error: 'bad section' }, { status: 400 })

  await setSectionInstruction(section, instruction || '')
  const cache = await getFeedCache()
  const items = cache[section] || []
  if (items.length) {
    const label = SECTIONS.find((s) => s.key === section)?.label || section
    const { items: ranked, brief } = await curateSection(label, items, 'en', instruction || '')
    await updateSectionCache(section, ranked, brief)
  }
  return NextResponse.json({ ok: true })
}
