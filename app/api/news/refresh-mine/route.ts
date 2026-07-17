import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { buildMonitor, refreshTopic } from '@/lib/news/ai'
import { getUserMonitors, setUserMonitors, getUserTopics, upsertUserTopic, getPrefs } from '@/lib/news/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST: refresh every per-user section at once — all monitors + all pinned topics.
// Called by the general ↻ alongside /api/news/cron so ONE button updates the whole page
// (there are deliberately no per-section refresh buttons). Monitors re-checked in the
// last 3 min are skipped so ↻ can't stack AI calls.
const MONITOR_MIN_AGE = 3 * 60 * 1000

export async function POST() {
  const email = await authedEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const lang = (await getPrefs(email)).lang
  const [monitors, topics] = await Promise.all([getUserMonitors(email), getUserTopics(email)])

  let monitorsRefreshed = 0
  const jobs: Promise<unknown>[] = []

  if (monitors.length) {
    jobs.push((async () => {
      const rebuilt = await Promise.all(monitors.map(async (m) => {
        const age = m.updated_at ? Date.now() - Date.parse(m.updated_at) : Infinity
        if (age < MONITOR_MIN_AGE) return m
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
    jobs.push((async () => {
      try {
        await upsertUserTopic(email, await refreshTopic(t, lang))
        topicsRefreshed++
      } catch { /* keep last state */ }
    })())
  }

  await Promise.all(jobs)
  return NextResponse.json({ ok: true, monitors: monitorsRefreshed, topics: topicsRefreshed })
}
