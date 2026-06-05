import { NextResponse } from 'next/server'
import { collectSections, getStats, tickerDef, SECTION_QUERIES, SECTIONS } from '@/lib/news/feeds'
import { curateSection } from '@/lib/news/ai'
import { setFeedCache, setStatsCache, getStatsCache, getSectionInstructions, getCustomTickers, feedCacheAgeMs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The broadened sections always get the AI curation pass (dedupe + rank + brief). Any other
// section the user has written an instruction for is curated too (so tuning works everywhere).
const BREADTH = Object.keys(SECTION_QUERIES)

// Refreshes the shared news + macro cache. Called by Vercel Cron (Bearer CRON_SECRET)
// or manually by the in-app refresh button. No AI, no per-user data, no API cost.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const scheduled = !secret || req.headers.get('authorization') === `Bearer ${secret}`
  // Public/manual refresh is allowed but throttled (RSS only, but avoid abuse): no-op if cache < 5 min old.
  if (!scheduled) {
    const age = await feedCacheAgeMs()
    if (age !== null && age < 5 * 60 * 1000) {
      return NextResponse.json({ ok: true, throttled: true })
    }
  }
  try {
    const { bySection, live, total } = await collectSections()
    // AI curation pass: dedupe near-identical stories + rank by importance + write a brief.
    // Runs in parallel across curated sections; failures fall back to the raw feed.
    const briefs: Record<string, string> = {}
    const instructions = await getSectionInstructions()
    const toCurate = Array.from(new Set([...BREADTH, ...Object.keys(instructions)]))
    await Promise.all(
      toCurate.filter((sec) => (bySection[sec] || []).length).map(async (sec) => {
        const label = SECTIONS.find((s) => s.key === sec)?.label || sec
        const { items, brief } = await curateSection(label, bySection[sec], 'en', instructions[sec] || '')
        bySection[sec] = items
        // Video sections don't get a "what matters" brief (it's news-shaped); ranking/exclusion still applies.
        if (brief && !sec.startsWith('watch_')) briefs[sec] = brief
      }),
    )
    await setFeedCache(bySection, briefs)
    // Merge fresh stats over the last good ones: a transient FRED/Stooq miss keeps its prior
    // value instead of blanking the belt (macro data changes slowly, so a stale read is fine).
    const tickers = await getCustomTickers()
    const extraDefs = tickers.map((t) => tickerDef(t.symbol, t.label))
    const [prevStats, freshStats] = await Promise.all([getStatsCache(), getStats(extraDefs)])
    const stats = { ...prevStats, ...freshStats }
    await setStatsCache(stats)
    return NextResponse.json({ ok: true, sections: Object.keys(bySection).length, feedsLive: `${live}/${total}`, curated: Object.keys(briefs).length, stats: Object.keys(stats).length, fresh: Object.keys(freshStats).length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 })
  }
}
