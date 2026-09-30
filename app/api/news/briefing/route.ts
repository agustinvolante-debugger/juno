import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { dailyBriefing } from '@/lib/news/ai'
import { getPrefs, setPrefs } from '@/lib/news/store'
import { dayKey } from '@/lib/news/rank'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST { items: [{t,l,s}] } — the page's ranked Top 7. Returns today's 3-bullet briefing,
// generating it (one Haiku call) only if this user has none for today in this language.
// Cached in prefs.layout.briefing = { day, lang, at, bullets: [{ t, l }] }.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const items: { t: string; l: string; s: string }[] = (Array.isArray(body.items) ? body.items : [])
    .filter((x: any) => x && typeof x.t === 'string' && typeof x.l === 'string')
    .slice(0, 7)
    .map((x: any) => ({ t: String(x.t).slice(0, 240), l: String(x.l).slice(0, 600), s: String(x.s || '').slice(0, 80) }))
  const { lang, layout } = await getPrefs(email)
  const day = dayKey()
  const cur = layout?.briefing
  if (cur && cur.day === day && cur.lang === lang && Array.isArray(cur.bullets) && cur.bullets.length) {
    return NextResponse.json({ ok: true, cached: true, briefing: cur })
  }
  if (!items.length) return NextResponse.json({ error: 'no items' }, { status: 400 })
  const bullets = (await dailyBriefing(items, lang)).map((b) => ({ t: b.text, l: items[b.i].l }))
  if (!bullets.length) return NextResponse.json({ error: 'briefing unavailable' }, { status: 502 })
  const briefing = { day, lang, at: new Date().toISOString(), bullets }
  // Re-read right before writing so a concurrent prefs write (save, minimize) isn't clobbered.
  const fresh = await getPrefs(email)
  await setPrefs(email, { layout: { ...(fresh.layout || {}), briefing } })
  return NextResponse.json({ ok: true, briefing })
}
