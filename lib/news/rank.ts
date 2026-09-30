// News reader — story clustering + "Top 7 for you" ranking. Pure, server-side, no AI.
// Clusters the same real-world story across sections/outlets, then scores each cluster:
//   0.35 · For-You affinity (learned click profile)
//   0.25 · source tier (quality outlets)
//   0.20 · log(cross-source count)
//   0.20 · recency (half-life 8h)
import type { Item } from './feeds'

export type Pooled = Item & { k: string; rank: number } // k = block id the item came from, rank = index in it
export type Cluster = {
  id: number
  items: Pooled[]
  sources: string[]
  best: Pooled
  home: string // the block the story is shown in (where it ranks highest)
  newest: number
  score: number
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'your', 'what', 'why', 'how', 'new', 'los', 'las', 'una', 'por', 'con', 'para', 'que', 'del', 'este', 'esta', 'como', 'after', 'over', 'into', 'says', 'said', 'more', 'than', 'about', 'could', 'would', 'their', 'they', 'just', 'amid'])

// Same tokenizer the For-You profile learns with (app/api/news/profile).
export function toks(t: string): string[] {
  return (t || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w))
}

// Proper nouns / acronyms: capitalised words. Title-cased and sentence-initial words make this
// noisy, which is why a match also needs real token overlap.
function entities(t: string): Set<string> {
  const out = new Set<string>()
  const words = (t || '').split(/\s+/)
  words.forEach((w) => {
    const c = w.replace(/[^A-Za-z0-9&.\-ÁÉÍÓÚÑáéíóúñ]/g, '')
    if (c.length < 3 || STOP.has(c.toLowerCase())) return
    if (/^[A-Z]{2,}$/.test(c) || /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(c) || /[a-z][A-Z]/.test(c)) out.add(c.toLowerCase())
  })
  return out
}

// ---- source quality ----
const TIER_1: RegExp[] = [
  /financial times|^ft\b|ft big read/, /reuters/, /bloomberg/, /wall street journal|^wsj/, /economist|1843/,
  /associated press|^ap\b|ap news/, /new york times|nytimes|nyt /, /the information/, /stratechery/, /axios/,
  /washington post/, /\bbbc\b/, /foreign affairs/, /foreign policy/, /barron/, /semafor/, /politico/,
]
const TIER_2: RegExp[] = [
  /cnbc/, /techcrunch/, /the verge/, /ars technica/, /mit tech/, /fortune/, /guardian/, /atlantic/, /new yorker/,
  /propublica/, /marketwatch/, /crunchbase/, /sifted/, /strictlyvc/, /business insider|^bi /, /yahoo finance/,
  /latent space/, /lenny/, /diario financiero/, /la tercera/, /ciper/, /ex-ante/, /pulso/, /al jazeera/, /npr/,
  /war on the rocks/, /the dispatch/, /wired/, /platformer/, /\bcnn\b/, /\bnbc\b|\bcbs\b|\babc news/, /espn/,
]
export function sourceTier(s: string): number {
  const n = (s || '').toLowerCase()
  if (TIER_1.some((r) => r.test(n))) return 1
  if (TIER_2.some((r) => r.test(n))) return 0.6
  if (/^r\/|reddit|hacker news|show hn|hn ask|product hunt|github/.test(n)) return 0.2
  return 0.35
}

