// News reader — core feed engine (ported from the Python prototype).
// Pure server-side logic: RSS/Atom fetch + parse, topic search with source routing
// and recency, and the macro strip. No external deps (uses global fetch).

export type Item = { t: string; l: string; s: string; d: string | null; summary?: string }
export type Section = { key: string; label: string }
// A "Monitor" tracks a developing situation: items carry `first` (when we first saw them) so the
// UI can flag what's NEW since the last refresh. `card` is an optional type-specific summary the
// AI extracts from the coverage (earnings beat/miss, sports results, etc.) for an adaptive layout.
export type MonitorCard = {
  type: 'earnings' | 'sports' | 'company' | 'event' | 'generic'
  // earnings
  company?: string
  reportDate?: string
  reported?: boolean
  revenue?: string
  revenueEst?: string
  eps?: string
  epsEst?: string
  verdict?: string
  // sports
  competition?: string
  results?: { label: string; detail?: string }[]
  fixtures?: { label: string; when?: string }[]
  // company / event / generic
  headline?: string
}
export type Monitor = { query: string; items: (Item & { first?: string })[]; brief: string; card?: MonitorCard; updated_at: string }

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export const SECTIONS: Section[] = [
  { key: 'ai', label: 'AI & Future Tech' },
  { key: 'funding', label: 'Funding · VC · IPOs' },
  { key: 'markets', label: 'Markets & Breaking' },
  { key: 'longread', label: 'Long Reads' },
  { key: 'chile', label: 'Chile / LatAm' },
  { key: 'founder', label: 'Founder · Launches' },
  { key: 'reddit', label: 'Reddit / HN' },
  { key: 'watch_ai', label: '🎬 AI/Tech — just dropped' },
  { key: 'watch_vc', label: '🚀 VC & Startups — just dropped' },
  { key: 'watch_golf', label: '⛳ Golf — just dropped' },
]

export const ES_NATIVE = new Set(['chile'])

// Sections that ALSO pull from Google News search, not just the curated RSS feeds.
// The query string IS the "instruction": broad enough to catch the story wherever it
// breaks first (Bloomberg, Reuters, regional press), then AI curation dedupes + ranks.
// This is how the section spans ~all publishers instead of a handful of hand-picked feeds.
export const SECTION_QUERIES: Record<string, { query: string; when: string; maxAgeDays: number; limit: number }> = {
  funding: {
    query:
      '(raises OR raised OR "Series A" OR "Series B" OR "Series C" OR "seed round" OR "funding round" OR "led the round" OR valuation OR IPO OR acquires OR acquisition) ' +
      '(startup OR fintech OR AI OR SaaS OR venture OR billion OR million)',
    when: '3d', maxAgeDays: 4, limit: 25,
  },
  ai: {
    query:
      '("artificial intelligence" OR LLM OR "AI model" OR OpenAI OR Anthropic OR "Google DeepMind" OR Nvidia OR "AI agent") ' +
      '(launch OR release OR breakthrough OR raises OR lawsuit OR regulation)',
    when: '2d', maxAgeDays: 3, limit: 25,
  },
  markets: {
    query: '(stock market OR "S&P 500" OR Nasdaq OR Fed OR "interest rates" OR earnings OR inflation OR recession OR "Treasury yields")',
    when: '2d', maxAgeDays: 2, limit: 25,
  },
}

