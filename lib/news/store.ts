// News reader — Supabase storage helpers (service-role; server-only).
import { supabaseAdmin } from '@/lib/supabase'
import type { Item, Stat, Monitor } from './feeds'

// ---- shared feed cache (refreshed by cron) ----
// AI briefs live in news_macro_cache row id=2 (NOT a row in news_feed_cache) so older
// deployed code — which reads every news_feed_cache row as a section — never trips on them.
const BRIEFS_ID = 2

export async function getFeedCache(): Promise<Record<string, Item[]>> {
  const { data } = await supabaseAdmin.from('news_feed_cache').select('section, items')
  const out: Record<string, Item[]> = {}
  for (const r of data || []) {
    if ((r.section as string).startsWith('__')) continue // defensive: ignore any non-section rows
    out[r.section as string] = (r.items as Item[]) || []
  }
  return out
}

export async function setFeedCache(bySection: Record<string, Item[]>, briefs: Record<string, string> = {}): Promise<void> {
  const now = new Date().toISOString()
  const rows = Object.entries(bySection).map(([section, items]) => ({ section, items, updated_at: now }))
  if (rows.length) await supabaseAdmin.from('news_feed_cache').upsert(rows)
  await supabaseAdmin.from('news_macro_cache').upsert({ id: BRIEFS_ID, stats: briefs, updated_at: now })
}

// AI "what matters today" line per curated section (set by cron). Stored apart from the macro strip (id=1).
export async function getSectionBriefs(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('news_macro_cache').select('stats').eq('id', BRIEFS_ID).maybeSingle()
  const b = data?.stats
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, string>) : {}
}

// Per-section natural-language curation instructions (e.g. "only $50M+ rounds"). Global (one
// config for the shared feed) — stored in macro row id=3. Read by cron, edited via the UI.
const INSTRUCTIONS_ID = 3
export async function getSectionInstructions(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('news_macro_cache').select('stats').eq('id', INSTRUCTIONS_ID).maybeSingle()
  const b = data?.stats
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, string>) : {}
}
export async function setSectionInstruction(section: string, instruction: string): Promise<void> {
  const cur = await getSectionInstructions()
  if (instruction.trim()) cur[section] = instruction.trim()
  else delete cur[section]
  await supabaseAdmin.from('news_macro_cache').upsert({ id: INSTRUCTIONS_ID, stats: cur, updated_at: new Date().toISOString() })
}

// Update a single section's cached items + its brief (used for instant re-curation on edit).
export async function updateSectionCache(section: string, items: Item[], brief: string): Promise<void> {
  const now = new Date().toISOString()
  await supabaseAdmin.from('news_feed_cache').upsert({ section, items, updated_at: now })
  const briefs = await getSectionBriefs()
  briefs[section] = brief
  await supabaseAdmin.from('news_macro_cache').upsert({ id: BRIEFS_ID, stats: briefs, updated_at: now })
}

export async function getStatsCache(): Promise<Record<string, Stat>> {
  const { data } = await supabaseAdmin.from('news_macro_cache').select('stats').eq('id', 1).maybeSingle()
  const s = data?.stats
  return s && !Array.isArray(s) ? (s as Record<string, Stat>) : {}
}

export async function setStatsCache(stats: Record<string, Stat>): Promise<void> {
  await supabaseAdmin.from('news_macro_cache').upsert({ id: 1, stats, updated_at: new Date().toISOString() })
}

export async function feedCacheAgeMs(): Promise<number | null> {
  const ts = await feedCacheUpdatedAt()
  return ts ? Date.now() - new Date(ts).getTime() : null
}

// ISO timestamp of the most recent feed refresh (for the "last updated" stamp in the header).
export async function feedCacheUpdatedAt(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('news_feed_cache').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return (data?.updated_at as string) || null
}

// ---- per-user state (keyed by email = session.user.email) ----
export type Topic = { query: string; route?: any; brief?: string; items?: Item[]; brief_at?: string }

export async function getUserTopics(email: string): Promise<Topic[]> {
  const { data, error } = await supabaseAdmin
    .from('news_topics').select('query, route, brief, items')
    .eq('user_email', email).order('created_at', { ascending: false })
  if (error) console.error('getUserTopics', error.message)
  return (data as Topic[]) || []
}

export async function upsertUserTopic(email: string, t: Topic): Promise<void> {
  const { error } = await supabaseAdmin.from('news_topics').upsert(
    // brief_at lives inside route jsonb (no schema change needed)
    { user_email: email, query: t.query, route: { ...(t.route ?? {}), brief_at: t.brief_at ?? new Date().toISOString() },
      brief: t.brief ?? null, items: t.items ?? [] },
    { onConflict: 'user_email,query' })
  if (error) console.error('upsertUserTopic', error.message)
}

export async function deleteUserTopic(email: string, query: string): Promise<void> {
  await supabaseAdmin.from('news_topics').delete().eq('user_email', email).eq('query', query)
}

export async function getPrefs(email: string): Promise<{ lang: string; layout: any }> {
  const { data } = await supabaseAdmin.from('news_prefs').select('lang, layout').eq('user_email', email).maybeSingle()
  return { lang: (data?.lang as string) || 'en', layout: data?.layout ?? {} }
}

