// Web push for monitor alerts (server-only). Subscriptions live in news_prefs.layout.push
// (array of PushSubscription JSON, per device — no new table). The daily cron calls
// checkMonitorsAndPush(): re-checks each alert-enabled monitor and sends at most ONE
// notification per monitor per run (monitor name + top new headline).
import webpush from 'web-push'
import { buildMonitor } from './ai'
import { getPushAlertUsers, setUserMonitors, getPrefs, setPrefs } from './store'
import type { Monitor } from './feeds'

const MAX_REFRESH = 8 // total buildMonitor calls per run (keeps the cron inside its time budget)

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function vapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:chaska@caerusai.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  return webpush
}

export async function checkMonitorsAndPush(): Promise<{ checked: number; pushed: number; users: number }> {
  if (!pushConfigured()) return { checked: 0, pushed: 0, users: 0 }
  const users = await getPushAlertUsers()
  let budget = MAX_REFRESH
  let checked = 0
  let pushed = 0

  for (const u of users) {
    const monitors: Monitor[] = (u.layout?.monitors as Monitor[]) || []
    const subs: any[] = (u.layout?.push as any[]) || []
    if (!subs.length) continue
    const toCheck = monitors.filter((m) => m.alerts).slice(0, Math.max(0, budget))
    if (!toCheck.length) continue
    budget -= toCheck.length

    const updated = [...monitors]
    const deadEndpoints = new Set<string>()
    let changed = false

    await Promise.all(
      toCheck.map(async (m) => {
        try {
          const built = await buildMonitor(m.query, u.lang, m) // preserves items' `first` + the alerts flag
          const prevLinks = new Set((m.items || []).map((it) => it.l))
          const fresh = (built.items || []).filter((it) => !prevLinks.has(it.l))
          updated[monitors.indexOf(m)] = built
          changed = true
          checked++
          if (!fresh.length) return
          const top = fresh[0]
          const payload = JSON.stringify({
            title: `Daily Brief · ${m.query}`,
            body: top.t + (fresh.length > 1 ? `  (+${fresh.length - 1} more)` : ''),
            url: '/news',
            tag: `monitor-${m.query.toLowerCase()}`,
          })
          await Promise.all(
            subs.map(async (s) => {
              try {
                await vapid().sendNotification(s, payload)
                pushed++
              } catch (e: any) {
                if (e?.statusCode === 404 || e?.statusCode === 410) deadEndpoints.add(s.endpoint) // device unsubscribed
              }
            }),
          )
        } catch { /* one monitor failing shouldn't kill the run */ }
      }),
    )

    if (changed) await setUserMonitors(u.email, updated)
    if (deadEndpoints.size) {
      // re-read so we don't clobber the monitors just written
      const cur = await getPrefs(u.email)
      const alive = ((cur.layout?.push as any[]) || []).filter((s) => !deadEndpoints.has(s.endpoint))
      await setPrefs(u.email, { lang: cur.lang, layout: { ...(cur.layout || {}), push: alive } })
    }
  }
  return { checked, pushed, users: users.length }
}
