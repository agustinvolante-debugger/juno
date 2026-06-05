// News reader — Supabase storage helpers (service-role; server-only).
import { supabaseAdmin } from '@/lib/supabase'
import type { Item, Stat } from './feeds'

// ---- shared feed cache (refreshed by cron) ----
export async function getFeedCache(): Promise<Record<string, Item[]>> {
  const { data } = await supabaseAdmin.from('news_feed_cache').select('section, items')
  const out: Record<string, Item[]> = {}
  for (const r of data || []) out[r.section as string] = (r.items as Item[]) || []
  return out
}

export async function setFeedCache(bySection: Record<string, Item[]>): Promise<void> {
  const now = new Date().toISOString()
  const rows = Object.entries(bySection).map(([section, items]) => ({ section, items, updated_at: now }))
  if (rows.length) await supabaseAdmin.from('news_feed_cache').upsert(rows)
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
  const { data } = await supabaseAdmin
    .from('news_feed_cache').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (!data?.updated_at) return null
  return Date.now() - new Date(data.updated_at as string).getTime()
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

export async function getProfile(email: string): Promise<any> {
  const { data } = await supabaseAdmin.from('news_profile').select('profile').eq('user_email', email).maybeSingle()
  return data?.profile ?? { s: {}, k: {}, w: {} }
}

export async function setProfile(email: string, profile: any): Promise<void> {
  await supabaseAdmin.from('news_profile').upsert(
    { user_email: email, profile, updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
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
