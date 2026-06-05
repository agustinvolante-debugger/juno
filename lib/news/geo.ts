// Geographic news explorer — category definitions + per-place query templates.
// THE REAL WORK lives here. For a clicked place we fan out one Google News search per category.
// Because each result comes from exactly one category bucket, the category tag is FREE — no
// AI classification needed. We just dedupe across buckets afterward (keep the first bucket a story
// appears in, by category priority order).
//
// Geo scoping: a COUNTRY's `gl`/`ceid` already pins the geography to that country's Google News
// edition, so the query is just localized category keywords. A CITY only gets country-level locale,
// so we append a `scope` string ("City" + Country) to pin it within the country's edition.

import { searchTopic, type Item, type Route } from './feeds'
import type { Place, PlaceLang } from './places'

export type CategoryKey = 'business' | 'politics' | 'tech' | 'sports'

export type Category = {
  key: CategoryKey
  label: string
  color: string                       // tag color (sidebar)
  kw: Partial<Record<PlaceLang, string>> & { en: string } // localized keyword bundles; en required
}

// Priority order = de-dupe precedence: a story that surfaces in two buckets stays in the
// earlier one. Business/funding first (Agustin's core interest), then politics, tech, sports.
export const CATEGORIES: Category[] = [
  {
    key: 'business',
    label: 'Business · Funding',
    color: '#22c55e',
    kw: {
      en: '(startup OR funding OR "raised" OR "venture" OR IPO OR acquisition OR economy OR markets OR business)',
      es: '(startup OR financiamiento OR inversión OR "ronda" OR economía OR empresa OR negocios OR mercados)',
      pt: '(startup OR investimento OR "rodada" OR economia OR empresa OR negócios OR mercado)',
      fr: '(startup OR "levée de fonds" OR investissement OR économie OR entreprise OR marchés OR bourse)',
      de: '(Startup OR Finanzierung OR Investition OR Wirtschaft OR Unternehmen OR Börse OR Markt)',
      it: '(startup OR finanziamento OR investimento OR economia OR azienda OR mercati OR borsa)',
      ja: '(スタートアップ OR 資金調達 OR 投資 OR 経済 OR 企業 OR 株式 OR 市場)',
    },
  },
  {
    key: 'politics',
    label: 'Politics',
    color: '#3b82f6',
    kw: {
      en: '(government OR election OR president OR parliament OR minister OR policy OR senate OR congress)',
      es: '(gobierno OR elección OR presidente OR congreso OR ministro OR política OR senado)',
      pt: '(governo OR eleição OR presidente OR congresso OR ministro OR política OR senado)',
      fr: '(gouvernement OR élection OR président OR parlement OR ministre OR politique OR sénat)',
      de: '(Regierung OR Wahl OR Präsident OR Parlament OR Minister OR Politik OR Bundestag)',
      it: '(governo OR elezioni OR presidente OR parlamento OR ministro OR politica OR senato)',
      ja: '(政府 OR 選挙 OR 大統領 OR 国会 OR 大臣 OR 政治 OR 首相)',
    },
  },
  {
    key: 'tech',
    label: 'Tech',
    color: '#a855f7',
    kw: {
      en: '(technology OR "artificial intelligence" OR AI OR software OR startup OR app OR launch OR chip)',
      es: '(tecnología OR "inteligencia artificial" OR software OR aplicación OR lanzamiento OR innovación)',
      pt: '(tecnologia OR "inteligência artificial" OR software OR aplicativo OR lançamento OR inovação)',
      fr: '(technologie OR "intelligence artificielle" OR logiciel OR application OR lancement OR innovation)',
      de: '(Technologie OR "künstliche Intelligenz" OR Software OR App OR Innovation OR Halbleiter)',
      it: '(tecnologia OR "intelligenza artificiale" OR software OR applicazione OR innovazione)',
      ja: '(テクノロジー OR 人工知能 OR ソフトウェア OR アプリ OR イノベーション OR 半導体)',
    },
  },
  {
    key: 'sports',
    label: 'Sports',
    color: '#f59e0b',
    kw: {
      en: '(sports OR football OR soccer OR basketball OR NBA OR tennis OR championship OR match)',
      es: '(deportes OR fútbol OR partido OR campeonato OR selección OR liga OR gol)',
      pt: '(esporte OR futebol OR campeonato OR seleção OR jogo OR liga OR gol)',
      fr: '(sport OR football OR match OR championnat OR ligue OR tennis OR rugby)',
      de: '(Sport OR Fußball OR Bundesliga OR Spiel OR Meisterschaft OR Tennis)',
      it: '(sport OR calcio OR partita OR campionato OR "serie a" OR tennis)',
      ja: '(スポーツ OR サッカー OR 野球 OR 試合 OR 選手権 OR テニス)',
    },
  },
]

export const CATEGORY_BY_KEY: Record<CategoryKey, Category> =
  Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CategoryKey, Category>

// Build the Google News query + route for a place × category.
function placeQuery(place: Place, cat: Category): { q: string; route: Route } {
  const kw = cat.kw[place.lang] || cat.kw.en
  // Cities: pin the city within its country edition. Fallback countries (lang 'en' but non-English
  // geography): add the country name so locale + name reinforce each other.
  let scope = ''
  if (place.kind === 'city') scope = ` "${place.name}" ${place.country}`
  else if (place.lang === 'en' && place.country && place.id !== 'us' && place.id !== 'uk' &&
           place.id !== 'canada' && place.id !== 'australia' && place.id !== 'ireland' && place.id !== 'india')
    scope = ` ${place.country}`
  return { q: kw + scope, route: { hl: place.hl, gl: place.gl, ceid: place.ceid } }
}

const SOCIAL = /(^|\.)(instagram|x|twitter|facebook|tiktok|threads|reddit)\.com/i
function isSocial(source: string, link: string): boolean {
  const s = (source || '').toLowerCase()
  if (SOCIAL.test(s)) return true
  try { return SOCIAL.test(new URL(link).hostname) } catch { return false }
}

export type PlaceBuckets = Record<CategoryKey, Item[]>

// Fan out one search per category, in parallel, then dedupe across buckets by category priority.
// On-demand (no cache for v1). Each bucket is independently recency-sorted by searchTopic.
export async function fetchPlaceNews(place: Place): Promise<PlaceBuckets> {
  const results = await Promise.all(
    CATEGORIES.map(async (cat) => {
      const { q, route } = placeQuery(place, cat)
      const items = await searchTopic(q, route, { when: '5d', maxAgeDays: 6, limit: 12 })
      return { key: cat.key, items }
    }),
  )
  const seen = new Set<string>()
  const out = {} as PlaceBuckets
  for (const { key, items } of results) {
    const kept: Item[] = []
    for (const it of items) {
      if (isSocial(it.s, it.l)) continue // drop instagram/x/facebook noise
      const k = it.l.split('?')[0]
      if (seen.has(k)) continue
      seen.add(k)
      kept.push(it)
    }
    out[key] = kept
  }
  return out
}
