import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { buildMonitor, refreshTopic } from '@/lib/news/ai'
import { getUserMonitors, setUserMonitors, getUserTopics, upsertUserTopic, getPrefs, getUserVideos, setUserVideos } from '@/lib/news/store'
import { channelItems, interleaveBySource } from '@/lib/news/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST: refresh every per-user section at once — all monitors, pinned topics and video shelves.
// Called by the general ↻ alongside /api/news/cron so ONE button updates the whole page
// (there are deliberately no per-section refresh buttons). Monitors re-checked in the
// last 3 min are skipped so ↻ can't stack AI calls.
// AutoRefresh also calls this with { auto: true } (on visit, every 20 min, on tab return): then
// anything refreshed in the last 15 min is skipped, so open tabs keep topics fresh without
// re-running the AI on every visit.
const MONITOR_MIN_AGE = 3 * 60 * 1000
const AUTO_MIN_AGE = 15 * 60 * 1000
const ageOf = (iso?: string) => (iso ? Date.now() - Date.parse(iso) : Infinity)

export async function POST(req: Request) {
  const auto = Boolean(((await req.json().catch(() => ({}))) as { auto?: boolean }).auto)
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const lang = (await getPrefs(email)).lang
  const [monitors, topics] = await Promise.all([getUserMonitors(email), getUserTopics(email)])

  let monitorsRefreshed = 0
  const jobs: Promise<unknown>[] = []

  if (monitors.length) {
    jobs.push((async () => {
      const rebuilt = await Promise.all(monitors.map(async (m) => {
        if (ageOf(m.updated_at) < (auto ? AUTO_MIN_AGE : MONITOR_MIN_AGE)) return m
        try {
          const built = await buildMonitor(m.query, lang, m)
          monitorsRefreshed++
          return built
        } catch { return m } // one failed monitor keeps its last state
      }))
      await setUserMonitors(email, rebuilt)
    })())
  }

  let topicsRefreshed = 0
  for (const t of topics) {
    if (auto && ageOf(t.route?.items_at) < AUTO_MIN_AGE) continue
    jobs.push((async () => {
      try {
        await upsertUserTopic(email, await refreshTopic(t, lang))
        topicsRefreshed++
      } catch { /* keep last state */ }
    })())
  }

  // Video shelves: re-pull each channel's RSS (no AI). Without this a shelf is frozen at the
  // moment it was created and ages out of the Videos tab's 30-day window.
  let videosRefreshed = 0
  const vids = await getUserVideos(email)
  const freshVids = await Promise.all(vids.map(async (v) => {
    if (auto && ageOf(v.refreshed_at) < AUTO_MIN_AGE) return v
    try {
      const lists = await Promise.all((v.channels || []).map((c) => channelItems(c.cid, c.name).catch(() => [])))
      const items = lists.flat().sort((a, b) => (Date.parse(b.d || '') || 0) - (Date.parse(a.d || '') || 0))
      if (!items.length) return v
      videosRefreshed++
      return { ...v, items: interleaveBySource(items).slice(0, 30), refreshed_at: new Date().toISOString() }
    } catch { return v }
  }))

  await Promise.all(jobs)
  // Written after the monitor job so the two prefs writes don't race each other.
  if (videosRefreshed) {
    const latest = await getUserVideos(email)
    await setUserVideos(email, latest.map((v) => freshVids.find((f) => f.key === v.key) || v))
  }
  return NextResponse.json({ ok: true, monitors: monitorsRefreshed, topics: topicsRefreshed, videos: videosRefreshed })
}
