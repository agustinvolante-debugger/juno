// News → VC Constellation funding link.
//
// Every morning the Daily Brief's funding section (curated RSS + a Google News query) is read,
// one batched Haiku call per ~40 headlines pulls out {company, round, amount, valuation,
// investors}, and each round lands in vc_funding_events — labelled REPORTED BY PRESS, never
// presented as SEC-verified, never written over Form D figures or vc_funding_overrides (this
// module only ever writes vc_funding_events, plus a bare vc_companies row under rule 2).
//
// Rules (decided with the founder):
//   1. auto-apply, always 'reported'; every figure links to its article; status='hidden' undoes.
//   2. a NEW company is created only when a lead/participating investor matches a vc_firms row
//      with high confidence; otherwise only companies already in vc_companies are enriched.
//   3. one event per round: same company + same round/amount within ~21 days → one row, best-tier
//      source kept as the primary, the rest listed in other_sources.
//   4. trusted outlets only (see TIERS); press-release wires and everything else are dropped
//      before the model ever sees them.
//
// Cost: headlines already processed are remembered in vc_ingest_meta('news_funding_seen'), so a
// normal day sends only the new ~20-40 headlines to Haiku (~$0.01). A 14-day backfill is ~$0.05.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { getFeedCache } from '@/lib/news/store'
import { searchTopic, SECTION_QUERIES, type Item } from '@/lib/news/feeds'

const MODEL = 'claude-haiku-5-5'
const PRICE = { in: 0.1, out: 0.5 } // $/Mtok, Haiku 5.5 (prompts under 100k)
const BATCH = 40
const DEDUPE_DAYS = 21
const SEEN_KEY = 'news_funding_seen'
const SEEN_CAP = 3000
const ALIAS_KEY = 'brand_aliases'

// ---------------------------------------------------------------- trusted sources
// Lower tier = better. Matched against the item's source name (curated feed name, or the
// publisher Google News reports — sometimes a name, sometimes a domain).
const TIERS: { re: RegExp; name: string; tier: number }[] = [
  { re: /bloomberg/i, name: 'Bloomberg', tier: 1 },
  { re: /reuters/i, name: 'Reuters', tier: 1 },
  { re: /financial times|^ft\.com$|\bft\.com\b/i, name: 'Financial Times', tier: 1 },
  { re: /wall street journal|\bwsj\b/i, name: 'WSJ', tier: 1 },
  { re: /the information|theinformation\.com/i, name: 'The Information', tier: 1 },
  { re: /techcrunch/i, name: 'TechCrunch', tier: 2 },
  { re: /axios/i, name: 'Axios', tier: 2 },
  { re: /fortune/i, name: 'Fortune', tier: 2 },
  { re: /cnbc/i, name: 'CNBC', tier: 2 },
  { re: /crunchbase/i, name: 'Crunchbase News', tier: 3 },
  { re: /strictlyvc/i, name: 'StrictlyVC', tier: 3 },
  { re: /sifted/i, name: 'Sifted', tier: 3 },
]
// never trusted even if a pattern above happens to match (press-release mills, aggregators)
const MILLS = /pr ?newswire|business ?wire|globe ?newswire|accesswire|einpresswire|newsfile|pr\.com|openpr|benzinga|yahoo|msn|marketscreener|investing\.com|seekingalpha|reddit|hacker news/i

export function sourceTier(source: string): { name: string; tier: number } | null {
  const s = (source || '').trim()
  if (!s || MILLS.test(s)) return null
  for (const t of TIERS) if (t.re.test(s)) return { name: t.name, tier: t.tier }
  return null
}

const QUALITY_SITES = ['techcrunch.com', 'news.crunchbase.com', 'strictlyvc.com', 'axios.com', 'bloomberg.com', 'reuters.com', 'ft.com', 'wsj.com', 'theinformation.com', 'sifted.eu', 'fortune.com', 'cnbc.com']
// cheap pre-filter before the model: headline must at least smell like money changing hands
const MONEY_RE = /\b(rais(e|es|ed|ing)|funding|fund(s|ed)?\b|series [a-h]\b|seed|pre-seed|valuation|valued|round|backed|led by|invest(s|ed|ment)|ipo|go(es)? public|acquir(e|es|ed)|acquisition|buys|bought|\$\d|€\d|£\d|billion|million)/i

