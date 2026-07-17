import { getFeedCache, getSectionBriefs, getSectionInstructions, getStatsCache, getUserTopics, getUserVideos, getUserMonitors, getPrefs, getProfile, getTranslations, setTranslations, feedCacheUpdatedAt, getSourceTiers, getCustomTickers } from '@/lib/news/store'
import { SECTIONS, ES_NATIVE, DEFAULT_STATS, STATS_CATALOG, COUNTRY_ORDER, flagFor, type Item } from '@/lib/news/feeds'
import MarketMenu from './MarketMenu'
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
import VcMapDelegate from './VcMapDelegate'
import ListenButton from './ListenButton'
import LayoutEnhancer from './LayoutEnhancer'
import ShowHidden from './ShowHidden'
import LastUpdated from './LastUpdated'
import SourcesManager from './SourcesManager'
import ResetForYou from './ResetForYou'
import SectionTune from './SectionTune'
import Onboarding from './Onboarding'
import Suggest from './Suggest'
import DigestToggle from './DigestToggle'
import MonitorBar from './MonitorBar'
import MonitorControls from './MonitorControls'
import MonitorCardView from './MonitorCardView'
import AutoRefresh from './AutoRefresh'

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

function Items({ items, cap = 12, tr, sec, vcMap }: { items: Item[]; cap?: number; tr?: Record<string, string>; sec?: string; vcMap?: boolean }) {
  return (
    <ul>
      {items.slice(0, cap).map((it, i) => (
        <li key={i} className="border-t border-neutral-100 px-3.5 py-2 first:border-t-0 dark:border-neutral-800">
          <a href={it.l} target="_blank" rel="noopener noreferrer" data-s={it.s} data-k={sec} className="text-[14.5px] font-semibold hover:underline">{(tr && tr[it.l]) || it.t}</a>
          <span className="db-meta mt-0.5 block text-[11.5px] text-neutral-500">
            <span className="font-bold">{it.s}</span>{rel(it.d) ? ` · ${rel(it.d)}` : ''}
            {vcMap && <> · <button className="db-vcmap cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-100" data-t={it.t} title="Map this company on VC Constellation (queued for tonight's enrichment)">◆ map</button></>}
          </span>
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
  const [cache, sectionBriefs, sectionInstructions, statsMap, topics, videos, updatedAt, sourceTiers, monitors, customTickers] = await Promise.all([
    getFeedCache(),
    getSectionBriefs(),
    email ? getSectionInstructions() : Promise.resolve({} as Record<string, string>),
    getStatsCache(),
    email ? getUserTopics(email) : Promise.resolve([]),
    email ? getUserVideos(email) : Promise.resolve([]),
    feedCacheUpdatedAt(),
    getSourceTiers(),
    email ? getUserMonitors(email) : Promise.resolve([]),
    getCustomTickers(),
  ])
  const empty = Object.keys(cache).length === 0
  // Global source tiers: drop muted sources everywhere; float ⭐ trusted sources to the top.
  const mutedSet = new Set(sourceTiers.muted)
  const topSet = new Set(sourceTiers.top)
  const tiered = (items: Item[]): Item[] => {
    const kept = items.filter((it) => !mutedSet.has(it.s))
    return topSet.size ? [...kept.filter((it) => topSet.has(it.s)), ...kept.filter((it) => !topSet.has(it.s))] : kept
  }
  const allSources = email ? Array.from(new Set(Object.values(cache).flat().map((it) => (it as Item).s))).filter(Boolean).sort((a, b) => a.localeCompare(b)) : []
  // A monitored item is "NEW" if we first saw it in the last 24h.
  const isNew = (it: { first?: string }) => !!it.first && Date.now() - Date.parse(it.first) < 24 * 3600 * 1000
  const prefs = email ? await getPrefs(email) : { lang: 'en', layout: {} as any }
  const lang = prefs.lang
  const prefsLayout = prefs.layout || {}
  const hidden: string[] = prefsLayout.hidden || []
  const selectedStats: string[] = prefsLayout.stats || DEFAULT_STATS
  // Catalog = built-in stats + user-added tickers (grouped under "Stocks").
  const tickerCatalog = customTickers.map((t) => ({ id: `tk_${t.symbol.toLowerCase()}`, label: t.label || t.symbol, country: 'Stocks', group: 'Stocks' }))
  const fullCatalog = [...STATS_CATALOG.map((d) => ({ id: d.id, label: d.label, country: d.country, group: d.group })), ...tickerCatalog]
  const idCountry: Record<string, string> = {}
  for (const d of fullCatalog) idCountry[d.id] = d.country
  const strip = selectedStats.filter((id) => statsMap[id]).map((id) => ({ id, flag: flagFor(idCountry[id] || ''), ...statsMap[id] }))
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
      if (mutedSet.has(it.s)) continue
      const k = it.l.includes('youtube.com/watch') ? it.l : it.l.split('?')[0]
      if (!seen.has(k)) { seen.add(k); todayItems.push(it) }
    }
    todayItems = todayItems.slice(0, 40)
  }

  // Audio morning brief: a spoken script from the section briefs + top headlines,
  // read client-side by speechSynthesis (free, offline-capable). Built only for the Today view.
  let listenScript = ''
  if (view === 'today' && !empty) {
    const dateSpoken = new Date().toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    const parts: string[] = [
      lang === 'es' ? `Buenos días. Hoy es ${dateSpoken}. Este es tu Daily Brief.` : `Good morning. It's ${dateSpoken}. This is your Daily Brief.`,
    ]
    for (const s of SECTIONS) {
      if (WATCH(s.key) || hidden.includes(s.key)) continue
      const brief = sectionBriefs[s.key]
      const tops = tiered(cache[s.key] || []).slice(0, brief ? 1 : 2).map((it) => (tr[it.l] || it.t))
      if (!brief && !tops.length) continue
      parts.push(
        `${label(s)}. ` + (brief ? `${brief} ` : '') +
        (tops.length ? (lang === 'es' ? 'Titular: ' : 'Top story: ') + tops.join('. ') : ''),
      )
    }
    parts.push(lang === 'es' ? 'Eso es todo. Buen día.' : "That's your brief. Have a good one.")
    listenScript = parts.join('\n')
  }

  // For You — rank cached items by the user's learned click profile.
  let foryou: Item[] = []
  let learned = ''       // human-readable "here's what it picked up" line
  let learnedClicks = 0
  if (email && !empty) {
    const p: any = await getProfile(email)
    if (Object.keys(p.s || {}).length || Object.keys(p.k || {}).length) {
      const flat: { it: Item; k: string }[] = []
      for (const [k, items] of Object.entries(cache)) for (const it of items as Item[]) if (!mutedSet.has(it.s)) flat.push({ it, k })
      const score = ({ it, k }: { it: Item; k: string }) => {
        let sc = 3 * (p.k?.[k] || 0) + 2 * (p.s?.[it.s] || 0)
        for (const w of toks(it.t)) sc += p.w?.[w] || 0
        return sc
      }
      foryou = flat.map((x) => [score(x), x] as [number, { it: Item; k: string }])
        .filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 10).map(([, x]) => x.it)
      // Surface what it learned: top sources + top keywords, so personalization is legible/tunable.
      const top = (o: Record<string, number> = {}, n = 3) =>
        Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
      learnedClicks = Object.values(p.s || {}).reduce((a: number, b: any) => a + (b || 0), 0)
      const parts = [...top(p.s, 3), ...top(p.w, 3)]
      if (parts.length) learned = parts.join(' · ')
    }
  }

  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <AutoRefresh />
      <header className="db-masthead flex flex-wrap items-baseline gap-4 border-b border-neutral-900 px-7 py-4 dark:border-neutral-100">
        <h1 className="text-2xl font-bold tracking-tight"><span className="db-the">The</span> Daily Brief</h1>
        <span className="db-dateline text-sm text-neutral-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <LastUpdated iso={updatedAt} lang={lang} />
        <div className="ml-auto flex items-center gap-3">
          <a href={view === 'today' ? '/news' : '/news?view=today'} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">
            {view === 'today' ? '← back' : (lang === 'es' ? 'Qué pasó hoy' : 'What happened today')}
          </a>
          {email && (
            <a href="/news/globe" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-bold transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
              🌍 {lang === 'es' ? 'Explorador' : 'Globe'}
            </a>
          )}
          {email && <LangToggle lang={lang} />}
          <RefreshButton />
          {email ? (
            <a href="/api/auth/signout" className="text-sm text-neutral-500 hover:underline">Sign out ({email.split('@')[0]})</a>
          ) : (
            <a href={signInHref} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">Sign in</a>
          )}
        </div>
      </header>

      <div className="border-b border-neutral-200 bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-900/40">
        <AIBar authed={!!email} signInHref={signInHref} />
        {email && <MonitorBar />}
        {email && <VideoBox />}
        {email && <SetupChat />}
      </div>

      {(strip.length > 0 || email) && (
        <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800">
          <div className="db-ticker-wrap relative flex-1 overflow-hidden py-2.5">
            <div className="db-ticker-track">
              {(strip.length ? [...strip, ...strip] : []).map((m, i) => (
                <span key={i} className="mx-6 inline-flex items-baseline gap-2 whitespace-nowrap">
                  {m.flag && <span className="text-[12px]" title={idCountry[m.id]}>{m.flag}</span>}
                  <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{m.label}</span>
                  <span className={`text-[15px] font-bold ${m.good === true ? 'text-green-700' : m.good === false ? 'text-red-700' : ''}`}>{m.value}</span>
                  {m.sub && <span className="text-[11px] text-neutral-500">{m.sub}</span>}
                </span>
              ))}
            </div>
          </div>
          {email && (
            <div className="border-l border-neutral-200 px-3 dark:border-neutral-800">
              <MarketMenu
                selected={selectedStats}
                catalog={fullCatalog}
                stats={statsMap}
                countryOrder={[...COUNTRY_ORDER, 'Stocks']}
                lang={lang}
              />
            </div>
          )}
          <style>{`.db-ticker-track{display:inline-flex;width:max-content;animation:db-ticker 55s linear infinite}.db-ticker-wrap:hover .db-ticker-track{animation-play-state:paused}@keyframes db-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        </div>
      )}

      {view === 'today' ? (
        <div className="mx-auto max-w-3xl px-7 py-5">
          {email && <ClickTracker />}
          <section className="rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
            <h2 className="flex items-center justify-between border-b border-neutral-200 bg-neutral-900 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900"><span>{lang === 'es' ? 'Qué pasó hoy' : 'What happened today'}</span><ListenButton text={listenScript} lang={lang} small /></h2>
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
          {email && <VcMapDelegate />}
          <LayoutEnhancer initial={(prefsLayout?.grid as any) || {}} authed={!!email} />

          {/* First-run onboarding — only until the user adds a topic/video or dismisses it */}
          {email && topics.length === 0 && videos.length === 0 && monitors.length === 0 && !prefsLayout.onboarded && <Onboarding lang={lang} />}

          {/* For You — learned from your clicks */}
          {foryou.length > 0 && (
            <section data-id="foryou" className="db-card break-inside-avoid rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
              <h2 className="flex items-center justify-between border-b border-neutral-200 bg-neutral-900 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">
                <span>{lang === 'es' ? 'Para ti' : 'For You'}</span>
                <ResetForYou />
              </h2>
              {learned && (
                <div className="border-b border-neutral-100 bg-neutral-50 px-3.5 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/60">
                  {lang === 'es' ? 'Aprendido de' : 'Learned from'} {learnedClicks} {lang === 'es' ? 'clics' : 'clicks'}: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{learned}</span>
                </div>
              )}
              <Items items={foryou} cap={10} tr={tr} sec="foryou" />
            </section>
          )}

          {/* Monitors — developing situations, newest developments flagged NEW */}
          {monitors.map((m) => {
            const mItems = (m.items || []).filter((it) => !mutedSet.has(it.s))
            return (
              <section key={m.query} data-id={'monitor_' + m.query.toLowerCase().replace(/[^a-z0-9]+/g, '_')} className="db-card break-inside-avoid rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
                <h2 className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide dark:border-neutral-800">
                  <span>{m.query}</span>
                  <MonitorControls query={m.query} lang={lang} alerts={!!m.alerts} />
                </h2>
                <MonitorCardView card={m.card} lang={lang} />
                {m.brief && (
                  <div className="border-b border-neutral-100 bg-neutral-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed dark:border-neutral-800 dark:bg-neutral-900/60">
                    <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400">{lang === 'es' ? 'En desarrollo' : 'Developing'}</span>{m.brief}
                  </div>
                )}
                <ul>
                  {mItems.slice(0, 12).map((it, i) => (
                    <li key={i} className="border-t border-neutral-100 px-3.5 py-2 first:border-t-0 dark:border-neutral-800">
                      <a href={it.l} target="_blank" rel="noopener noreferrer" data-s={it.s} data-k="monitor" className="text-[14.5px] font-semibold hover:underline">{it.t}</a>
                      {isNew(it) && <span className="ml-1.5 align-middle rounded bg-red-600 px-1 py-px text-[9px] font-bold text-white">NEW</span>}
                      <span className="db-meta mt-0.5 block text-[11.5px] text-neutral-500"><span className="font-bold">{it.s}</span>{rel(it.d) ? ` · ${rel(it.d)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          {/* Pinned topic sections (signed in) */}
          {topics.map((t) => (
            <section key={t.query} data-id={'topic_' + t.query.toLowerCase().replace(/[^a-z0-9]+/g, '_')} className="db-card break-inside-avoid rounded-lg border border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-900">
              <h2 className="flex items-center justify-between border-b border-neutral-200 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide dark:border-neutral-800">
                <span>{t.query}</span>
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
                <span>{v.label}</span>
                <RemoveVideo k={v.key} />
              </h2>
              <Items items={v.items || []} cap={14} sec={v.key} />
            </section>
          ))}

          {/* Standard sections */}
          {SECTIONS.filter((s) => (cache[s.key] || []).length && !hidden.includes(s.key)).map((s) => (
            <section key={s.key} data-id={s.key} className="db-card break-inside-avoid rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="flex items-center justify-between gap-2 border-b border-neutral-900 px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-wide dark:border-neutral-100">
                <span>{label(s)}</span>
                {email && <SectionTune section={s.key} instruction={sectionInstructions[s.key] || ''} lang={lang} />}
              </h2>
              {sectionBriefs[s.key] && (
                <div className="border-b border-neutral-100 bg-neutral-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed dark:border-neutral-800 dark:bg-neutral-900/60">
                  <span className="mr-1.5 font-bold uppercase tracking-wide text-[10px] text-neutral-400">{lang === 'es' ? 'Lo importante' : "What matters"}</span>
                  {sectionBriefs[s.key]}
                  <span className="ml-1.5"><ListenButton text={`${label(s)}. ${sectionBriefs[s.key]}`} lang={lang} small /></span>
                </div>
              )}
              {email && !WATCH(s.key) && !sectionBriefs[s.key] && <SectionBrief section={s.key} />}
              <Items items={tiered(cache[s.key])} tr={tr} sec={s.key} vcMap={!!email && s.key === 'funding'} />
            </section>
          ))}
        </div>
      )}

      <footer className="px-7 pb-10 text-xs text-neutral-500">
        {email && <div className="mb-4 max-w-xl"><Suggest lang={lang} /></div>}
        {email ? (<>Signed in as {email} · <DigestToggle on={!!prefsLayout.digest} lang={lang} /> · <SourcesManager sources={allSources} top={sourceTiers.top} muted={sourceTiers.muted} lang={lang} />{hidden.length ? <> · <ShowHidden count={hidden.length} /></> : null}</>) : (<>Free news for everyone · <a href={signInHref} className="underline">sign in</a> for AI briefings, custom topics & video sections.</>)}
      </footer>
    </main>
  )
}
