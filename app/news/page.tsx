import { getFeedCache, getSectionBriefs, getSectionInstructions, getStatsCache, getUserTopics, getUserMonitors, getPrefs, getProfile, getTranslations, setTranslations, feedCacheUpdatedAt, getSourceTiers, getCustomTickers, type VideoSection } from '@/lib/news/store'
import { SECTIONS, ES_NATIVE, DEFAULT_STATS, STATS_CATALOG, COUNTRY_ORDER, interleaveBySource, type Item } from '@/lib/news/feeds'
import { clusterItems, scoreClusters, pickTop, leadDek, isSportsLabel, youtubeId, dayKey, linkKey, type Pooled, type Cluster, type Profile } from '@/lib/news/rank'
import { translateTitles } from '@/lib/news/ai'
import { authedEmail } from '@/lib/news/auth'
import { headers } from 'next/headers'
import { Row, Lead, VideoRow, MarketTile, MarketChip, IconSprite, type Tile } from './parts'
import type { SavedItem } from './savedStore'
import MarketMenu from './MarketMenu'
import RefreshButton from './RefreshButton'
import CommandBar from './CommandBar'
import AvatarMenu from './AvatarMenu'
import SectionMenu from './SectionMenu'
import BriefingCard from './BriefingCard'
import ReaderState from './ReaderState'
import Clamp from './Clamp'
import { SavedList, SavedRail } from './Saved'
import LangToggle from './LangToggle'
import ClickTracker from './ClickTracker'
import VcMapDelegate from './VcMapDelegate'
import SwRegister from './SwRegister'
import OfflineRibbon from './OfflineRibbon'
import LastUpdated from './LastUpdated'
import SourcesManager from './SourcesManager'
import ResetForYou from './ResetForYou'
import Suggest from './Suggest'
import DigestToggle from './DigestToggle'
import ShowHidden from './ShowHidden'
import MonitorControls from './MonitorControls'
import MonitorCardView from './MonitorCardView'
import AutoRefresh from './AutoRefresh'
import Toaster from './Toaster'
import SectionDnD from './SectionDnD'
import Tour from './Tour'
import { GripIcon } from './Icons'
import HtmlLang from './HtmlLang'

export const dynamic = 'force-dynamic'

type Tab = 'today' | 'saved' | 'monitors' | 'videos'
type Kind = 'curated' | 'topic' | 'video' | 'uservideo'
type Block = { id: string; key: string; label: string; kind: Kind; items: Item[]; brief?: string; sports: boolean }

const WATCH = (k: string) => k.startsWith('watch_') || k.startsWith('vt_')
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_')
const DAY = 86400000
const ES_LABELS: Record<string, string> = {
  ai: 'IA y Tecnología', funding: 'Financiamiento · VC · IPOs', markets: 'Mercados y Última Hora', geopolitics: 'Geopolítica',
  longread: 'Análisis', chile: 'Chile / LatAm', founder: 'Fundadores · Lanzamientos',
  reddit: 'Reddit / HN', watch_ai: 'IA/Tech — recién subido', watch_vc: 'VC y Startups — recién subido', watch_golf: 'Golf — recién subido',
}
const TABS: { id: Tab; en: string; es: string }[] = [
  { id: 'today', en: 'Today', es: 'Hoy' },
  { id: 'saved', en: 'Saved', es: 'Guardados' },
  { id: 'monitors', en: 'Monitors', es: 'Monitores' },
  { id: 'videos', en: 'Videos', es: 'Videos' },
]
const tabHref = (t: Tab) => (t === 'today' ? '/news' : `/news?tab=${t}`)

// Same video listed twice (re-uploads, the same id under two channels, one title twice): keep one.
function dedupeVideos(items: Item[], maxAgeDays?: number): Item[] {
  const seen = new Set<string>()
  const out: Item[] = []
  const now = Date.now()
  for (const it of items) {
    if (maxAgeDays !== undefined) {
      const t = Date.parse(it.d || '')
      if (isNaN(t) || now - t > maxAgeDays * DAY) continue
    }
    const k1 = youtubeId(it.l) || linkKey(it.l)
    const k2 = it.t.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (seen.has(k1) || seen.has(k2)) continue
    seen.add(k1); seen.add(k2)
    out.push(it)
  }
  return out
}