// ---------------------------------------------------------------- names
const CO_SUFFIX = /\b(incorporated|inc|corp|corporation|co|company|llc|ltd|limited|plc|gmbh|sa|sas|bv|ag|pbc|holdings?)\b/g
export function normCo(s: string): string {
  return (s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(CO_SUFFIX, ' ').replace(/\s+/g, '').trim()
}
const FIRM_SUFFIX = /\b(ventures?|venture partners|capital|partners|management|associates|holdings|fund|funds|lp|llc|inc|growth|group|vc|investments?|advisors|the)\b/g
function normFirmFull(s: string): string { return (s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, '').trim() }
function normFirmCore(s: string): string { return (s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(FIRM_SUFFIX, ' ').replace(/\s+/g, '').trim() }

// press spelling → vc_firms slug (applied only when that slug exists)
const FIRM_ALIASES: Record<string, string> = {
  a16z: 'a16z', andreessen: 'a16z', andreessenhorowitz: 'a16z', a16zcrypto: 'a16z', a16zgrowth: 'a16z',
  gc: 'generalcatalyst', generalcatalyst: 'generalcatalyst',
  sequoia: 'sequoia', sequoiacapital: 'sequoia',
  kp: 'kleiner', kleiner: 'kleiner', kleinerperkins: 'kleiner',
  nea: 'nea', newenterpriseassociates: 'nea',
  gv: 'gv', googleventures: 'gv',
  yc: 'ycombinator', ycombinator: 'ycombinator',
  tiger: 'tiger', tigerglobal: 'tiger', tigerglobalmanagement: 'tiger',
  iconiq: 'iconiq', iconiqgrowth: 'iconiq', iconiqcapital: 'iconiq',
  bvp: 'bessemer', bessemer: 'bessemer', bessemerventurepartners: 'bessemer',
  thrive: 'thrive', thrivecapital: 'thrive',
  founders: 'foundersfund', foundersfund: 'foundersfund',
  lsvp: 'lightspeed', lightspeed: 'lightspeed', lightspeedventurepartners: 'lightspeed',
  insight: 'insight', insightpartners: 'insight',
  coatue: 'coatue', coatuemanagement: 'coatue',
  dst: 'dst', dstglobal: 'dst',
  capitalg: 'capitalg', khosla: 'khosla', khoslaventures: 'khosla',
  index: 'index', indexventures: 'index', accel: 'accel', benchmark: 'benchmark',
  greenoaks: 'greenoaks', greenoakscapital: 'greenoaks', ivp: 'ivp', institutionalventurepartners: 'ivp',
  bond: 'bond', bondcapital: 'bond', tcv: 'tcv', altimeter: 'altimeter', altimetercapital: 'altimeter',
  d1: 'd1', d1capital: 'd1', d1capitalpartners: 'd1', redpoint: 'redpoint', felicis: 'felicis', lux: 'lux', luxcapital: 'lux',
  '8vc': '8vc', firstround: 'firstround', firstroundcapital: 'firstround', menlo: 'menlo', menloventures: 'menlo',
  spark: 'spark', sparkcapital: 'spark', crv: 'crv', greylock: 'greylock', ribbit: 'ribbit', ribbitcapital: 'ribbit',
  goldman: 'goldman', goldmansachs: 'goldman', goldmansachsalternatives: 'goldman',
  bailliegifford: 'baillie', baillie: 'baillie', lonepine: 'lonepine', valor: 'valor', valorequitypartners: 'valor',
  nvidia: 'nvidia', nventures: 'nvidia', radical: 'radical', radicalventures: 'radical', inovia: 'inovia',
  eladgil: 'eladgil', emersoncollective: 'emerson', blackbird: 'blackbird', dfjgrowth: 'dfj',
}

type Firm = { id: string; slug: string; name: string }
export type FirmIndex = { match: (name: string) => Firm | null }

export function buildFirmIndex(firms: Firm[]): FirmIndex {
  const bySlug = new Map(firms.map((f) => [f.slug, f]))
  const full = new Map<string, Firm>()
  const core = new Map<string, Firm[]>()
  for (const f of firms) {
    full.set(normFirmFull(f.name), f)
    full.set(normFirmFull(f.slug), f)
    const k = normFirmCore(f.name)
    if (k.length >= 3) core.set(k, [...(core.get(k) || []), f])
  }
  return {
    match(name: string) {
      const a = normFirmFull(name)
      if (!a) return null
      const al = FIRM_ALIASES[a] || FIRM_ALIASES[normFirmCore(name)]
      if (al && bySlug.has(al)) return bySlug.get(al)!
      if (full.has(a)) return full.get(a)!
      const c = normFirmCore(name)
      const hits = c.length >= 4 ? core.get(c) : undefined
      return hits && hits.length === 1 ? hits[0] : null // ambiguous core (two "Sequoia …") → no match
    },
  }
}

// ---------------------------------------------------------------- extraction (Haiku)
type Extracted = {
  i: number
  is_funding_round: boolean
  kind: 'round' | 'ipo' | 'acquisition'
  company: string
  round: string
  amount_usd: number
  valuation_usd: number
  investors: { name: string; lead: boolean }[]
  announced_on: string
  confidence: number
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'One entry per headline that reports a specific company raising a round, IPO-ing, or being acquired. OMIT every other headline.',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer', description: 'the headline number' },
          is_funding_round: { type: 'boolean', description: 'true for an equity/debt raise or tender at a stated valuation; false for IPO/acquisition' },
          kind: { type: 'string', enum: ['round', 'ipo', 'acquisition'] },
          company: { type: 'string', description: 'the company that RAISED (or IPOed / was acquired) — brand name as written, never the investor or acquirer' },
          round: { type: 'string', description: 'Pre-seed, Seed, Series A … Series H, Growth, Tender offer, Secondary, Debt, Strategic, Undisclosed, IPO, Acquisition' },
          amount_usd: { type: 'number', description: 'amount raised (or deal price) in US dollars; 0 if not stated. Convert €/£ roughly.' },
          valuation_usd: { type: 'number', description: 'post-money valuation in US dollars; 0 if not stated' },
          investors: {
            type: 'array',
            description: 'investors NAMED in the headline/summary (for an acquisition: the acquirer, lead=true). Empty if none named.',
            items: { type: 'object', properties: { name: { type: 'string' }, lead: { type: 'boolean' } }, required: ['name', 'lead'], additionalProperties: false },
          },
          announced_on: { type: 'string', description: 'YYYY-MM-DD if the text states it, else empty string' },
          confidence: { type: 'number', description: '0-1 that this really is a new round/IPO/acquisition for that company' },
        },
        required: ['i', 'is_funding_round', 'kind', 'company', 'round', 'amount_usd', 'valuation_usd', 'investors', 'announced_on', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

const SYSTEM = `You extract startup financing events from news headlines (with a short summary when available).

- Only report what the text states. Never guess an amount, valuation, round or investor.
- "X raises $50M Series B led by Y" → company X, round Series B, amount 50000000, investors [{Y, lead}].
- "X doubles valuation to $22B" with no round named → round "Undisclosed", valuation 22000000000.
- IPO: only when the company has priced, listed, or formally filed (kind ipo, round "IPO"). Speculation ("could IPO", "eyes IPO") is NOT an event — omit it.
- Acquisition: only a completed or definitively agreed deal (kind acquisition, round "Acquisition", company = the target, investors = [acquirer, lead]).
- Omit: fund closes by VC firms, market commentary, lists/roundups covering many companies, lawsuits, rumours ("in talks", "seeking"), earnings.
- If one headline covers several separate raises, return one entry per company with the same i.`

async function extractBatch(anthropic: Anthropic, items: Item[], offset: number): Promise<{ out: Extracted[]; inTok: number; outTok: number }> {
  const list = items.map((it, k) => {
    const d = it.d ? it.d.slice(0, 10) : ''
    const sum = it.summary ? ` — ${it.summary.slice(0, 220)}` : ''
    return `${offset + k}. [${d} · ${it.s}] ${it.t}${sum}`
  }).join('\n')
  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Headlines:\n${list}` }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  })
  const p = res.parsed_output as { items: Extracted[] } | null
  return { out: p?.items || [], inTok: res.usage.input_tokens || 0, outTok: res.usage.output_tokens || 0 }
}

// ---------------------------------------------------------------- types
export type PlannedEvent = {
  company_slug: string | null
  cik: string | null
  company_name: string
  round: string
  amount_usd: number | null
  valuation_usd: number | null
  investors: { name: string; lead: boolean; firm_slug: string | null }[]
  announced_on: string
  source_url: string
  source_name: string
  source_tier: number
  headline: string
  other_sources: { name: string; url: string; tier: number; headline: string }[]
  confidence: number
  dedupe_key: string
  created_company: boolean
  // dry-run / report only (not columns)
  _match: 'exact' | 'alias' | 'new' | 'none'
  _action: 'insert' | 'merge' | 'skip'
  _why?: string
  _existingId?: string
}

export type RunResult = {
  dry: boolean
  days: number
  tableMissing: boolean
  scanned: number
  trusted: number
  sentToModel: number
  extracted: number
  events: PlannedEvent[]
  written: { inserted: number; merged: number; companiesCreated: number }
  costUsd: number
  notes: string[]
}

// ---------------------------------------------------------------- helpers
const roundKey = (r: string) => (r || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'undisclosed'
const vague = (r: string) => ['undisclosed', 'unknown', 'growth', 'strategic', ''].includes(roundKey(r))
const near = (a: number | null, b: number | null, tol: number) => !!a && !!b && Math.abs(a - b) / Math.max(a, b) <= tol
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000
function sameRound(a: { round: string; amount_usd: number | null; valuation_usd: number | null; announced_on: string }, b: typeof a): boolean {
  if (dayDiff(a.announced_on, b.announced_on) > DEDUPE_DAYS) return false
  if (roundKey(a.round) === roundKey(b.round)) return true
  if (near(a.amount_usd, b.amount_usd, 0.15) || near(a.valuation_usd, b.valuation_usd, 0.1)) return true
  // a vague label on either side ("Undisclosed", "Growth") is the same round unless the numbers disagree
  if ((vague(a.round) || vague(b.round)) && !(a.amount_usd && b.amount_usd) && !(a.valuation_usd && b.valuation_usd)) return true
  return false
}
function slugify(s: string): string { return (s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) }
const linkKey = (l: string) => (l || '').split('#')[0]
const isoDay = (d: string | null | undefined) => (d && !isNaN(Date.parse(d)) ? new Date(d).toISOString().slice(0, 10) : null)

async function readMeta(key: string): Promise<any> {
  const { data } = await supabaseAdmin.from('vc_ingest_meta').select('value').eq('key', key).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) : null } catch { return null }
}

/** Is vc_funding_events there yet? (The founder pastes the migration by hand.) */
export async function fundingTableExists(): Promise<boolean> {
  const { error } = await supabaseAdmin.from('vc_funding_events').select('id').limit(1)
  if (error) { console.warn('[news-funding] vc_funding_events unavailable:', error.message); return false }
  return true
}

// ---------------------------------------------------------------- collect
async function collectItems(days: number): Promise<Item[]> {
  const cache = (await getFeedCache())['funding'] || []
  const out: Item[] = [...cache]
  // backfill window: the cache only holds the last ~3 days, so re-ask Google News for the
  // window restricted to the quality outlets (plus the section's own query unrestricted)
  if (days > 3) {
    const q = SECTION_QUERIES.funding.query
    const raises = '(raises OR raised OR "led by" OR "Series A" OR "Series B" OR "Series C" OR "Series D" OR "seed round" OR valuation) (startup OR AI OR fintech)'
    const found = await Promise.all([
      searchTopic(q, { sites: QUALITY_SITES }, { when: `${days}d`, maxAgeDays: days + 1, limit: 100 }),
      searchTopic(raises, { sites: QUALITY_SITES }, { when: `${days}d`, maxAgeDays: days + 1, limit: 100 }),
      searchTopic(q, {}, { when: `${days}d`, maxAgeDays: days + 1, limit: 100 }),
    ])
    for (const f of found) out.push(...f)
  }
  const cutoff = Date.now() - (days + 1) * 86400_000
  const seen = new Set<string>()
  return out.filter((it) => {
    const k = linkKey(it.l)
    if (!it.t || !it.l || seen.has(k)) return false
    seen.add(k)
    const t = it.d ? Date.parse(it.d) : NaN
    return isNaN(t) || t >= cutoff
  })
}

// ---------------------------------------------------------------- main
export async function runNewsFunding(opts: { dry?: boolean; days?: number; reprocess?: boolean } = {}): Promise<RunResult> {
  const dry = !!opts.dry
  const days = Math.max(1, Math.min(30, opts.days || 14))
  const notes: string[] = []
  const tableOk = await fundingTableExists()
  const effectiveDry = dry || !tableOk
  if (!tableOk) notes.push('vc_funding_events does not exist yet — paste lib/vc/migrations/2026-10-01-funding-events.sql into Supabase. Ran as dry-run.')

  const raw = await collectItems(days)
  const trusted = raw
    .map((it) => ({ it, src: sourceTier(it.s) }))
    .filter((x) => x.src && MONEY_RE.test(x.it.t)) as { it: Item; src: { name: string; tier: number } }[]

  // skip headlines already processed on a previous (non-dry) run
  const seenArr: string[] = (await readMeta(SEEN_KEY)) || []
  const seenSet = new Set(opts.reprocess || effectiveDry ? [] : seenArr)
  const todo = trusted.filter((x) => !seenSet.has(linkKey(x.it.l)))

  // ---- extraction, batched + parallel
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let inTok = 0, outTok = 0
  const batches: { it: Item; src: { name: string; tier: number } }[][] = []
  for (let k = 0; k < todo.length; k += BATCH) batches.push(todo.slice(k, k + BATCH))
  const extracted: { x: Extracted; it: Item; src: { name: string; tier: number } }[] = []
  await Promise.all(batches.map(async (b, bi) => {
    try {
      const r = await extractBatch(anthropic, b.map((y) => y.it), bi * BATCH)
      inTok += r.inTok; outTok += r.outTok
      for (const x of r.out) {
        const y = todo[x.i]
        if (y && x.company && x.company.trim()) extracted.push({ x, it: y.it, src: y.src })
      }
    } catch (e: any) {
      notes.push(`batch ${bi} failed: ${String(e?.message || e).slice(0, 120)}`)
    }
  }))
  const costUsd = (inTok * PRICE.in + outTok * PRICE.out) / 1e6

  // ---- reference data
  const [firmsR, cosR, aliases] = await Promise.all([
    supabaseAdmin.from('vc_firms').select('id,slug,name').limit(10000),
    supabaseAdmin.from('vc_companies').select('id,slug,name,cik,website').limit(20000),
    readMeta(ALIAS_KEY),
  ])
  const firmIx = buildFirmIndex((firmsR.data || []) as Firm[])
  const cos = (cosR.data || []) as { id: string; slug: string; name: string; cik: string | null; website: string | null }[]
  const coByNorm = new Map<string, (typeof cos)[number]>()
  for (const c of cos) {
    for (const k of [normCo(c.name), normCo(c.slug), c.website ? normCo(c.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[./]/)[0]) : '']) {
      if (k && k.length >= 3 && !coByNorm.has(k)) coByNorm.set(k, c)
    }
  }
  const aliasMap: Record<string, { legalName: string; brand?: string }> = aliases || {}
  const aliasByNorm = new Map<string, string>()
  for (const [k, v] of Object.entries(aliasMap)) { aliasByNorm.set(normCo(k), v.legalName); if (v.brand) aliasByNorm.set(normCo(v.brand), v.legalName) }
  const slugTaken = new Set(cos.map((c) => c.slug))

  function matchCompany(name: string): { co: (typeof cos)[number] | null; how: 'exact' | 'alias' | 'none' } {
    const n = normCo(name)
    if (!n) return { co: null, how: 'none' }
    if (coByNorm.has(n)) return { co: coByNorm.get(n)!, how: 'exact' }
    const legal = aliasByNorm.get(n)
    if (legal && coByNorm.has(normCo(legal))) return { co: coByNorm.get(normCo(legal))!, how: 'alias' }
    // "ElevenLabs AI" vs "ElevenLabs": try dropping a trailing ai/labs/hq token once
    const trimmed = n.replace(/(ai|hq|app|labs|technologies|tech)$/, '')
    if (trimmed !== n && trimmed.length >= 4 && coByNorm.has(trimmed)) return { co: coByNorm.get(trimmed)!, how: 'exact' }
    return { co: null, how: 'none' }
  }

  // ---- build candidate events (one per extracted item), then dedupe within the run
  const cands: PlannedEvent[] = []
  for (const { x, it, src } of extracted) {
    const kind = x.kind
    if (kind === 'round' && !x.is_funding_round) continue
    if ((x.confidence ?? 0) < 0.5) continue
    if (/^(undisclosed|unknown|unnamed|n\/?a|stealth)\b/i.test(x.company.trim()) || x.company.trim().length < 2) continue
    if (firmIx.match(x.company)) continue // a VC firm closing a fund, not a portfolio round
    const round = kind === 'ipo' ? 'IPO' : kind === 'acquisition' ? 'Acquisition' : (x.round || 'Undisclosed').trim().slice(0, 40)
    const amount = x.amount_usd > 0 ? Math.round(x.amount_usd) : null
    const valuation = x.valuation_usd > 0 ? Math.round(x.valuation_usd) : null
    if (kind === 'round' && !amount && !valuation && vague(round)) continue // nothing to show
    const investors = (x.investors || []).filter((v) => v?.name?.trim()).slice(0, 12).map((v) => {
      const f = kind === 'acquisition' ? null : firmIx.match(v.name)
      return { name: v.name.trim().slice(0, 80), lead: !!v.lead, firm_slug: f?.slug || null }
    })
    const m = matchCompany(x.company)
    const announced = isoDay(x.announced_on) || isoDay(it.d) || new Date().toISOString().slice(0, 10)
    const companyName = m.co?.name || x.company.trim().slice(0, 80)
    const ev: PlannedEvent = {
      company_slug: m.co?.slug || null, cik: m.co?.cik || null, company_name: companyName,
      round, amount_usd: amount, valuation_usd: valuation, investors, announced_on: announced,
      source_url: it.l, source_name: src.name, source_tier: src.tier, headline: it.t.slice(0, 240),
      other_sources: [], confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)),
      dedupe_key: '', created_company: false, _match: m.how === 'none' ? 'none' : m.how, _action: 'insert',
    }
    cands.push(ev)
  }

  const coKey = (e: PlannedEvent) => e.company_slug || `name:${normCo(e.company_name)}`
  const merged: PlannedEvent[] = []
  // best tier first so the primary source is the best one; earlier date wins ties
  cands.sort((a, b) => a.source_tier - b.source_tier || a.announced_on.localeCompare(b.announced_on))
  for (const e of cands) {
    const hit = merged.find((m) => coKey(m) === coKey(e) && sameRound(m, e))
    if (!hit) { merged.push(e); continue }
    if (linkKey(hit.source_url) !== linkKey(e.source_url) && !hit.other_sources.some((o) => linkKey(o.url) === linkKey(e.source_url))) {
      hit.other_sources.push({ name: e.source_name, url: e.source_url, tier: e.source_tier, headline: e.headline })
    }
    // fill gaps from the other outlet, never overwrite what the better source said
    if (!hit.amount_usd && e.amount_usd) hit.amount_usd = e.amount_usd
    if (!hit.valuation_usd && e.valuation_usd) hit.valuation_usd = e.valuation_usd
    if (vague(hit.round) && !vague(e.round)) hit.round = e.round
    if (e.announced_on < hit.announced_on) hit.announced_on = e.announced_on
    for (const v of e.investors) if (!hit.investors.some((h) => normFirmFull(h.name) === normFirmFull(v.name))) hit.investors.push(v)
    hit.confidence = Math.max(hit.confidence, e.confidence)
  }

  // ---- rule 2: unmatched companies need a high-confidence firm match to be created
  for (const e of merged) {
    if (e.company_slug) continue
    const backed = e.round !== 'Acquisition' && e.round !== 'IPO' && e.investors.some((v) => v.firm_slug)
    if (!backed) { e._action = 'skip'; e._why = 'not in VC Constellation and no known investor'; continue }
    let slug = slugify(e.company_name)
    if (!slug) { e._action = 'skip'; e._why = 'unusable name'; continue }
    if (slugTaken.has(slug)) slug = `${slug}-${e.announced_on.slice(0, 4)}`
    slugTaken.add(slug)
    e.company_slug = slug
    e.created_company = true
    e._match = 'new'
  }

  // ---- dedupe against what is already stored
  const live = merged.filter((e) => e._action !== 'skip')
  let existing: any[] = []
  if (tableOk && live.length) {
    const since = new Date(Date.now() - (days + DEDUPE_DAYS + 2) * 86400_000).toISOString().slice(0, 10)
    const slugs = [...new Set(live.map((e) => e.company_slug!).filter(Boolean))]
    const { data } = await supabaseAdmin.from('vc_funding_events').select('*').in('company_slug', slugs).gte('announced_on', since)
    existing = data || []
  }
  for (const e of live) {
    e.dedupe_key = `${e.company_slug}|${roundKey(e.round)}|${e.announced_on}`
    const prev = existing.find((x) => x.company_slug === e.company_slug && sameRound(
      { round: x.round, amount_usd: x.amount_usd != null ? Number(x.amount_usd) : null, valuation_usd: x.valuation_usd != null ? Number(x.valuation_usd) : null, announced_on: x.announced_on },
      e,
    ))
    if (prev) { e._action = 'merge'; e._existingId = prev.id; e.created_company = false }
  }

  const result: RunResult = {
    dry: effectiveDry, days, tableMissing: !tableOk, scanned: raw.length, trusted: trusted.length, sentToModel: todo.length,
    extracted: extracted.length, events: merged, written: { inserted: 0, merged: 0, companiesCreated: 0 },
    costUsd: +costUsd.toFixed(4), notes,
  }
  logCost(costUsd, inTok, outTok, todo.length, effectiveDry)
  if (effectiveDry) return result

  // ---------------------------------------------------------------- write
  for (const e of live) {
    try {
      if (e._action === 'merge') {
        const prev = existing.find((x) => x.id === e._existingId)
        if (!prev) continue
        const others: any[] = Array.isArray(prev.other_sources) ? prev.other_sources : []
        const urls = new Set([linkKey(prev.source_url), ...others.map((o) => linkKey(o.url))])
        const add = [{ name: e.source_name, url: e.source_url, tier: e.source_tier, headline: e.headline }, ...e.other_sources].filter((o) => !urls.has(linkKey(o.url)))
        const patch: Record<string, any> = {}
        let nextOthers = [...others, ...add]
        if (e.source_tier < (prev.source_tier ?? 9)) {
          // better outlet now: promote it to primary, demote the old primary into the list
          nextOthers = [{ name: prev.source_name, url: prev.source_url, tier: prev.source_tier, headline: prev.headline }, ...others, ...e.other_sources]
            .filter((o) => linkKey(o.url) !== linkKey(e.source_url))
          Object.assign(patch, { source_url: e.source_url, source_name: e.source_name, source_tier: e.source_tier, headline: e.headline })
        }
        if (!prev.amount_usd && e.amount_usd) patch.amount_usd = e.amount_usd
        if (!prev.valuation_usd && e.valuation_usd) patch.valuation_usd = e.valuation_usd
        if (vague(prev.round) && !vague(e.round)) patch.round = e.round
        const prevInv: any[] = Array.isArray(prev.investors) ? prev.investors : []
        const newInv = e.investors.filter((v) => !prevInv.some((h) => normFirmFull(h.name) === normFirmFull(v.name)))
        if (newInv.length) patch.investors = [...prevInv, ...newInv]
        if (nextOthers.length !== others.length || patch.source_url) patch.other_sources = nextOthers
        if (Object.keys(patch).length) {
          const { error } = await supabaseAdmin.from('vc_funding_events').update(patch).eq('id', prev.id)
          if (error) notes.push(`merge ${e.company_name}: ${error.message}`); else result.written.merged++
        }
        continue
      }
      if (e.created_company) {
        // bare profile row only — no figures (those stay SEC/override-owned); the reported
        // block on the page shows the round
        const { error } = await supabaseAdmin.from('vc_companies').insert({ slug: e.company_slug, name: e.company_name })
        if (error) { notes.push(`create ${e.company_name}: ${error.message}`); continue }
        result.written.companiesCreated++
      }
      const { _match, _action, _why, _existingId, ...row } = e
      const { error } = await supabaseAdmin.from('vc_funding_events').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      if (error) notes.push(`insert ${e.company_name}: ${error.message}`); else result.written.inserted++
    } catch (err: any) {
      notes.push(`${e.company_name}: ${String(err?.message || err).slice(0, 120)}`)
    }
  }

  // remember processed headlines so tomorrow only pays for new ones
  const nextSeen = [...seenArr.filter((k) => !todo.some((t) => linkKey(t.it.l) === k)), ...todo.map((t) => linkKey(t.it.l))].slice(-SEEN_CAP)
  await supabaseAdmin.from('vc_ingest_meta').upsert({ key: SEEN_KEY, value: JSON.stringify(nextSeen), updated_at: new Date().toISOString() })
  await supabaseAdmin.from('vc_sync_log').insert({
    source: 'news-funding', filings_processed: todo.length, new_companies: result.written.companiesCreated,
    notes: `${result.written.inserted} new, ${result.written.merged} merged from ${todo.length} headlines (${days}d), $${costUsd.toFixed(3)}`,
  }).then(() => {}, () => {})
  return result
}

function logCost(costUsd: number, inTok: number, outTok: number, n: number, dry: boolean) {
  if (!inTok) return
  supabaseAdmin.from('vc_chat_runs').insert({
    conversation_id: null, model: MODEL, turns: 1, tools: [{ name: 'news-funding', n }],
    input_tokens: inTok, output_tokens: outTok, cost_usd: costUsd, duration_ms: 0, status: 'ok',
    error: `news-funding${dry ? ' (dry)' : ''}: ${n} headlines`,
  }).then(() => {}, () => {})
}

/** Undo: hide (or restore) one event. A company this module created is removed again when
 *  nothing else (investments, board seats, other visible events) points at it. */
export async function setFundingEventStatus(id: string, status: 'reported' | 'hidden'): Promise<{ ok: boolean; error?: string; removedCompany?: string }> {
  const { data: ev, error } = await supabaseAdmin.from('vc_funding_events').update({ status }).eq('id', id).select().maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!ev) return { ok: false, error: 'not found' }
  if (status !== 'hidden' || !ev.created_company || !ev.company_slug) return { ok: true }
  const { data: co } = await supabaseAdmin.from('vc_companies').select('id').eq('slug', ev.company_slug).maybeSingle()
  if (!co) return { ok: true }
  const [inv, seats, others] = await Promise.all([
    supabaseAdmin.from('vc_investments').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
    supabaseAdmin.from('vc_board_seats').select('id', { count: 'exact', head: true }).eq('company_id', co.id),
    supabaseAdmin.from('vc_funding_events').select('id', { count: 'exact', head: true }).eq('company_slug', ev.company_slug).eq('status', 'reported'),
  ])
  if ((inv.count || 0) + (seats.count || 0) + (others.count || 0) > 0) return { ok: true }
  const del = await supabaseAdmin.from('vc_companies').delete().eq('id', co.id)
  return del.error ? { ok: true, error: `event hidden; company kept: ${del.error.message}` } : { ok: true, removedCompany: ev.company_slug }
}

/** Visible events, newest first — shared by /graph and /feed. Empty when the table is missing. */
export async function listFundingEvents(limit = 2000): Promise<any[]> {
  const { data, error } = await supabaseAdmin.from('vc_funding_events')
    .select('id,company_slug,cik,company_name,round,amount_usd,valuation_usd,investors,announced_on,source_url,source_name,source_tier,headline,other_sources,confidence,created_company,created_at')
    .eq('status', 'reported').order('announced_on', { ascending: false }).limit(limit)
  if (error) { console.warn('[news-funding] list skipped:', error.message); return [] }
  return data || []
}
