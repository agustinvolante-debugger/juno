'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Keeps the shared feed cache fresh and re-renders the page WITHOUT a full reload (router.refresh
// preserves scroll + client state): on visit, every 20 min while the tab is visible, and on tab
// re-focus when the data is stale. The /api/news/cron endpoint is throttled to 5 min server-side,
// so frequent triggers (multiple tabs/visitors) are cheap no-ops — we only re-render when it
// actually pulled fresh data. Signed in, it also refreshes the reader's own sections (topics,
// monitors, video shelves) via /api/news/refresh-mine in auto mode, which skips anything
// refreshed in the last 15 min; without this they only updated on the ↻ button.
//
// Fresh data never reshuffles the page under someone who is reading: past the first screen it
// waits behind a "New stories" pill. Other components ask for a soft re-render with db:refresh.
const READING_Y = 240

export default function AutoRefresh({ signedIn = false, lang = 'en' }: { signedIn?: boolean; lang?: string }) {
  const router = useRouter()
  const lastRef = useRef(0)
  const busyRef = useRef(false)
  const [pending, setPending] = useState(false)
  const es = lang === 'es'

  useEffect(() => {
    let cancelled = false
    async function refresh(minGapMs = 0) {
      if (busyRef.current) return
      if (minGapMs && Date.now() - lastRef.current < minGapMs) return
      busyRef.current = true
      try {
        const [shared, mine] = await Promise.all([
          fetch('/api/news/cron').then((r) => r.json()).catch(() => ({})),
          signedIn
            ? fetch('/api/news/refresh-mine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auto: true }),
              }).then((r) => r.json()).catch(() => ({}))
            : Promise.resolve({}),
        ])
        lastRef.current = Date.now()
        const sharedFresh = shared?.ok && !shared.throttled
        const mineFresh = (mine?.monitors || 0) + (mine?.topics || 0) + (mine?.videos || 0) > 0
        if (cancelled || !(sharedFresh || mineFresh)) return
        if (window.scrollY > READING_Y) setPending(true)
        else router.refresh()
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
    const onSoft = () => { setPending(false); router.refresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('db:refresh', onSoft)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('db:refresh', onSoft)
    }
  }, [router, signedIn])

  if (!pending) return null
  return (
    <button
      type="button"
      className="db-newpill"
      onClick={() => {
        setPending(false)
        router.refresh()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
    >
      {es ? 'Hay noticias nuevas · Ver' : 'New stories · Show'}
    </button>
  )
}
