import { getFeedCache, getMacroCache, getUserTopics, getUserVideos, getPrefs, getProfile, getTranslations, setTranslations } from '@/lib/news/store'
import { SECTIONS, ES_NATIVE, type Item } from '@/lib/news/feeds'
import { translateTitles } from '@/lib/news/ai'
import { authedEmail } from '@/lib/news/auth'
import { headers } from 'next/headers'
import RefreshButton from './RefreshButton'
import AIBar from './AIBar'
import SetupChat from './SetupChat'
import VideoBox from './VideoBox'
import SectionBrief from './SectionBrief'
import RemoveTopic from './RemoveTopic'
import RemoveVideo from './RemoveVideo'
import LangToggle from './LangToggle'
import ClickTracker from './ClickTracker'
import LayoutEnhancer from './LayoutEnhancer'
import HideSection from './HideSection'
import ShowHidden from './ShowHidden'

export const dynamic = 'force-dynamic'

const WATCH = (k: string) => k.startsWith('watch_') || k.startsWith('vt_')
const ICON = (k: string) => (WATCH(k) ? '🎬' : '📰')
const ES_LABELS: Record<string, string> = {
  ai: 'IA y Tecnología', funding: 'Financiamiento · VC · IPOs', markets: 'Mercados y Última Hora',
  longread: 'Análisis (de pago → abre el enlace)', chile: 'Chile / LatAm', founder: 'Fundadores · Lanzamientos',
  reddit: 'Reddit / HN', watch_ai: 'IA/Tech — recién subido', watch_vc: 'VC y Startups — recién subido', watch_golf: 'Golf — recién subido',
}

