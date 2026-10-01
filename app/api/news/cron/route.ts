import { NextResponse, after } from 'next/server'
import { collectSections, getStats, tickerDef, SECTION_QUERIES, SECTIONS } from '@/lib/news/feeds'
import { curateSection } from '@/lib/news/ai'
import { setFeedCache, setStatsCache, getStatsCache, getSectionInstructions, getCustomTickers, feedCacheAgeMs } from '@/lib/news/store'
import { checkMonitorsAndPush } from '@/lib/news/push'
import { runNewsFunding } from '@/lib/vc/news-funding'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // feed refresh + scheduled monitor re-check for push alerts

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
    // Scheduled runs only: re-check alert-enabled monitors and push new developments to
    // subscribed devices (the public refresh button never triggers AI or notifications).
    let alerts: { checked: number; pushed: number; users: number } | { error: string } | null = null
    if (scheduled) {
      try { alerts = await checkMonitorsAndPush() } catch (e: any) { alerts = { error: String(e?.message || e).slice(0, 120) } }
    }
    // Scheduled runs only: hand today's funding headlines to VC Constellation (reported rounds).
    // after() = fire-and-forget once the response is sent; no extra Vercel cron (Hobby plan).
    if (scheduled) {
      after(async () => {
        try {
          const r = await runNewsFunding({ days: 3 })
          console.log('[news-cron] news-funding:', JSON.stringify({ dry: r.dry, sent: r.sentToModel, events: r.events.length, written: r.written, cost: r.costUsd, notes: r.notes.slice(0, 3) }))
        } catch (e: any) { console.warn('[news-cron] news-funding failed:', String(e?.message || e).slice(0, 160)) }
      })
    }
    return NextResponse.json({ ok: true, sections: Object.keys(bySection).length, feedsLive: `${live}/${total}`, curated: Object.keys(briefs).length, stats: Object.keys(stats).length, fresh: Object.keys(freshStats).length, alerts })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 })
  }
}
