// News reader — core feed engine (ported from the Python prototype).
// Pure server-side logic: RSS/Atom fetch + parse, topic search with source routing
// and recency, and the macro strip. No external deps (uses global fetch).

export type Item = { t: string; l: string; s: string; d: string | null; summary?: string }
export type Section = { key: string; label: string }

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
    for (const it of items) {
      if (watch && isShort(it.title, it.link)) continue
      arr.push({ t: it.title, l: it.link, s: f.name, d: it.date, summary: it.summary })
    }
  }
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
    if (!src && t.includes(' - ')) {
      const idx = t.lastIndexOf(' - ')
      const tail = t.slice(idx + 3)
      if (tail.length > 0 && tail.length < 40) {
        t = t.slice(0, idx)
        src = tail
      }
    }
    out.push({ t, l: it.link, s: src || 'Google News', d: it.date })
  }
  out.sort((a, b) => epoch(b.d) - epoch(a.d))
  return out.slice(0, limit)
}

export type MacroStat = { label: string; value: string; sub: string; good: boolean | null }

export async function getMacro(): Promise<MacroStat[]> {
  const stats: MacroStat[] = []
  try {
    const rows = (await fetchText('https://stooq.com/q/l/?s=^dji&f=sd2t2ohlcv&h&e=csv')).trim().split('\n')
    let close = parseFloat(rows[1].split(',')[6])
    let chg: number | null = null
    try {
      const hist = (await fetchText('https://stooq.com/q/d/l/?s=^dji&i=d')).trim().split('\n')
      const c1 = parseFloat(hist[hist.length - 1].split(',')[4])
      const c0 = parseFloat(hist[hist.length - 2].split(',')[4])
      close = c1
      chg = (c1 / c0 - 1) * 100
    } catch {}
    stats.push({
      label: 'Dow Jones',
      value: close.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      sub: chg === null ? '' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
      good: chg === null ? null : chg >= 0,
    })
  } catch {}
  try {
    const yr = new Date().getFullYear()
    const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ seriesid: ['CUUR0000SA0', 'LNS14000000'], startyear: String(yr - 1), endyear: String(yr) }),
      signal: AbortSignal.timeout(20000),
    })
    const j = await r.json()
    const series: Record<string, any[]> = {}
    for (const s of j?.Results?.series || []) series[s.seriesID] = s.data
    const cpi = series['CUUR0000SA0'] || []
    if (cpi.length) {
      const latest = cpi[0]
      let yoy: number | null = null
      for (const d2 of cpi) {
        if (d2.periodName === latest.periodName && +d2.year === +latest.year - 1) {
          yoy = (parseFloat(latest.value) / parseFloat(d2.value) - 1) * 100
          break
        }
      }
      stats.push({
        label: 'CPI (YoY)',
        value: yoy === null ? latest.value : `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`,
        sub: `${latest.periodName.slice(0, 3)} ${latest.year}`,
        good: yoy === null ? null : yoy <= 3,
      })
    }
    const un = series['LNS14000000'] || []
    if (un.length) stats.push({ label: 'Unemployment', value: `${un[0].value}%`, sub: `${un[0].periodName.slice(0, 3)} ${un[0].year}`, good: null })
  } catch {}
  return stats
}
