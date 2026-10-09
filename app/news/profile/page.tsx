import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authedEmail } from '@/lib/news/auth'
import { getPrefs, getUserTopics, getUserMonitors, getCustomTickers } from '@/lib/news/store'
import { DEFAULT_STATS } from '@/lib/news/feeds'
import { SECTION_KEYS, MARKET_BUNDLES } from '@/lib/news/profile-options'
import ProfileForm from './ProfileForm'

export const dynamic = 'force-dynamic'

// The reader's profile: who they are, what to read, watch and track, their markets, the morning
// email. Shown by itself after the first sign-in (/news sends new readers here), then reachable
// from the avatar menu.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = await authedEmail()
  if (!email) redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/news/profile'))
  const [prefs, topics, monitors, tickers, sp, h] = await Promise.all([
    getPrefs(email), getUserTopics(email), getUserMonitors(email), getCustomTickers(), searchParams, headers(),
  ])
  const L = prefs.layout || {}
  const done = !!L.profile?.done
  const first = sp.first === '1' || !done
  // First visit: the browser's language decides; after that, the saved choice.
  const browserEs = /^es\b/i.test((h.get('accept-language') || '').trim())
  const lang = done || L.onboarded ? prefs.lang : browserEs ? 'es' : prefs.lang
  const hidden: string[] = L.hidden || []
  const stats: string[] = Array.isArray(L.stats) ? L.stats : DEFAULT_STATS
  const stockIds = new Set(stats.filter((id) => id.startsWith('tk_')))

  return (
    <ProfileForm
      first={first}
      initial={{
        lang: lang === 'es' ? 'es' : 'en',
        about: L.profile?.about || '',
        // Juno's own sections start unticked for a new reader: they build the page themselves.
        sections: first && !L.onboarded ? [] : SECTION_KEYS.filter((k) => !hidden.includes(k)),
        bundles: MARKET_BUNDLES.filter((b) => b.ids.every((id) => stats.includes(id))).map((b) => b.key),
        digest: !!L.digest,
        // One list: a topic with the bell on is also a monitor ("new" markers, Monitors tab).
        items: [
          ...topics.map((t) => ({ q: t.query, topic: true, alert: monitors.some((m) => m.query.toLowerCase() === t.query.toLowerCase()) })),
          ...monitors.filter((m) => !topics.some((t) => t.query.toLowerCase() === m.query.toLowerCase())).map((m) => ({ q: m.query, topic: false, alert: true })),
        ],
        videos: ((L.videos || []) as { key: string; label: string }[]).map((v) => ({ key: v.key, label: v.label })),
        stocks: tickers.filter((t) => stockIds.has(`tk_${t.symbol.toLowerCase()}`)).map((t) => ({ symbol: t.symbol, label: t.label || t.symbol })),
      }}
    />
  )
}