function rel(d: string | null): string {
  if (!d) return ''
  const t = Date.parse(d)
  if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function Items({ items, cap = 12, tr, sec }: { items: Item[]; cap?: number; tr?: Record<string, string>; sec?: string }) {
  return (
    <ul>
      {items.slice(0, cap).map((it, i) => (
        <li key={i} className="border-t border-neutral-100 px-3.5 py-2 first:border-t-0 dark:border-neutral-800">
          <a href={it.l} target="_blank" rel="noopener noreferrer" data-s={it.s} data-k={sec} className="text-[14.5px] font-semibold hover:underline">{(tr && tr[it.l]) || it.t}</a>
          <span className="db-meta mt-0.5 block text-[11.5px] text-neutral-500"><span className="font-bold">{it.s}</span>{rel(it.d) ? ` · ${rel(it.d)}` : ''}</span>
        </li>
      ))}
    </ul>
  )
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'your', 'what', 'why', 'how', 'new', 'los', 'las', 'una', 'por', 'con', 'para', 'que', 'del', 'este', 'esta', 'como'])
function toks(t: string): string[] {
  return (t || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams)?.view
  const email = await authedEmail()
  const host = (await headers()).get('host') || 'tryjunoapp.com'
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(`${proto}://${host}/`)}`
  const [cache, macro, topics, videos] = await Promise.all([
    getFeedCache(),
    getMacroCache(),
    email ? getUserTopics(email) : Promise.resolve([]),
    email ? getUserVideos(email) : Promise.resolve([]),
  ])
  const empty = Object.keys(cache).length === 0
  const prefs = email ? await getPrefs(email) : { lang: 'en', layout: {} as any }
  const lang = prefs.lang
  const prefsLayout = prefs.layout || {}
  const hidden: string[] = prefsLayout.hidden || []
  const label = (s: { key: string; label: string }) => (lang === 'es' ? ES_LABELS[s.key] || s.label : s.label)

  // Spanish headline translation for non-native news sections (cached per link).
  let tr: Record<string, string> = {}
  if (lang === 'es' && email && !empty) {
    const titleByLink: Record<string, string> = {}
    for (const s of SECTIONS) {
      if (ES_NATIVE.has(s.key) || WATCH(s.key)) continue
      for (const it of (cache[s.key] || []).slice(0, 12)) titleByLink[it.l] = it.t
    }
    const links = Object.keys(titleByLink)
    const cached = await getTranslations(links)
    const missing = links.filter((l) => !cached[l]).slice(0, 60)
    if (missing.length) {
      const out = await translateTitles(missing.map((l) => titleByLink[l]))
      const fresh: Record<string, string> = {}
      missing.forEach((l, i) => { if (out[i]) fresh[l] = out[i] })
      await setTranslations(fresh)
      tr = { ...cached, ...fresh }
    } else tr = cached
  }

  // "What happened today" — one mixed, recent (48h), de-duped feed across all sections.
  let todayItems: Item[] = []
  if (view === 'today') {
    const now = Date.now()
    const pools: Item[][] = [...(Object.values(cache) as Item[][]), ...topics.map((t) => t.items || []), ...videos.map((v) => v.items || [])]
    const all = pools.flat().filter((it) => it.d && now - Date.parse(it.d) < 48 * 3600 * 1000)
    all.sort((a, b) => (Date.parse(b.d!) || 0) - (Date.parse(a.d!) || 0))
    const seen = new Set<string>()
    for (const it of all) {
      const k = it.l.includes('youtube.com/watch') ? it.l : it.l.split('?')[0]
      if (!seen.has(k)) { seen.add(k); todayItems.push(it) }
    }
    todayItems = todayItems.slice(0, 40)
  }

  // For You — rank cached items by the user's learned click profile.
  let foryou: Item[] = []
  if (email && !empty) {
    const p: any = await getProfile(email)
    if (Object.keys(p.s || {}).length || Object.keys(p.k || {}).length) {
      const flat: { it: Item; k: string }[] = []
      for (const [k, items] of Object.entries(cache)) for (const it of items as Item[]) flat.push({ it, k })
      const score = ({ it, k }: { it: Item; k: string }) => {
        let sc = 3 * (p.k?.[k] || 0) + 2 * (p.s?.[it.s] || 0)
        for (const w of toks(it.t)) sc += p.w?.[w] || 0
        return sc
      }
      foryou = flat.map((x) => [score(x), x] as [number, { it: Item; k: string }])
        .filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, x]) => x.it)
    }
  }

  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex flex-wrap items-baseline gap-4 border-b border-neutral-900 px-7 py-4 dark:border-neutral-100">
        <h1 className="text-2xl font-bold tracking-tight">▦ Daily Brief</h1>
        <span className="text-sm text-neutral-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <div className="ml-auto flex items-center gap-3">
          <a href={view === 'today' ? '/news' : '/news?view=today'} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">
            {view === 'today' ? '← back' : `📰 ${lang === 'es' ? 'Qué pasó hoy' : 'What happened today'}`}
          </a>
          {email && <LangToggle lang={lang} />}
          <RefreshButton />
          {email ? (
            <a href="/api/auth/signout" className="text-sm text-neutral-500 hover:underline">Sign out ({email.split('@')[0]})</a>
          ) : (
            <a href={signInHref} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">Sign in</a>
          )}
        </div>
      </header>

      <AIBar authed={!!email} signInHref={signInHref} />
      {email && <SetupChat />}
      {email && <VideoBox />}

      {macro.length > 0 && (
        <div className="flex border-b border-neutral-200 px-7 dark:border-neutral-800">
          {macro.map((m, i) => (
            <div key={i} className="flex-1 border-r border-neutral-200 py-2.5 last:border-r-0 dark:border-neutral-800">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">{m.label}</div>
              <div className={`text-[17px] font-bold ${m.good === true ? 'text-green-700' : m.good === false ? 'text-red-700' : ''}`}>{m.value}</div>
              <div className="text-[10.5px] text-neutral-500">{m.sub}</div>
            </div>
          ))}
        </div>
      )}

      {view === 'today' ? (
        <div className="mx-auto max-w-3xl px-7 py-5">
          {email && <ClickTracker />}
          <section className="rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
            <h2 className="border-b border-neutral-200 bg-neutral-900 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">📰 {lang === 'es' ? 'Qué pasó hoy' : 'What happened today'}</h2>
            <Items items={todayItems} cap={40} tr={tr} sec="today" />
          </section>
        </div>
      ) : empty ? (
        <div className="px-7 py-16 text-center text-neutral-500">
          <p>No news cached yet.</p>
          <RefreshButton label="Load the news ▸" />
        </div>
      ) : (
        <div id="db-grid" className="px-7 py-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: '18px', gridAutoRows: '8px', alignItems: 'start' }}>
          {email && <ClickTracker />}
          {email && <LayoutEnhancer initial={(prefsLayout?.grid as any) || {}} />}

          {/* For You — learned from your clicks */}
          {foryou.length > 0 && (
            <section data-id="foryou" className="db-card break-inside-avoid rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
              <h2 className="border-b border-neutral-200 bg-neutral-900 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">★ {lang === 'es' ? 'Para ti' : 'For You'}</h2>
              <Items items={foryou} cap={8} tr={tr} sec="foryou" />
            </section>
          )}

          {/* Pinned topic sections (signed in) */}
          {topics.map((t) => (
            <section key={t.query} data-id={'topic_' + t.query.toLowerCase().replace(/[^a-z0-9]+/g, '_')} className="db-card break-inside-avoid rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
              <h2 className="flex items-center justify-between border-b border-neutral-200 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide dark:border-neutral-800">
                <span>📰 {t.query}</span>
                <RemoveTopic query={t.query} />
              </h2>
              {t.brief && <div className="whitespace-pre-line border-b border-neutral-100 bg-neutral-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed dark:border-neutral-800 dark:bg-neutral-900/60">{t.brief}</div>}
              <Items items={t.items || []} cap={10} sec="topic" />
            </section>
          ))}

          {/* User video sections (created via "Add a video section") */}
          {videos.map((v) => (
            <section key={v.key} data-id={v.key} className="db-card break-inside-avoid rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
              <h2 className="flex items-center justify-between border-b border-neutral-200 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide dark:border-neutral-800">
                <span>🎬 {v.label}</span>
                <RemoveVideo k={v.key} />
              </h2>
              <Items items={v.items || []} cap={14} sec={v.key} />
            </section>
          ))}

          {/* Standard sections */}
          {SECTIONS.filter((s) => (cache[s.key] || []).length && !hidden.includes(s.key)).map((s) => (
            <section key={s.key} data-id={s.key} className="db-card break-inside-avoid rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="flex items-center justify-between border-b border-neutral-900 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide dark:border-neutral-100">
                <span>{ICON(s.key)} {label(s)}</span>
                {email && <HideSection k={s.key} />}
              </h2>
              {email && !WATCH(s.key) && <SectionBrief section={s.key} />}
              <Items items={cache[s.key]} tr={tr} sec={s.key} />
            </section>
          ))}
        </div>
      )}

      <footer className="px-7 pb-10 text-xs text-neutral-500">
        {email ? (<>Signed in as {email}{hidden.length ? <> · <ShowHidden count={hidden.length} /></> : null}</>) : (<>Free news for everyone · <a href={signInHref} className="underline">sign in</a> for AI briefings, custom topics & video sections.</>)}
      </footer>
    </main>
  )
}