// ---- favicons ----
const SOURCE_DOMAIN: [RegExp, string][] = [
  [/reuters/, 'reuters.com'], [/bloomberg/, 'bloomberg.com'], [/financial times|^ft\b/, 'ft.com'],
  [/wall street journal|^wsj/, 'wsj.com'], [/economist/, 'economist.com'], [/associated press|^ap\b|ap news/, 'apnews.com'],
  [/new york times|nytimes/, 'nytimes.com'], [/cnbc/, 'cnbc.com'], [/axios/, 'axios.com'], [/bbc/, 'bbc.com'],
  [/guardian/, 'theguardian.com'], [/washington post/, 'washingtonpost.com'], [/forbes/, 'forbes.com'],
  [/fortune/, 'fortune.com'], [/techcrunch/, 'techcrunch.com'], [/the verge/, 'theverge.com'], [/politico/, 'politico.com'],
  [/business insider/, 'businessinsider.com'], [/yahoo/, 'yahoo.com'], [/marketwatch/, 'marketwatch.com'],
  [/barron/, 'barrons.com'], [/semafor/, 'semafor.com'], [/cnn/, 'cnn.com'], [/espn/, 'espn.com'], [/nfl/, 'nfl.com'],
  [/emol/, 'emol.com'], [/the information/, 'theinformation.com'], [/wired/, 'wired.com'], [/al jazeera/, 'aljazeera.com'],
]
export function faviconFor(it: { l: string; s: string }): string | null {
  let host = ''
  try { host = new URL(it.l).hostname.replace(/^www\./, '') } catch { /* bad url */ }
  if (host && host !== 'news.google.com') return `https://www.google.com/s2/favicons?domain=${host}&sz=32`
  const n = (it.s || '').toLowerCase()
  const hit = SOURCE_DOMAIN.find(([r]) => r.test(n))
  return hit ? `https://www.google.com/s2/favicons?domain=${hit[1]}&sz=32` : null
}

// ---- sports / video / staleness ----
const SPORTS_RE = /\b(49ers|niners|seahawks|nfl|nba|mlb|nhl|mls|golf|pga|liv golf|tennis|atp|wta|roland garros|wimbledon|world cup|premier league|la liga|champions league|f1|formula 1|super bowl|warriors|giants|dodgers|lakers|colo[- ]colo|football|soccer|fútbol|futbol|rugby|cricket|ufc|boxing)\b/i
export const isSportsLabel = (key: string, label: string): boolean => key === 'watch_golf' || SPORTS_RE.test(label || '')