export async function setPrefs(email: string, prefs: { lang?: string; layout?: any }): Promise<void> {
  await supabaseAdmin.from('news_prefs').upsert(
    { user_email: email, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
}

// Per-user video sections — stored in news_prefs.layout.videos (no new table needed).
export type VideoSection = { key: string; label: string; channels: { name: string; cid: string }[]; items: Item[] }

export async function getUserVideos(email: string): Promise<VideoSection[]> {
  const { layout } = await getPrefs(email)
  return (layout?.videos as VideoSection[]) || []
}

export async function setUserVideos(email: string, videos: VideoSection[]): Promise<void> {
  const { lang, layout } = await getPrefs(email)
  await setPrefs(email, { lang, layout: { ...(layout || {}), videos } })
}

// Per-user "Monitors" (developing situations) — stored in news_prefs.layout.monitors.
export async function getUserMonitors(email: string): Promise<Monitor[]> {
  const { layout } = await getPrefs(email)
  return (layout?.monitors as Monitor[]) || []
}
export async function setUserMonitors(email: string, monitors: Monitor[]): Promise<void> {
  const { lang, layout } = await getPrefs(email)
  await setPrefs(email, { lang, layout: { ...(layout || {}), monitors } })
}

export async function getProfile(email: string): Promise<any> {
  const { data } = await supabaseAdmin.from('news_profile').select('profile').eq('user_email', email).maybeSingle()
  return data?.profile ?? { s: {}, k: {}, w: {} }
}

export async function setProfile(email: string, profile: any): Promise<void> {
  await supabaseAdmin.from('news_profile').upsert(
    { user_email: email, profile, updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
}

// User-added individual tickers for the belt (global config, macro row id=7). Quoted via CNBC.
export type CustomTicker = { symbol: string; label: string }
const TICKERS_ID = 7
export async function getCustomTickers(): Promise<CustomTicker[]> {
  const { data } = await supabaseAdmin.from('news_macro_cache').select('stats').eq('id', TICKERS_ID).maybeSingle()
  return Array.isArray(data?.stats) ? (data!.stats as CustomTicker[]) : []
}
export async function setCustomTickers(tickers: CustomTicker[]): Promise<void> {
  await supabaseAdmin.from('news_macro_cache').upsert({ id: TICKERS_ID, stats: tickers.slice(0, 40), updated_at: new Date().toISOString() })
}

// Global source tiers — { top: float to the top, muted: hidden } — applied across all sections.
// Stored in macro row id=6 (one config for the shared feed).
const TIERS_ID = 6
export async function getSourceTiers(): Promise<{ top: string[]; muted: string[] }> {
  const { data } = await supabaseAdmin.from('news_macro_cache').select('stats').eq('id', TIERS_ID).maybeSingle()
  const s: any = data?.stats || {}
  return { top: Array.isArray(s.top) ? s.top : [], muted: Array.isArray(s.muted) ? s.muted : [] }
}
export async function setSourceTiers(t: { top: string[]; muted: string[] }): Promise<void> {
  await supabaseAdmin.from('news_macro_cache').upsert({ id: TIERS_ID, stats: t, updated_at: new Date().toISOString() })
}

// News → VC Constellation: enrichment requests from the ◆ map button (macro row id=8).
// The nightly /api/vc/enrich-cron consumes these first, ahead of its automatic feeds.
const VC_REQUESTS_ID = 8
export type VcEnrichRequest = { company: string; round?: string; headline?: string; by: string; at: string }
export async function getVcEnrichRequests(): Promise<VcEnrichRequest[]> {
  const { data } = await supabaseAdmin.from('news_macro_cache').select('stats').eq('id', VC_REQUESTS_ID).maybeSingle()
  return Array.isArray(data?.stats) ? (data!.stats as VcEnrichRequest[]) : []
}
export async function setVcEnrichRequests(reqs: VcEnrichRequest[]): Promise<void> {
  await supabaseAdmin.from('news_macro_cache').upsert({ id: VC_REQUESTS_ID, stats: reqs.slice(0, 30), updated_at: new Date().toISOString() })
}

// Users with at least one push-subscribed device AND an alert-enabled monitor (for the cron).
export async function getPushAlertUsers(): Promise<{ email: string; lang: string; layout: any }[]> {
  const { data } = await supabaseAdmin.from('news_prefs').select('user_email, lang, layout')
  return (data || [])
    .filter((r) => {
      const l: any = r.layout || {}
      return Array.isArray(l.push) && l.push.length && Array.isArray(l.monitors) && l.monitors.some((m: any) => m.alerts)
    })
    .map((r) => ({ email: r.user_email as string, lang: (r.lang as string) || 'en', layout: r.layout }))
}

// Emails of users who opted into the daily digest (prefs.layout.digest === true).
export async function getDigestRecipients(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('news_prefs').select('user_email, layout')
  return (data || []).filter((r) => (r.layout as any)?.digest).map((r) => r.user_email as string)
}

// ---- user suggestions ("what else would you like to see?") — macro row id=5, newest first ----
const SUGGESTIONS_ID = 5
export async function addSuggestion(email: string, text: string): Promise<void> {
  const { data } = await supabaseAdmin.from('news_macro_cache').select('stats').eq('id', SUGGESTIONS_ID).maybeSingle()
  const arr = Array.isArray(data?.stats) ? (data!.stats as any[]) : []
  arr.unshift({ email, text, at: new Date().toISOString() })
  await supabaseAdmin.from('news_macro_cache').upsert({ id: SUGGESTIONS_ID, stats: arr.slice(0, 200), updated_at: new Date().toISOString() })
}

// ---- shared translation cache (link -> es) ----
export async function getTranslations(links: string[]): Promise<Record<string, string>> {
  if (!links.length) return {}
  const { data } = await supabaseAdmin.from('news_translations').select('link, es').in('link', links)
  const out: Record<string, string> = {}
  for (const r of data || []) if (r.es) out[r.link as string] = r.es as string
  return out
}

export async function setTranslations(map: Record<string, string>): Promise<void> {
  const now = new Date().toISOString()
  const rows = Object.entries(map).map(([link, es]) => ({ link, es, updated_at: now }))
  if (rows.length) await supabaseAdmin.from('news_translations').upsert(rows)
}
