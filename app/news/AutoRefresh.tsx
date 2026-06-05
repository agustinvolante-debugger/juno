'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Keeps the shared feed cache fresh and re-renders the page WITHOUT a full reload (router.refresh
// preserves scroll + client state): on visit, every 20 min while the tab is visible, and on tab
// re-focus when the data is stale. The /api/news/cron endpoint is throttled to 5 min server-side,
// so frequent triggers (multiple tabs/visitors) are cheap no-ops — we only re-render when it
// actually pulled fresh data.
export default function AutoRefresh() {
  const router = useRouter()
  const lastRef = useRef(0)
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function refresh(minGapMs = 0) {
      if (busyRef.current) return
      if (minGapMs && Date.now() - lastRef.current < minGapMs) return
      busyRef.current = true
      try {
        const r = await fetch('/api/news/cron')
        const j = await r.json().catch(() => ({}))
        lastRef.current = Date.now()
        if (!cancelled && j?.ok && !j.throttled) router.refresh()
      } catch {
        /* ignore — try again next tick */
      } finally {
        busyRef.current = false
      }
    }

    refresh() // on visit
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 20 * 60 * 1000)
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh(5 * 60 * 1000)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [router])

  return null
}