export function youtubeId(link: string): string | null {
  const m = link.match(/[?&]v=([A-Za-z0-9_-]{11})/) || link.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

// "Nov 2023"-style subs on macro stats → how old the data point is.
export function statAgeDays(sub: string): number | null {
  const m = (sub || '').match(/^([A-Z][a-z]{2}) (\d{4})$/)
  if (!m) return null
  const t = Date.parse(`${m[1]} 1, ${m[2]}`)
  return isNaN(t) ? null : (Date.now() - t) / 86400000
}

// Calendar day for "once per day" caches, in the reader's home timezone.
export const dayKey = (d = new Date()): string => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

export const linkKey = (l: string): string => (l.includes('youtube.com/watch') || l.includes('youtu.be/') ? l : l.split('?')[0])

// ---- clustering ----
function sameStory(a: { t: Set<string>; e: Set<string> }, b: { t: Set<string>; e: Set<string> }): boolean {
  let inter = 0
  for (const w of a.t) if (b.t.has(w)) inter++
  const min = Math.min(a.t.size, b.t.size) || 1
  if (inter >= 3 && inter / min >= 0.5) return true
  if (inter < 3 || inter / min < 0.4) return false
  // Near-miss on wording: also needs two shared names ("Quiroz … Presupuesto 2027"). Kept strict
  // because union-find chains matches, and one loose link can swallow a whole beat.
  let ent = 0
  for (const w of a.e) if (b.e.has(w)) ent++
  return ent >= 2
}

export function clusterItems(pool: Pooled[], blockOrder: string[]): Cluster[] {
  const n = pool.length
  const feats = pool.map((it) => ({ t: new Set(toks(it.t)), e: entities(it.t) }))
  const parent = pool.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const byLink = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const lk = linkKey(pool[i].l)
    const prev = byLink.get(lk)
    if (prev !== undefined) { parent[find(i)] = find(prev); continue }
    byLink.set(lk, i)
    for (let j = 0; j < i; j++) {
      if (find(i) === find(j)) continue
      if (sameStory(feats[i], feats[j])) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, Pooled[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(pool[i])
  }
  const orderIdx = (k: string) => { const i = blockOrder.indexOf(k); return i < 0 ? 999 : i }
  const out: Cluster[] = []
  let id = 0
  for (const items of groups.values()) {
    const sources = Array.from(new Set(items.map((x) => x.s)))
    const best = [...items].sort((a, b) =>
      sourceTier(b.s) - sourceTier(a.s) || a.rank - b.rank || (Date.parse(b.d || '') || 0) - (Date.parse(a.d || '') || 0))[0]
    const home = [...items].sort((a, b) => a.rank - b.rank || orderIdx(a.k) - orderIdx(b.k))[0].k
    const newest = Math.max(...items.map((x) => Date.parse(x.d || '') || 0))
    out.push({ id: id++, items, sources, best, home, newest, score: 0 })
  }
  return out
}

export type Profile = { s?: Record<string, number>; k?: Record<string, number>; w?: Record<string, number> }

// Profile keys: sections are learned by their block key ('ai', 'topic', …).
const profileKey = (k: string) => (k.startsWith('topic_') ? 'topic' : k)

export function scoreClusters(clusters: Cluster[], profile: Profile | null, now = Date.now()): void {
  const aff = clusters.map((c) => {
    if (!profile) return 0
    let best = 0
    for (const it of c.items) {
      let sc = 3 * (profile.k?.[profileKey(it.k)] || 0) + 2 * (profile.s?.[it.s] || 0)
      for (const w of toks(it.t)) sc += profile.w?.[w] || 0
      if (sc > best) best = sc
    }
    return best
  })
  const maxAff = Math.max(1, ...aff)
  const maxN = Math.max(1, ...clusters.map((c) => c.sources.length))
  clusters.forEach((c, i) => {
    const a = aff[i] / maxAff
    const t = Math.max(...c.sources.map(sourceTier))
    const x = maxN > 1 ? Math.log(1 + c.sources.length) / Math.log(1 + maxN) : 0
    const ageH = c.newest ? Math.max(0, (now - c.newest) / 3600000) : 72
    const r = Math.pow(0.5, ageH / 8)
    c.score = 0.35 * a + 0.25 * t + 0.2 * x + 0.2 * r
  })
}

// Pick the Top N with diversity caps: ≤2 per source, ≤3 per section. Only stories from the
// last 48h are eligible (it's a morning desk, not an archive).
export function pickTop(clusters: Cluster[], n = 7, now = Date.now()): Cluster[] {
  const perSource: Record<string, number> = {}
  const perBlock: Record<string, number> = {}
  const out: Cluster[] = []
  for (const c of [...clusters].sort((a, b) => b.score - a.score)) {
    if (!c.newest || now - c.newest > 48 * 3600000) continue
    const s = c.best.s
    if ((perSource[s] || 0) >= 2 || (perBlock[c.home] || 0) >= 3) continue
    perSource[s] = (perSource[s] || 0) + 1
    perBlock[c.home] = (perBlock[c.home] || 0) + 1
    out.push(c)
    if (out.length >= n) break
  }
  return out
}

// A one-line dek for the lead: the item's own RSS summary when it's real prose (Google News
// summaries just repeat the title + outlet). The section's AI brief is NOT used: it describes
// the section's top story, which is often a different story than this one.
export function leadDek(c: Cluster): string {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const trim = (x: string) => (x.length > 240 ? x.slice(0, 237).replace(/\s+\S*$/, '') + '…' : x)
  // Only the lead item's own summary: clusters are fuzzy, so a sibling's summary can be off-story.
  const sm = (c.best.summary || '').trim()
  if (sm.length >= 60 && !norm(sm).startsWith(norm(c.best.t).slice(0, 40))) return trim(sm)
  return ''
}
