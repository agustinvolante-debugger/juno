import { NextResponse } from 'next/server'
import { collectSections, getMacro } from '@/lib/news/feeds'
import { setFeedCache, setMacroCache, feedCacheAgeMs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    await setFeedCache(bySection)
    const macro = await getMacro()
    await setMacroCache(macro)
    return NextResponse.json({ ok: true, sections: Object.keys(bySection).length, feedsLive: `${live}/${total}`, macro: macro.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 })
  }
}