const SOURCES: { section: string; name: string; url: string }[] = [
  { section: 'ai', name: 'Hacker News', url: 'https://hnrss.org/frontpage?points=100' },
  { section: 'ai', name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { section: 'ai', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { section: 'ai', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { section: 'ai', name: 'r/LocalLLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day' },
  { section: 'ai', name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { section: 'funding', name: 'TechCrunch Venture', url: 'https://techcrunch.com/category/venture/feed/' },
  { section: 'funding', name: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/' },
  { section: 'funding', name: 'StrictlyVC', url: 'https://www.strictlyvc.com/feed/' },
  { section: 'funding', name: 'Sifted', url: 'https://sifted.eu/feed' },
  { section: 'funding', name: 'Axios Pro Rata', url: 'https://api.axios.com/feed/' },
  { section: 'funding', name: 'Fortune Term Sheet', url: 'https://fortune.com/feed/' },
  { section: 'funding', name: 'r/startups', url: 'https://www.reddit.com/r/startups/top/.rss?t=week' },
  { section: 'markets', name: 'CNBC Top News', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { section: 'markets', name: 'CNBC Markets', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258' },
  { section: 'markets', name: 'WSJ Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { section: 'markets', name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { section: 'markets', name: 'Barron\'s', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { section: 'markets', name: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/' },
  { section: 'markets', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { section: 'markets', name: 'Semafor', url: 'https://www.semafor.com/rss.xml' },
  { section: 'markets', name: 'BI Markets', url: 'https://markets.businessinsider.com/rss/news' },
  { section: 'longread', name: 'FT Big Read', url: 'https://www.ft.com/rss/home' },
  { section: 'longread', name: 'WSJ Features', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
  { section: 'longread', name: 'The Economist', url: 'https://www.economist.com/latest/rss.xml' },
  { section: 'longread', name: 'The Atlantic', url: 'https://www.theatlantic.com/feed/all/' },
  { section: 'longread', name: 'The New Yorker', url: 'https://www.newyorker.com/feed/everything' },
  { section: 'longread', name: 'ProPublica', url: 'https://www.propublica.org/feeds/propublica/main' },
  { section: 'longread', name: 'NYT Magazine', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Magazine.xml' },
  { section: 'longread', name: 'The Dispatch', url: 'https://thedispatch.com/feed/' },
  { section: 'longread', name: '1843 Magazine', url: 'https://www.economist.com/1843/rss.xml' },
  { section: 'chile', name: 'La Tercera', url: 'https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml' },
  { section: 'chile', name: 'BioBioChile', url: 'https://feeds.feedburner.com/radiobiobio/NNeJ' },
  { section: 'chile', name: 'Diario Financiero', url: 'https://www.df.cl/noticias/site/list/port/rss.xml' },
  { section: 'chile', name: 'Ex-Ante', url: 'https://www.ex-ante.cl/feed/' },
  { section: 'chile', name: 'Pulso', url: 'https://www.latercera.com/arc/outboundfeeds/rss/category/pulso/?outputType=xml' },
  { section: 'chile', name: 'CIPER Chile', url: 'https://www.ciperchile.cl/feed/' },
  { section: 'chile', name: 'The Clinic', url: 'https://www.theclinic.cl/feed/' },
  // Emol dropped its public RSS, so pull it via a Google News site-scoped feed (Chilean locale).
  { section: 'chile', name: 'Emol', url: 'https://news.google.com/rss/search?q=site:emol.com+when:3d&hl=es-419&gl=CL&ceid=CL:es' },
  { section: 'founder', name: 'Product Hunt', url: 'https://www.producthunt.com/feed' },
  { section: 'founder', name: 'Show HN', url: 'https://hnrss.org/show' },
  { section: 'founder', name: 'r/SideProject', url: 'https://www.reddit.com/r/SideProject/top/.rss?t=week' },
  { section: 'founder', name: 'Latent Space', url: 'https://www.latent.space/feed' },
  { section: 'founder', name: 'Lenny\'s Newsletter', url: 'https://www.lennysnewsletter.com/feed' },
  { section: 'founder', name: 'Ben\'s Bites', url: 'https://www.bensbites.com/feed' },
  { section: 'founder', name: 'AI News (HF)', url: 'https://huggingface.co/blog/feed.xml' },
  { section: 'founder', name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml' },
  { section: 'founder', name: 'GitHub Trending', url: 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml' },
  { section: 'reddit', name: 'r/MachineLearning', url: 'https://www.reddit.com/r/MachineLearning/top/.rss?t=week' },
  { section: 'reddit', name: 'r/technology', url: 'https://www.reddit.com/r/technology/top/.rss?t=day' },
  { section: 'reddit', name: 'HN Ask', url: 'https://hnrss.org/ask' },
  { section: 'watch_ai', name: 'Andrej Karpathy', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCXUPKJO5MZQN11PqgIvyuvQ' },
  { section: 'watch_ai', name: 'Fireship', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA' },
  { section: 'watch_ai', name: 'Two Minute Papers', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg' },
  { section: 'watch_ai', name: 'Yannic Kilcher', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew' },
  { section: 'watch_ai', name: 'AI Explained', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw' },
  { section: 'watch_ai', name: 'Matt Wolfe', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UChpleBmo18P08aKCIgti38g' },
  { section: 'watch_ai', name: 'NetworkChuck', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC9x0AN7BWHpCDHSm9NiJFJQ' },
  { section: 'watch_ai', name: 'The AI Advantage', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHhYXsLBEVVnbvsq57n1MTQ' },
  { section: 'watch_ai', name: 'Latent Space', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCvi5jNRoRVm436TVAXet1kQ' },
  { section: 'watch_ai', name: 'DeepLearningAI', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCcIXc5mJsHVYTZR1maL5l9w' },
  { section: 'watch_vc', name: 'Y Combinator', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCcefcZRL2oaA_uBNeo5UOWg' },
  { section: 'watch_vc', name: 'a16z', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQ1VQj-37kl2yS_VUhfQHsw' },
  { section: 'watch_vc', name: 'Sequoia Capital', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCWrF0oN6unbXrWsTN7RctTw' },
  { section: 'watch_vc', name: '20VC', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCf0PBRjhf0rF8fWBIxTuoWA' },
  { section: 'watch_vc', name: 'SaaStr', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCwOILzAcxK5CM2M7oRBuWSg' },
  { section: 'watch_vc', name: 'Stanford eCorner', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCctkeBNtFIOn7Yl_9TTj_4w' },
  { section: 'watch_vc', name: 'First Round', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UClDB2q4aaZJbMkmAPU7Mvag' },
  { section: 'watch_vc', name: 'All-In Podcast', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCESLZhusAkFfsNsApnjF_Cg' },
  { section: 'watch_vc', name: 'BG2Pod', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-yRDvpR99LUc5l7i7jLzew' },
  { section: 'watch_vc', name: 'SALT', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCCnhrPnlIOHxr9kviPgqq-g' },
  { section: 'watch_golf', name: 'Rick Shiels Golf', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCFHZHhZaH7Rc_FOMIzUziJA' },
  { section: 'watch_golf', name: 'Good Good', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCfi-mPMOmche6WI-jkvnGXw' },
  { section: 'watch_golf', name: 'Bryson DeChambeau', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCCxF55adGXOscJ3L8qdKnrQ' },
  { section: 'watch_golf', name: 'Grant Horvat', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCLQs4NhoLcGqg1pLYkXxJIA' },
  { section: 'watch_golf', name: 'Peter Finch', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCFoez1Xjc90CsHvCzqKnLcw' },
  { section: 'watch_golf', name: 'Golf Sidekick', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCaeGjmOiTxekbGUDPKhoU-A' },
  { section: 'watch_golf', name: 'Bob Does Sports', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCqr4sONkmFEOPc3rfoVLEvg' },
  { section: 'watch_golf', name: 'Me and My Golf', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCTwywdg9Sw5xs4wdN-qz7yw' },
  { section: 'watch_golf', name: 'Bryan Bros', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCdCxaD8rWfAj12rloIYS6jQ' },
  { section: 'watch_golf', name: 'No Laying Up', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZn1UAWT9W0pLTWCdt8CTBg' },
]

const PER_FEED = 8

async function fetchText(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(13000) })
    if (!r.ok) return ''
    return await r.text()
  } catch {
    return ''
  }
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
}

function clean(s: string, limit = 200): string {
  const t = decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > limit ? t.slice(0, limit) + '…' : t
}

function field(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : ''
}

function parseDate(s: string): string | null {
  if (!s) return null
  const d = new Date(decode(s).trim())
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// Extract items from an RSS or Atom document.
function parseItems(xml: string): { title: string; link: string; date: string | null; source: string; summary: string }[] {
  const out: { title: string; link: string; date: string | null; source: string; summary: string }[] = []
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []
  for (const b of blocks) {
    const title = clean(field(b, 'title'), 160)
    // link: Atom <link href=...> (prefer alternate) else RSS <link>text</link>
    let link = ''
    const hrefs = [...b.matchAll(/<link\b([^>]*)\/?>/gi)]
    for (const h of hrefs) {
      const attrs = h[1]
      const href = (attrs.match(/href="([^"]+)"/) || [])[1]
      if (href) {
        const rel = (attrs.match(/rel="([^"]+)"/) || [])[1]
        if (!link || !rel || rel === 'alternate') link = href
      }
    }
    if (!link) link = decode(field(b, 'link')).trim()
    if (!title || !link) continue
    const date = parseDate(field(b, 'pubDate') || field(b, 'published') || field(b, 'updated') || field(b, 'date'))
    const source = clean(field(b, 'source'), 60)
    const summary = clean(field(b, 'description') || field(b, 'summary') || field(b, 'content'), 200)
    out.push({ title, link, date, source, summary })
  }
  return out
}

function epoch(d: string | null): number {
  return d ? Date.parse(d) || 0 : 0
}

function isShort(title: string, link: string): boolean {
  const t = (title || '').toLowerCase()
  return t.includes('#shorts') || t.includes('#short') || (link || '').includes('/shorts/')
}

// YouTube video id lives in ?v=, so don't strip the query for watch links when deduping.
function dedupeKey(link: string): string {
  return link.includes('youtube.com/watch') || link.includes('youtu.be/') ? link : link.split('?')[0]
}

export async function collectSections(): Promise<{ bySection: Record<string, Item[]>; live: number; total: number }> {
  const results = await Promise.all(
    SOURCES.map(async (f) => {
      const xml = await fetchText(f.url)
      const items = parseItems(xml).slice(0, PER_FEED)
      return { f, items }
    }),
  )
  const bySection: Record<string, Item[]> = {}
  let live = 0
  for (const { f, items } of results) {
    if (items.length) live++
    const arr = (bySection[f.section] ||= [])
    const watch = f.section.startsWith('watch_')
    const fromGNews = f.url.includes('news.google.com') // these titles end with " - Publisher"
    for (const it of items) {
      if (watch && isShort(it.title, it.link)) continue
      let t = it.title
      if (fromGNews && t.endsWith(` - ${f.name}`)) t = t.slice(0, -(f.name.length + 3))
      arr.push({ t, l: it.link, s: f.name, d: it.date, summary: it.summary })
    }
  }

  // Breadth pass: blend Google News search results into configured sections so a big
  // story (e.g. a major round) gets caught wherever it breaks, not just in the 7 RSS feeds.
  await Promise.all(
    Object.entries(SECTION_QUERIES).map(async ([sec, cfg]) => {
      const found = await searchTopic(cfg.query, {}, { when: cfg.when, maxAgeDays: cfg.maxAgeDays, limit: cfg.limit })
      if (found.length) (bySection[sec] ||= []).push(...found)
    }),
  )
  for (const k of Object.keys(bySection)) {
    const seen = new Set<string>()
    bySection[k] = bySection[k]
      .sort((a, b) => epoch(b.d) - epoch(a.d))
      .filter((it) => {
        const key = dedupeKey(it.l)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    // watch sections: interleave by channel so one prolific channel can't dominate
    if (k.startsWith('watch_')) bySection[k] = interleaveBySource(bySection[k])
  }
  return { bySection, live, total: SOURCES.length }
}

// Resolve a channel name or @handle → channel id + title (best-effort, no API).
export async function resolveChannel(term: string): Promise<{ cid: string; title: string } | null> {
  const h = term.replace(/^@/, '').replace(/\s+/g, '')
  const cands = [
    `https://www.youtube.com/@${h}`,
    `https://www.youtube.com/c/${h}`,
    `https://www.youtube.com/user/${h}`,
    `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`,
  ]
  for (const u of cands) {
    const page = await fetchText(u)
    const m = page.match(/"(?:channelId|externalId)":"(UC[A-Za-z0-9_-]{22})"/) || page.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)
    if (!m) continue
    const cid = m[1]
    const rss = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`)
    const tm = rss.match(/<title>([^<]+)<\/title>/)
    const title = tm ? decode(tm[1]).trim() : term
    if (title.includes('Error 404')) continue
    return { cid, title }
  }
  return null
}

export async function channelItems(cid: string, title: string): Promise<Item[]> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`)
  const out: Item[] = []
  for (const it of parseItems(xml).slice(0, 8)) {
    if (isShort(it.title, it.link)) continue
    out.push({ t: it.title, l: it.link, s: title, d: it.date })
  }
  return out
}

export function interleaveBySource(items: Item[]): Item[] {
  const groups: Record<string, Item[]> = {}
  const order: string[] = []
  for (const it of items) {
    if (!groups[it.s]) {
      groups[it.s] = []
      order.push(it.s)
    }
    groups[it.s].push(it)
  }
  const out: Item[] = []
  while (order.some((s) => groups[s].length)) {
    for (const s of order) if (groups[s].length) out.push(groups[s].shift()!)
  }
  return out
}

export type Route = { sites?: string[] | null; hl?: string; gl?: string; ceid?: string; query?: string }

export async function searchTopic(
  query: string,
  route: Route = {},
  opts: { when?: string; maxAgeDays?: number; limit?: number } = {},
): Promise<Item[]> {
  const when = opts.when ?? '4d'
  const maxAgeDays = opts.maxAgeDays ?? 5
  const limit = opts.limit ?? 14
  const hl = route.hl || 'en-US'
  const gl = route.gl || 'US'
  const ceid = route.ceid || `${gl}:${hl.split('-')[0]}`
  let q = route.query || query
  if (when) q = `${q} when:${when}`
  if (route.sites && route.sites.length) q = `${q} (${route.sites.map((s) => `site:${s}`).join(' OR ')})`
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`
  const items = parseItems(await fetchText(url))
  const now = Date.now()
  const out: Item[] = []
  for (const it of items) {
    const d = it.date ? Date.parse(it.date) : NaN
    if (!isNaN(d) && (now - d) / 86400000 > maxAgeDays) continue
    let src = it.source
    let t = it.title
    // Google News appends " - Publisher" to every title — strip it, and use it as the source if
    // the <source> tag was missing.
    const idx = t.lastIndexOf(' - ')
    if (idx > 0) {
      const tail = t.slice(idx + 3)
      if (tail.length > 0 && tail.length < 40) {
        t = t.slice(0, idx)
        if (!src) src = tail
      }
    }
    out.push({ t, l: it.link, s: src || 'Google News', d: it.date })
  }
  out.sort((a, b) => epoch(b.d) - epoch(a.d))
  return out.slice(0, limit)
}

export type Stat = { label: string; value: string; sub: string; good: boolean | null }
export type StatDef = { id: string; label: string; country: string; group: string; kind: 'stooq' | 'bls' | 'fred' | 'cnbc'; key: string; mode?: 'cpi' | 'rate' | 'yoy' | 'level' | 'num' }

// Flag (or icon) per country/group, shown on the belt and in the markets menu.
export const COUNTRY_FLAG: Record<string, string> = {
  'United States': '🇺🇸', 'Euro Area': '🇪🇺', 'United Kingdom': '🇬🇧', 'Germany': '🇩🇪', 'France': '🇫🇷',
  'Japan': '🇯🇵', 'China': '🇨🇳', 'Hong Kong': '🇭🇰', 'India': '🇮🇳', 'Canada': '🇨🇦', 'Australia': '🇦🇺',
  'Chile': '🇨🇱', 'Brazil': '🇧🇷', 'Argentina': '🇦🇷', 'Global': '🌐', 'Stocks': '📈',
}
export const flagFor = (country: string): string => COUNTRY_FLAG[country] || ''

// Build a StatDef for a user-added individual ticker (quoted via CNBC).
export const tickerDef = (symbol: string, label?: string): StatDef => {
  const sym = symbol.toUpperCase()
  return { id: `tk_${sym.toLowerCase()}`, label: label || sym, country: 'Stocks', group: 'Stocks', kind: 'cnbc', key: sym }
}

// Catalog for the markets belt, organized by COUNTRY → category (group).
// Markets/commodities via Stooq (reliable globally); macro via FRED (best-effort — some series
// may be unavailable from certain networks; per-stat failures are skipped, never NaN).
// Country order here is the display order in the menu (US first, majors, LatAm, then Global).
export const STATS_CATALOG: StatDef[] = [
  // ── United States ──
  { id: 'dow', label: 'Dow Jones', country: 'United States', group: 'Markets', kind: 'stooq', key: '^dji' },
  { id: 'sp500', label: 'S&P 500', country: 'United States', group: 'Markets', kind: 'stooq', key: '^spx' },
  { id: 'nasdaq', label: 'Nasdaq 100', country: 'United States', group: 'Markets', kind: 'stooq', key: '^ndx' },
  { id: 'us_vix', label: 'VIX · Volatility', country: 'United States', group: 'Markets', kind: 'stooq', key: '^vix' },
  { id: 'us_cpi', label: 'CPI · YoY', country: 'United States', group: 'Economic Data', kind: 'fred', key: 'CPIAUCSL', mode: 'yoy' },
  { id: 'us_unemp', label: 'Unemployment', country: 'United States', group: 'Economic Data', kind: 'fred', key: 'UNRATE', mode: 'level' },
  { id: 'us_gdp', label: 'Real GDP · QoQ ann.', country: 'United States', group: 'Economic Data', kind: 'fred', key: 'A191RL1Q225SBEA', mode: 'level' },
  { id: 'us_fed', label: 'Fed Funds Rate', country: 'United States', group: 'Economic Data', kind: 'fred', key: 'FEDFUNDS', mode: 'level' },
  { id: 'us_10y', label: '10Y Treasury', country: 'United States', group: 'Economic Data', kind: 'fred', key: 'DGS10', mode: 'level' },
  { id: 'us_retail', label: 'Retail Sales · YoY', country: 'United States', group: 'Economic Data', kind: 'fred', key: 'RSAFS', mode: 'yoy' },
  { id: 'us_sentiment', label: 'Consumer Sentiment', country: 'United States', group: 'Economic Data', kind: 'fred', key: 'UMCSENT', mode: 'num' },
  // ── Euro Area ──
  { id: 'ea_cpi', label: 'CPI · YoY', country: 'Euro Area', group: 'Economic Data', kind: 'fred', key: 'CP0000EZ19M086NEST', mode: 'yoy' },
  // ── United Kingdom ──
  { id: 'ftse', label: 'FTSE 100', country: 'United Kingdom', group: 'Markets', kind: 'stooq', key: '^ukx' },
  { id: 'uk_cpi', label: 'CPI · YoY', country: 'United Kingdom', group: 'Economic Data', kind: 'fred', key: 'GBRCPIALLMINMEI', mode: 'yoy' },
  { id: 'uk_unemp', label: 'Unemployment', country: 'United Kingdom', group: 'Economic Data', kind: 'fred', key: 'LRHUTTTTGBM156S', mode: 'level' },
  // ── Germany ──
  { id: 'dax', label: 'DAX', country: 'Germany', group: 'Markets', kind: 'stooq', key: '^dax' },
  { id: 'de_cpi', label: 'CPI · YoY', country: 'Germany', group: 'Economic Data', kind: 'fred', key: 'DEUCPIALLMINMEI', mode: 'yoy' },
  { id: 'de_unemp', label: 'Unemployment', country: 'Germany', group: 'Economic Data', kind: 'fred', key: 'LRHUTTTTDEM156S', mode: 'level' },
  // ── France ──
  { id: 'cac', label: 'CAC 40', country: 'France', group: 'Markets', kind: 'stooq', key: '^cac' },
  // ── Japan ──
  { id: 'nikkei', label: 'Nikkei 225', country: 'Japan', group: 'Markets', kind: 'stooq', key: '^nkx' },
  // ── China / Hong Kong ──
  { id: 'shanghai', label: 'Shanghai Composite', country: 'China', group: 'Markets', kind: 'stooq', key: '^shc' },
  { id: 'hsi', label: 'Hang Seng', country: 'Hong Kong', group: 'Markets', kind: 'stooq', key: '^hsi' },
  // ── India ──
  { id: 'sensex', label: 'Sensex', country: 'India', group: 'Markets', kind: 'stooq', key: '^snx' },
  // ── Canada ──
  { id: 'tsx', label: 'TSX Composite', country: 'Canada', group: 'Markets', kind: 'stooq', key: '^tsx' },
  // ── Australia ──
  { id: 'au_unemp', label: 'Unemployment', country: 'Australia', group: 'Economic Data', kind: 'fred', key: 'LRHUTTTTAUM156S', mode: 'level' },
  // ── Chile ──
  { id: 'ipsa', label: 'IPSA', country: 'Chile', group: 'Markets', kind: 'stooq', key: '^ipsa' },
  { id: 'cl_cpi', label: 'CPI · YoY', country: 'Chile', group: 'Economic Data', kind: 'fred', key: 'CHLCPIALLMINMEI', mode: 'yoy' },
  { id: 'cl_unemp', label: 'Unemployment', country: 'Chile', group: 'Economic Data', kind: 'fred', key: 'LRHUTTTTCLM156S', mode: 'level' },
  // ── Brazil ──
  { id: 'bovespa', label: 'Bovespa', country: 'Brazil', group: 'Markets', kind: 'stooq', key: '^bvp' },
  // ── Argentina ──
  { id: 'merval', label: 'Merval', country: 'Argentina', group: 'Markets', kind: 'stooq', key: '^mrv' },
  // ── Global (commodities, crypto, FX) ──
  { id: 'gold', label: 'Gold', country: 'Global', group: 'Commodities & FX', kind: 'stooq', key: 'xauusd' },
  { id: 'oil', label: 'Crude Oil · WTI', country: 'Global', group: 'Commodities & FX', kind: 'stooq', key: 'cl.f' },
  { id: 'btc', label: 'Bitcoin', country: 'Global', group: 'Commodities & FX', kind: 'stooq', key: 'btcusd' },
  { id: 'eurusd', label: 'EUR / USD', country: 'Global', group: 'Commodities & FX', kind: 'stooq', key: 'eurusd' },
]

// Display order for countries in the menu.
export const COUNTRY_ORDER = [
  'United States', 'Euro Area', 'United Kingdom', 'Germany', 'France', 'Japan',
  'China', 'Hong Kong', 'India', 'Canada', 'Australia', 'Chile', 'Brazil', 'Argentina', 'Global',
]

export const DEFAULT_STATS = ['dow', 'sp500', 'nasdaq', 'us_cpi', 'us_unemp']

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : n >= 10 ? 1 : 4 })
}

async function stooqStat(def: StatDef): Promise<Stat | null> {
  try {
    const rows = (await fetchText(`https://stooq.com/q/l/?s=${encodeURIComponent(def.key)}&f=sd2t2ohlcv&h&e=csv`)).trim().split('\n')
    const cols = (rows[1] || '').split(',')
    const open = parseFloat(cols[3]); const close = parseFloat(cols[6])
    if (!isFinite(close)) return null
    const chg = isFinite(open) && open ? (close / open - 1) * 100 : null
    return { label: def.label, value: fmtNum(close), sub: chg === null ? '' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`, good: chg === null ? null : chg >= 0 }
  } catch { return null }
}

async function blsStats(defs: StatDef[]): Promise<Record<string, Stat>> {
  const out: Record<string, Stat> = {}
  if (!defs.length) return out
  try {
    const yr = new Date().getFullYear()
    const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ seriesid: defs.map((d) => d.key), startyear: String(yr - 1), endyear: String(yr) }),
      signal: AbortSignal.timeout(20000),
    })
    const j = await r.json()
    const series: Record<string, any[]> = {}
    for (const s of j?.Results?.series || []) series[s.seriesID] = s.data
    for (const def of defs) {
      const data = series[def.key] || []
      if (!data.length) continue
      const latest = data[0]
      const sub = `${latest.periodName.slice(0, 3)} ${latest.year}`
      if (def.mode === 'cpi') {
        let yoy: number | null = null
        for (const d2 of data) if (d2.periodName === latest.periodName && +d2.year === +latest.year - 1) { yoy = (parseFloat(latest.value) / parseFloat(d2.value) - 1) * 100; break }
        if (yoy === null || !isFinite(yoy)) continue
        out[def.id] = { label: def.label, value: `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`, sub, good: yoy <= 3 }
      } else {
        out[def.id] = { label: def.label, value: `${latest.value}%`, sub, good: null }
      }
    }
  } catch {}
  return out
}

async function fredStat(def: StatDef): Promise<Stat | null> {
  try {
    // FRED throttles intermittently from some networks — retry a couple times before giving up.
    // Cap the range to ~2 years so daily series (e.g. DGS10) return a small, fast CSV instead
    // of a multi-decade download that times out. Still plenty for a 12-month YoY lookback.
    const cosd = new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10)
    let rows: string[] = []
    for (let attempt = 0; attempt < 3 && rows.length < 2; attempt++) {
      rows = (await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${def.key}&cosd=${cosd}`))
        .trim().split('\n').filter((r) => r && /^\d{4}-\d{2}-\d{2},/.test(r))
    }
    if (rows.length < 2) return null
    const val = (r: string) => parseFloat(r.split(',')[1])
    const lastRow = rows[rows.length - 1]
    const last = val(lastRow)
    if (!isFinite(last)) return null
    const mon = new Date(lastRow.split(',')[0] + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    if (def.mode === 'yoy') {
      const prior = val(rows[rows.length - 13] || '')
      if (!isFinite(prior) || !prior) return null
      const yoy = (last / prior - 1) * 100
      return { label: def.label, value: `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`, sub: mon, good: yoy <= 3 }
    }
    if (def.mode === 'num') return { label: def.label, value: fmtNum(last), sub: mon, good: null }
    return { label: def.label, value: `${last.toFixed(1)}%`, sub: mon, good: null }
  } catch { return null }
}

// Live quotes via CNBC's JSON quote service (one call, many symbols). Reliable + gives names;
// used for individual tickers. Could also back the indices if Stooq's bot-checks worsen.
async function cnbcStats(defs: StatDef[]): Promise<Record<string, Stat>> {
  const out: Record<string, Stat> = {}
  if (!defs.length) return out
  try {
    const syms = defs.map((d) => d.key).join(',')
    const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(syms)}&requestMethod=itv&fund=1&exthrs=1&output=json`
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(13000) })
    const j = await r.json()
    const quotes: any[] = j?.FormattedQuoteResult?.FormattedQuote || []
    const bySym: Record<string, any> = {}
    for (const q of quotes) bySym[String(q.symbol || '').toUpperCase()] = q
    for (const def of defs) {
      const q = bySym[def.key.toUpperCase()]
      if (!q || q.last == null) continue
      const pct = String(q.change_pct || '')
      const good = pct ? !pct.trim().startsWith('-') : null
      out[def.id] = { label: def.label, value: String(q.last), sub: pct, good }
    }
  } catch {}
  return out
}

// Fetches the catalog (+ any extra ticker defs) into a map. Per-stat failures are skipped (never NaN).
export async function getStats(extra: StatDef[] = []): Promise<Record<string, Stat>> {
  const out: Record<string, Stat> = {}
  const all = [...STATS_CATALOG, ...extra]
  const stooqDefs = all.filter((d) => d.kind === 'stooq')
  const fredDefs = all.filter((d) => d.kind === 'fred')
  const cnbcDefs = all.filter((d) => d.kind === 'cnbc')
  const [stooqRes, blsRes, fredRes, cnbcRes] = await Promise.all([
    Promise.all(stooqDefs.map((d) => stooqStat(d))),
    blsStats(all.filter((d) => d.kind === 'bls')),
    Promise.all(fredDefs.map((d) => fredStat(d))),
    cnbcStats(cnbcDefs),
  ])
  stooqDefs.forEach((d, i) => { if (stooqRes[i]) out[d.id] = stooqRes[i]! })
  Object.assign(out, blsRes)
  fredDefs.forEach((d, i) => { if (fredRes[i]) out[d.id] = fredRes[i]! })
  Object.assign(out, cnbcRes)
  return out
}
