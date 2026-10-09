import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs, setPrefs } from '@/lib/news/store'
import { SECTION_KEYS, MARKET_BUNDLES } from '@/lib/news/profile-options'

export const dynamic = 'force-dynamic'

// POST from the profile page: language, "about you", which standard sections show, which market
// bundles sit on the panel, the morning email. One prefs write. Topics, monitors and video
// shelves are built afterwards by the page through their own routes, so it can show progress.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { lang?: string; about?: string; sections?: string[]; bundles?: string[]; digest?: boolean; first?: boolean; hasOwn?: boolean }
  const cur = await getPrefs(email)
  const layout: any = { ...(cur.layout || {}) }

  // Sections: anything not ticked is hidden; hidden topics/shelves (non-standard ids) stay as they were.
  const shown = new Set((b.sections || []).filter((k) => SECTION_KEYS.includes(k)))
  // Nothing picked at all (no topics, no sections): start with two broad sections, never an empty page.
  if (!shown.size && !b.hasOwn) { shown.add('markets'); shown.add('geopolitics') }
  const otherHidden = ((layout.hidden || []) as string[]).filter((id) => !SECTION_KEYS.includes(id))
  layout.hidden = [...otherHidden, ...SECTION_KEYS.filter((k) => !shown.has(k))]

  // Markets: ticked bundles on, unticked bundles off, everything else (stocks, single picks) kept.
  const on = new Set(b.bundles || [])
  const bundleIds = new Set(MARKET_BUNDLES.flatMap((x) => x.ids))
  const prev: string[] = Array.isArray(layout.stats) ? layout.stats : []
  const kept = prev.filter((id) => !bundleIds.has(id))
  const picked = MARKET_BUNDLES.filter((x) => on.has(x.key)).flatMap((x) => x.ids)
  layout.stats = Array.from(new Set([...picked, ...kept]))

  layout.digest = !!b.digest
  const was = layout.profile || {}
  layout.profile = { ...was, about: String(b.about || '').trim().slice(0, 500), done: true, first: !!b.first || !!was.first, at: new Date().toISOString() }
  // A new "about you" or language should show in today's briefing, not tomorrow's.
  if (layout.profile.about !== (was.about || '') || (b.lang && b.lang !== cur.lang)) delete layout.briefing

  const patch: { lang?: string; layout: any } = { layout }
  if (b.lang === 'en' || b.lang === 'es') patch.lang = b.lang
  await setPrefs(email, patch)
  return NextResponse.json({ ok: true })
}