// Topic briefs come back as three headed parts; the collapsed dek starts at the first bullet.
const topicDek = (b: string) => b.replace(/^[^\n]*:\s*\n/, '').replace(/^- /gm, '• ').trim()

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string }> }) {
  const sp = (await searchParams) || {}
  const tab: Tab = (['saved', 'monitors', 'videos'] as const).includes(sp.tab as any) ? (sp.tab as Tab) : 'today'
  const email = await authedEmail()
  const host = (await headers()).get('host') || 'tryjunoapp.com'
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const signInHref = `/api/auth/signin?callbackUrl=${encodeURIComponent(`${proto}://${host}/`)}`
  const [cache, sectionBriefs, sectionInstructions, statsMap, topics, updatedAt, sourceTiers, monitors, customTickers, prefs, profile] = await Promise.all([
    getFeedCache(),
    getSectionBriefs(),
    email ? getSectionInstructions() : Promise.resolve({} as Record<string, string>),
    getStatsCache(),
    email ? getUserTopics(email) : Promise.resolve([]),
    feedCacheUpdatedAt(),
    getSourceTiers(),
    email ? getUserMonitors(email) : Promise.resolve([]),
    getCustomTickers(),
    email ? getPrefs(email) : Promise.resolve({ lang: 'en', layout: {} as any }),
    email ? getProfile(email) : Promise.resolve(null),
  ])
  const lang = prefs.lang
  const es = lang === 'es'
  const L = prefs.layout || {}
  const hidden: string[] = L.hidden || []
  const mini = new Set<string>(L.grid?.mini || [])
  const order: string[] = L.grid?.order || []
  const videos: VideoSection[] = email ? (L.videos || []) : []
  const saved: SavedItem[] = email ? (L.saved || []) : []
  const empty = Object.keys(cache).length === 0

  // Global source tiers: muted sources vanish everywhere; trusted ones float up.
  const mutedSet = new Set(sourceTiers.muted)
  const topSet = new Set(sourceTiers.top)
  const tiered = (items: Item[]): Item[] => {
    const kept = items.filter((it) => !mutedSet.has(it.s))
    return topSet.size ? [...kept.filter((it) => topSet.has(it.s)), ...kept.filter((it) => !topSet.has(it.s))] : kept
  }
  const allSources = email ? Array.from(new Set(Object.values(cache).flat().map((it) => (it as Item).s))).filter(Boolean).sort((a, b) => a.localeCompare(b)) : []
  const isNew = (it: { first?: string }) => !!it.first && Date.now() - Date.parse(it.first) < DAY

  // ---- blocks: every section-like thing on the desk ----
  const blocks: Block[] = []
  for (const s of SECTIONS) {
    const items = cache[s.key] || []
    if (!items.length) continue
    const vid = WATCH(s.key)
    blocks.push({ id: s.key, key: s.key, label: es ? ES_LABELS[s.key] || s.label : s.label, kind: vid ? 'video' : 'curated', items: tiered(items), brief: vid ? undefined : sectionBriefs[s.key], sports: isSportsLabel(s.key, s.label) })
  }
  for (const t of topics) blocks.push({ id: 'topic_' + slug(t.query), key: 'topic', label: t.query, kind: 'topic', items: tiered(t.items || []), brief: t.brief, sports: isSportsLabel('', t.query) })
  for (const v of videos) blocks.push({ id: v.key, key: v.key, label: v.label, kind: 'uservideo', items: v.items || [], sports: isSportsLabel(v.key, v.label) })
  // Respect the saved section order; anything new (a fresh topic, Geopolitics) leads.
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? -1 : i }
  const visible = blocks.filter((b) => !hidden.includes(b.id))
    .map((b, i) => ({ b, i })).sort((x, y) => (rank(x.b.id) - rank(y.b.id)) || (x.i - y.i)).map((x) => x.b)
  const newsBlocks = visible.filter((b) => b.kind === 'curated' || b.kind === 'topic')
  // Sports sections show like any other; a reader who doesn't want one hides or removes it.
  const todayBlocks = newsBlocks
  const videoBlocks = visible.filter((b) => b.kind === 'video' || b.kind === 'uservideo')

  // ---- Top 7: cluster the same story across sections, score, pick with diversity caps ----
  const pool: Pooled[] = []
  for (const b of todayBlocks) b.items.slice(0, 30).forEach((it, i) => pool.push({ ...it, k: b.id, rank: i }))
  const clusters = clusterItems(pool, todayBlocks.map((b) => b.id))
  scoreClusters(clusters, (profile as Profile) || null)
  const top = empty ? [] : pickTop(clusters, 7)
  const topIds = new Set(top.map((c) => c.id))
  const clusterOf = new Map<string, Cluster>()
  for (const c of clusters) for (const it of c.items) clusterOf.set(linkKey(it.l), c)
  const blockLabel = (id: string) => blocks.find((b) => b.id === id)?.label || ''
  const profKey = (b: Block) => (b.kind === 'topic' ? 'topic' : b.key)

  // Rows per section: each story once (in its home section), Top 7 stories not repeated.
  const shown = new Set<number>()
  const rowsFor = (b: Block) => {
    const out: { it: Item; extra: number }[] = []
    const seen = new Set<string>()
    for (const it of b.items) {
      const lk = linkKey(it.l)
      if (seen.has(lk)) continue
      seen.add(lk)
      const c = clusterOf.get(lk)
      if (c) {
        if (topIds.has(c.id) || c.home !== b.id || shown.has(c.id)) continue
        shown.add(c.id)
        out.push({ it, extra: c.sources.length - 1 })
      } else out.push({ it, extra: 0 })
      if (out.length >= 16) break
    }
    return out
  }
  const sectionRows = new Map(todayBlocks.map((b) => [b.id, rowsFor(b)]))

  // ---- Spanish headlines (cached per link; only what's on screen) ----
  let tr: Record<string, string> = {}
  let untranslated = 0 // headlines left in their original language (shown as a quiet note)
  if (es && email && !empty) {
    const titleByLink: Record<string, string> = {}
    for (const c of top) titleByLink[c.best.l] = c.best.t
    for (const b of todayBlocks) {
      if (b.kind === 'curated' && ES_NATIVE.has(b.key)) continue
      for (const r of (sectionRows.get(b.id) || []).slice(0, 8)) titleByLink[r.it.l] = r.it.t
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
    untranslated = links.filter((l) => !tr[l]).length
  }
  const T = (it: Item) => tr[it.l] || it.t

  // ---- briefing card ----
  const bday = dayKey()
  const cachedBrief = L.briefing && L.briefing.day === bday && L.briefing.lang === lang && Array.isArray(L.briefing.bullets) && L.briefing.bullets.length ? L.briefing : null
  const topPayload = top.map((c) => ({ t: T(c.best), l: c.best.l, s: c.best.s }))
  const dateSpoken = new Date().toLocaleDateString(es ? 'es' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Los_Angeles' })
  const listenScript = [
    es ? `Buenos días. Hoy es ${dateSpoken}. Este es tu Daily Brief.` : `Good morning. It's ${dateSpoken}. This is your Daily Brief.`,
    ...(cachedBrief ? cachedBrief.bullets.map((b: { t: string }) => b.t) : []),
    ...(top.length ? [(es ? 'Las principales historias. ' : 'The top stories. ') + topPayload.map((x) => x.t).join('. ')] : []),
    ...todayBlocks.filter((b) => b.kind === 'curated' && b.brief).map((b) => `${b.label}. ${b.brief}`),
    es ? 'Eso es todo. Buen día.' : "That's your brief. Have a good one.",
  ].join('\n')

  // ---- For You legibility: what the click learning picked up ----
  const p: Profile | null = profile as Profile | null
  const learnedClicks = p ? Object.values(p.s || {}).reduce((a: number, b: number) => a + (b || 0), 0) : 0

  // ---- videos ----
  const todayVideos = interleaveBySource(
    dedupeVideos(videoBlocks.flatMap((b) => b.items), 7)
      .sort((a, b) => (Date.parse(b.d || '') || 0) - (Date.parse(a.d || '') || 0)),
  ).slice(0, 6)

  // ---- markets ----
  const selectedStats: string[] = (L.stats as string[]) || DEFAULT_STATS
  const tickerCatalog = customTickers.map((t) => ({ id: `tk_${t.symbol.toLowerCase()}`, label: t.label || t.symbol, country: 'Stocks', group: 'Stocks' }))
  const fullCatalog = [...STATS_CATALOG.map((d) => ({ id: d.id, label: d.label, country: d.country, group: d.group })), ...tickerCatalog]
  const defOf = new Map(fullCatalog.map((d) => [d.id, d]))
  const tiles: Tile[] = selectedStats.filter((id) => statsMap[id]).map((id) => ({ ...statsMap[id], id, country: defOf.get(id)?.country || '', group: defOf.get(id)?.group || '' }))

  // ---- monitors ----
  const visMonitors = monitors.filter((m) => !hidden.includes('monitor_' + slug(m.query)))
  const newTotal = visMonitors.reduce((a, m) => a + (m.items || []).filter(isNew).length, 0)

  const dateline = new Date().toLocaleDateString(es ? 'es' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Los_Angeles' })

  const sectionsFor = (list: Block[]) => list.map((b) => {
    const rows = sectionRows.get(b.id) || []
    if (!rows.length) return null
    const isMini = mini.has(b.id)
    const n = isMini ? 3 : 8
    const head = rows.slice(0, n)
    const more = rows.slice(n)
    return (
      <section key={b.id} className="db-sec" data-id={b.id} aria-labelledby={`h-${b.id}`}>
        <h2 className="db-label" id={`h-${b.id}`}>
          <span>{b.label}</span>
          {email && (
            <span className="db-sec-ctl">
              <button type="button" className="db-iconbtn db-grip" aria-label={es ? `Mover ${b.label} (arrastra o usa ↑ ↓)` : `Move ${b.label} (drag, or use ↑ ↓)`} title={es ? 'Arrastra para ordenar' : 'Drag to reorder'}><GripIcon size={14} /></button>
              <SectionMenu id={b.id} kind={b.kind} label={b.label} mini={isMini} instruction={sectionInstructions[b.id] || ''} canBrief={b.kind === 'curated' && !b.brief} lang={lang} />
            </span>
          )}
        </h2>
        {b.brief && !isMini && (
          <Clamp lang={lang}>
            <span className="db-dek-k">{b.kind === 'topic' ? (es ? 'Resumen' : 'Brief') : (es ? 'Lo importante' : 'What matters')}</span>{' '}
            {b.kind === 'topic' ? topicDek(b.brief) : b.brief}
          </Clamp>
        )}
        <ul className="db-rows">
          {head.map(({ it, extra }) => (
            <Row key={it.l} it={it} title={T(it)} k={profKey(b)} extra={extra} es={es}>
              {email && b.key === 'funding' && <button type="button" className="db-vcmap" data-t={it.t} title={es ? 'Mapear en VC Constellation' : "Map this company on VC Constellation (queued for tonight's enrichment)"}>· map</button>}
            </Row>
          ))}
        </ul>
        {more.length > 0 && (
          <details className="db-more">
            <summary>{es ? `${more.length} más` : `${more.length} more`}</summary>
            <ul className="db-rows">
              {more.map(({ it, extra }) => <Row key={it.l} it={it} title={T(it)} k={profKey(b)} extra={extra} es={es} />)}
            </ul>
          </details>
        )}
      </section>
    )
  })

  const lead = top[0]
  // Lead dek: the story's own summary when it has one (not the briefing bullet — that sits
  // directly above and would repeat verbatim).
  const leadDekText = lead ? leadDek(lead) : ''
  const topRow = (c: Cluster) => {
    const b = blocks.find((x) => x.id === c.home)
    return <Row key={c.id} it={c.best} title={T(c.best)} k={b ? profKey(b) : c.home} extra={c.sources.length - 1} section={blockLabel(c.home)} es={es} />
  }
  const leadBlock = lead ? blocks.find((b) => b.id === lead.home) : undefined

  return (
    <main className="db-app" data-tab={tab}>
      <IconSprite />
      <AutoRefresh signedIn={!!email} lang={lang} />
      <Toaster lang={lang} />
      {email && <SectionDnD lang={lang} />}
      {email && <Tour lang={lang} autoStart={!L.onboarded && topics.length === 0 && videos.length === 0 && monitors.length === 0} />}
      <HtmlLang lang={lang} />
      <SwRegister />
      <ReaderState saved={saved} authed={!!email} lang={lang} />
      {email && <ClickTracker />}
      {email && <VcMapDelegate />}

      <header className="db-head">
        <div className="db-head-in">
          <a href="/news" className="db-mark" aria-label="The Daily Brief, Today"><span className="db-mark-the">The</span> Daily Brief</a>
          <span className="db-date">{dateline}</span>
          <nav className="db-tabs" aria-label={es ? 'Vistas' : 'Views'}>
            {TABS.map((t) => (
              <a key={t.id} href={tabHref(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                {es ? t.es : t.en}
                {t.id === 'monitors' && newTotal > 0 && <span className="db-tab-n">{newTotal}</span>}
              </a>
            ))}
          </nav>
          <CommandBar authed={!!email} signInHref={signInHref} lang={lang} />
          <div className="db-head-end">
            {email ? (
              <>
                <LangToggle lang={lang} />
                <AvatarMenu email={email} lang={lang} />
              </>
            ) : (
              <a href={signInHref} className="db-btn is-ink">{es ? 'Iniciar sesión' : 'Sign in'}</a>
            )}
          </div>
        </div>
      </header>
      <OfflineRibbon iso={updatedAt} lang={lang} />

      <div className="db-wrap">
        <div className="db-layout">
          <div className="db-main">
            {tab === 'today' && (
              empty ? (
                <div className="db-empty">
                  <p className="db-empty-t">{es ? 'Aún no hay noticias' : 'No news cached yet'}</p>
                  <RefreshButton label={es ? 'Cargar las noticias' : 'Load the news'} lang={lang} />
                </div>
              ) : (
                <>
                  {(tiles.length > 0 || email) && (
                    <div className="db-mchips" aria-label={es ? 'Mercados' : 'Markets'}>
                      {/* Phone: the chips roll by on their own (a second copy makes the loop seamless). */}
                      <div className="db-mchips-view">
                        <div className={`db-mchips-track${tiles.length > 2 ? ' is-rolling' : ''}`} style={{ ['--n' as string]: tiles.length }}>
                          {tiles.map((m) => <MarketChip key={m.id} m={m} es={es} />)}
                          {tiles.length > 2 && <span className="db-mchips-dup" aria-hidden>{tiles.map((m) => <MarketChip key={'d' + m.id} m={m} es={es} />)}</span>}
                        </div>
                      </div>
                      {email && <MarketMenu variant="chip" selected={selectedStats} catalog={fullCatalog} stats={statsMap} countryOrder={[...COUNTRY_ORDER, 'Stocks']} lang={lang} />}
                    </div>
                  )}

                  {es && (!email || untranslated > 0) && (
                    <p className="db-trnote">{email ? 'Algunos titulares siguen en su idioma original.' : 'Titulares en su idioma original. Inicia sesión para traducirlos.'}</p>
                  )}
                  <BriefingCard
                    day={bday}
                    initial={cachedBrief ? cachedBrief.bullets : null}
                    initialAt={cachedBrief ? cachedBrief.at : null}
                    top={topPayload}
                    authed={!!email}
                    lang={lang}
                    listen={listenScript}
                    updatedAt={updatedAt}
                  />

                  {lead && (
                    <section id="db-top" className="db-top" aria-labelledby="db-top-h">
                      <h2 className="db-label" id="db-top-h">
                        <span>{email ? (es ? 'Top 7 para ti' : 'Top 7 for you') : (es ? 'Lo principal' : 'Top stories')}</span>
                        <span className="db-label-note">
                          <span id="db-caught" className="db-caught" hidden />
                          {email && learnedClicks > 0 && <span className="db-tuned">{es ? `Afinado con ${learnedClicks} clics` : `Tuned by ${learnedClicks} clicks`} · <ResetForYou lang={lang} /></span>}
                        </span>
                      </h2>
                      <div className="db-top-grid">
                        <div className="db-top-l">
                          <Lead it={lead.best} title={T(lead.best)} dek={leadDekText} k={leadBlock ? profKey(leadBlock) : lead.home} extra={lead.sources.length - 1} section={blockLabel(lead.home)} es={es} />
                          <ul className="db-rows is-second">{top.slice(1, 3).map(topRow)}</ul>
                        </div>
                        <ul className="db-rows is-top">{top.slice(3).map(topRow)}</ul>
                      </div>
                    </section>
                  )}

                  {todayVideos.length > 0 && (
                    <section className="db-strip" aria-labelledby="db-strip-h">
                      <h2 className="db-label" id="db-strip-h"><span>{es ? 'Nuevo en tus canales' : 'New from your channels'}</span><a className="db-label-link" href="/news?tab=videos">{es ? 'Todos los videos' : 'All videos'}</a></h2>
                      <div className="db-strip-row">
                        {todayVideos.map((it) => <VideoRow key={it.l} it={it} k="video" es={es} card />)}
                      </div>
                    </section>
                  )}

                  <div className="db-sections-bar">
                    <span className="db-sections-t">{es ? 'Secciones' : 'Sections'}</span>
                  </div>
                  <div className="db-sections">{sectionsFor(todayBlocks)}</div>
                </>
              )
            )}

            {tab === 'saved' && (
              <>
                <h1 className="db-page-t">{es ? 'Guardados' : 'Saved'}</h1>
                <SavedList initial={saved} authed={!!email} lang={lang} />
              </>
            )}

            {tab === 'monitors' && (
              <>
                <h1 className="db-page-t">{es ? 'Monitores' : 'Monitors'}</h1>
                {!email ? (
                  <div className="db-empty"><p className="db-empty-t">{es ? 'Los monitores requieren sesión' : 'Monitors need you signed in'}</p><p>{es ? 'Sigue una historia en desarrollo y marca lo nuevo.' : 'Track a developing story and see what is new since you last looked.'}</p><a className="db-btn is-ink" href={signInHref}>{es ? 'Iniciar sesión' : 'Sign in'}</a></div>
                ) : visMonitors.length === 0 ? (
                  <div className="db-empty"><p className="db-empty-t">{es ? 'Sin monitores' : 'No monitors yet'}</p><p>{es ? 'Escribe una situación en la barra de comandos y elige Monitorear. Las novedades se marcan como NUEVO.' : 'Type a situation in the command bar and pick Monitor: an earnings date, an election, a deal. New developments get flagged.'}</p></div>
                ) : (
                  <div className="db-sections is-monitors">
                    {visMonitors.map((m) => {
                      const items = (m.items || []).filter((it) => !mutedSet.has(it.s))
                      const n = items.filter(isNew).length
                      return (
                        <section key={m.query} className="db-sec" data-id={'m:' + m.query} aria-labelledby={`h-m-${slug(m.query)}`}>
                          <h2 className="db-label" id={`h-m-${slug(m.query)}`}>
                            <span>{m.query}{n > 0 && <span className="db-new">{n} {es ? 'nuevo' : 'new'}</span>}</span>
                            <MonitorControls query={m.query} lang={lang} alerts={!!m.alerts} />
                          </h2>
                          <MonitorCardView card={m.card} lang={lang} />
                          {m.brief && <Clamp lang={lang}><span className="db-dek-k">{es ? 'En desarrollo' : 'Developing'}</span> {m.brief}</Clamp>}
                          <ul className="db-rows">
                            {items.slice(0, 12).map((it) => (
                              <Row key={it.l} it={it} title={it.t} k="monitor" es={es}>
                                {isNew(it) && <span className="db-new">{es ? 'nuevo' : 'new'}</span>}
                              </Row>
                            ))}
                          </ul>
                        </section>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {tab === 'videos' && (
              <>
                <h1 className="db-page-t">{es ? 'Videos' : 'Videos'}</h1>
                <p className="db-page-sub">{es ? 'Subidos en los últimos 30 días. Agrega una sección con Videos en la barra de comandos.' : 'Uploads from the last 30 days. Add a shelf with Videos in the command bar.'}</p>
                <div className="db-sections is-videos">
                  {videoBlocks.map((b) => {
                    const items = dedupeVideos(b.items, 30)
                    return (
                      <section key={b.id} className="db-sec" data-id={b.id} aria-labelledby={`h-${b.id}`}>
                        <h2 className="db-label" id={`h-${b.id}`}>
                          <span>{b.label}</span>
                          {email && <SectionMenu id={b.id} kind={b.kind} label={b.label} mini={false} lang={lang} />}
                        </h2>
                        {items.length === 0 && <p className="db-rail-empty">{es ? 'Sin videos en los últimos 30 días. Actualiza para revisar los canales.' : 'No uploads in the last 30 days. Refresh to re-check these channels.'}</p>}
                        <ul className="db-rows is-video">
                          {items.slice(0, 8).map((it) => <VideoRow key={it.l} it={it} k={b.key} es={es} />)}
                        </ul>
                        {items.length > 8 && (
                          <details className="db-more">
                            <summary>{es ? `${items.length - 8} más` : `${items.length - 8} more`}</summary>
                            <ul className="db-rows is-video">{items.slice(8, 24).map((it) => <VideoRow key={it.l} it={it} k={b.key} es={es} />)}</ul>
                          </details>
                        )}
                      </section>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <aside className="db-rail" aria-label={es ? 'Mercados, monitores y guardados' : 'Markets, monitors and saved'}>
            {tiles.length > 0 && (
              <section className="db-rail-block" aria-labelledby="db-rail-mkt">
                <h2 className="db-label" id="db-rail-mkt">
                  <span>{es ? 'Mercados' : 'Markets'}</span>
                  {email && <MarketMenu selected={selectedStats} catalog={fullCatalog} stats={statsMap} countryOrder={[...COUNTRY_ORDER, 'Stocks']} lang={lang} />}
                </h2>
                <div className="db-mkt">{tiles.map((m) => <MarketTile key={m.id} m={m} es={es} />)}</div>
              </section>
            )}
            {email && (
              <section className="db-rail-block" aria-labelledby="db-rail-mon">
                <h2 className="db-label" id="db-rail-mon"><a href="/news?tab=monitors">{es ? 'Monitores' : 'Monitors'}</a>{newTotal > 0 && <span className="db-count is-accent">{newTotal} {es ? 'nuevos' : 'new'}</span>}</h2>
                {visMonitors.length ? (
                  <ul className="db-rail-list">
                    {visMonitors.map((m) => {
                      const n = (m.items || []).filter(isNew).length
                      const latest = (m.items || [])[0]
                      return (
                        <li key={m.query}>
                          <a href="/news?tab=monitors">{m.query}</a>
                          <span className="db-src">{n > 0 ? <span className="db-new">{n} {es ? 'nuevo' : 'new'}</span> : (es ? 'sin novedades' : 'nothing new')}{latest ? ` · ${latest.s}` : ''}</span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="db-rail-empty">{es ? 'Sigue una historia: elige Monitorear en la barra de comandos.' : 'Follow a developing story: pick Monitor in the command bar.'}</p>
                )}
              </section>
            )}
            <SavedRail initial={saved} authed={!!email} lang={lang} />
            <p className="db-rail-foot"><LastUpdated iso={updatedAt} lang={lang} /> <RefreshButton lang={lang} /></p>
          </aside>
        </div>

        <footer className="db-foot">
          {email ? (
            <>
              <div className="db-foot-suggest"><Suggest lang={lang} /></div>
              <div className="db-foot-row">
                <span>{es ? 'Sesión' : 'Signed in as'} {email}</span>
                <DigestToggle on={!!L.digest} lang={lang} />
                <SourcesManager sources={allSources} top={sourceTiers.top} muted={sourceTiers.muted} lang={lang} />
                {hidden.length > 0 && <ShowHidden count={hidden.length} lang={lang} />}
                <a href="/news/globe">{es ? 'Explorador mundial' : 'World explorer'}</a>
              </div>
            </>
          ) : (
            <div className="db-foot-row">
              <span>{es ? 'Noticias gratis para todos.' : 'Free news for everyone.'}</span>
              <a href={signInHref}>{es ? 'Inicia sesión' : 'Sign in'}</a>
              <span>{es ? 'para resúmenes con IA, temas propios y videos.' : 'for AI briefings, your own topics and video shelves.'}</span>
            </div>
          )}
        </footer>
      </div>

      <nav className="db-tabbar" aria-label={es ? 'Vistas' : 'Views'}>
        {TABS.map((t) => (
          <a key={t.id} href={tabHref(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            {es ? t.es : t.en}
            {t.id === 'monitors' && newTotal > 0 && <span className="db-tab-n">{newTotal}</span>}
          </a>
        ))}
      </nav>
    </main>
  )
}
