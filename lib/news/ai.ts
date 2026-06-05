// News reader — AI layer (Anthropic). All of this is gated behind login at the route level.
import Anthropic from '@anthropic-ai/sdk'
import { searchTopic, resolveChannel, channelItems, interleaveBySource, type Item, type Route } from './feeds'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001'

async function claudeText(prompt: string, maxTokens = 800, system?: string): Promise<string> {
  const m = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  })
  return m.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('').trim()
}

function jsonFrom(txt: string): any {
  const m = txt.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

export async function classifyTopic(query: string): Promise<Route> {
  const prompt =
    `A user wants a news briefing on: "${query}".\n` +
    'Return ONLY a JSON object picking Google News settings that surface the most AUTHORITATIVE, ' +
    'detailed, current sources for THIS specific topic:\n' +
    '{"query":"<concise search query>","hl":"<e.g. en-US or es-419>","gl":"<country e.g. US, CL, AR, GB>",' +
    '"ceid":"<e.g. US:en or CL:es>","sites":["up to 4 source domains; [] if none clearly dominate"]}\n' +
    'Guidance: NBA/NFL/MLB -> espn.com,theathletic.com,nba.com (US:en). Chilean topics/politics -> ' +
    'emol.com,latercera.com,biobiochile.cl (CL, es-419). World Cup/soccer -> ole.com.ar,marca.com,' +
    'globoesporte.globo.com,bbc.com (AR or ES locale). Tech/startups/funding -> techcrunch.com,theinformation.com. ' +
    'Markets/econ -> bloomberg.com,wsj.com,cnbc.com. JSON only, no prose.'
  try {
    return jsonFrom(await claudeText(prompt, 300)) || {}
  } catch {
    return {}
  }
}

export async function brief(query: string, items: Item[], lang = 'en'): Promise<string> {
  const arts = items.slice(0, 18).map((it) => `- ${it.t} (${it.s})`).join('\n')
  const prompt =
    lang === 'es'
      ? `Eres un asistente de briefing rápido. Una persona ocupada tiene una reunión en ~15 minutos sobre: ` +
        `"${query}". Aquí están los titulares actuales.\n\n${arts}\n\n` +
        'Escribe un briefing breve y concreto EN ESPAÑOL, EN TEXTO PLANO, con exactamente estas tres partes, ' +
        'con estos encabezados en mayúsculas en su propia línea:\nLO QUE NECESITAS SABER:\n(5 viñetas, cada una con "- ")\n' +
        'LA HISTORIA AHORA:\n(2 oraciones)\nPREGUNTAS INTELIGENTES PARA HACER:\n(3 viñetas con "- ")\nSin preámbulo.'
      : `You are a fast briefing assistant. A busy founder has a meeting in ~15 minutes about: "${query}". ` +
        `Below are current headlines.\n\n${arts}\n\n` +
        'Write a tight, concrete briefing in PLAIN TEXT with exactly these three parts, using these exact ' +
        'uppercase headers on their own lines:\nWHAT YOU NEED TO KNOW:\n(5 bullets, each starting with "- ")\n' +
        'THE STORY RIGHT NOW:\n(2 sentences)\nSMART QUESTIONS TO ASK:\n(3 bullets, each starting with "- ")\nNo preamble.'
  try {
    return await claudeText(prompt, 800)
  } catch (e: any) {
    return `Rundown unavailable (${String(e?.message || e).slice(0, 80)}). Articles below.`
  }
}

export type BuiltTopic = { query: string; route: Route; brief: string; items: Item[]; brief_at: string; lang: string }

export async function buildTopic(query: string, lang = 'en'): Promise<BuiltTopic> {
  const r = await classifyTopic(query)
  const route: Route = { sites: r.sites || null, hl: r.hl || 'en-US', gl: r.gl || 'US', ceid: r.ceid, query: r.query || query }
  let items = await searchTopic(route.query!, route, { when: '4d', maxAgeDays: 5 })
  if (items.length < 3) items = await searchTopic(route.query!, { hl: route.hl, gl: route.gl, ceid: route.ceid }, { when: '7d', maxAgeDays: 9 })
  if (items.length < 3) items = await searchTopic(query, {}, { when: '14d', maxAgeDays: 16 })
  const b = await brief(query, items, lang)
  return { query, route, brief: b, items: items.slice(0, 14), brief_at: new Date().toISOString(), lang }
}

export type SetupResult = { type: 'questions' | 'done' | 'error'; reply?: string; questions?: string[]; topics?: string[] }

const SETUP_SYS =
  'You are the setup assistant for a personal news dashboard. Goal: in AT MOST one round of 2-3 short ' +
  'questions, learn the user\'s interests, then propose topic sections. Respond with ONLY a JSON object ' +
  '(no prose outside it), in one of two shapes:\n' +
  '{"type":"questions","reply":"<one friendly sentence>","questions":["q1","q2"]}\n' +
  '{"type":"done","reply":"<one friendly sentence>","topics":["topic 1","topic 2"]}\n' +
  'Pick AT MOST 3 broad, searchable topic queries that together cover the interests. Prefer "done" as soon ' +
  'as you reasonably can. Match the user\'s language.'

export async function setupChat(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<SetupResult> {
  try {
    const m = await anthropic.messages.create({ model: MODEL, max_tokens: 700, system: SETUP_SYS, messages })
    const txt = m.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('')
    return jsonFrom(txt) || { type: 'questions', reply: 'Tell me a bit more — what topics?', questions: [] }
  } catch (e: any) {
    return { type: 'error', reply: `Setup error: ${String(e?.message || e).slice(0, 100)}` }
  }
}

export async function classifyChannels(desc: string): Promise<{ label: string; channels: string[] }> {
  const fallback = { label: desc.slice(0, 40), channels: [desc] }
  const prompt =
    `A user wants a new YouTube video section described as: "${desc}".\n` +
    'Return ONLY JSON: {"label":"<short section title, max 4 words>","channels":["exact channel name or @handle", ...]}\n' +
    'Include the channels they named PLUS 4-6 SIMILAR popular YouTube channels in the same niche. 8-12 total. ' +
    'Use well-known exact names/handles so they resolve. JSON only.'
  try {
    return jsonFrom(await claudeText(prompt, 400)) || fallback
  } catch {
    return fallback
  }
}

export type VideoSection = { key: string; label: string; channels: { name: string; cid: string }[]; items: Item[] }

export async function buildVideoSection(desc: string): Promise<VideoSection> {
  const { label, channels } = await classifyChannels(desc)
  const seen = new Set<string>()
  const chans: { name: string; cid: string }[] = []
  let items: Item[] = []
  for (const nm of (channels || []).slice(0, 12)) {
    const r = await resolveChannel(nm)
    if (!r || seen.has(r.cid)) continue
    seen.add(r.cid)
    chans.push({ name: r.title, cid: r.cid })
    items = items.concat(await channelItems(r.cid, r.title))
  }
  items = interleaveBySource(items)
  const slug = (label || 'videos').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'videos'
  return { key: 'vt_' + slug, label: (label || desc).slice(0, 40), channels: chans, items: items.slice(0, 30) }
}

export async function translateTitles(titles: string[]): Promise<string[]> {
  if (!titles.length) return []
  const prompt =
    'Translate these news headlines to natural, concise Spanish. Return ONLY a JSON array of strings — ' +
    `same order, exactly ${titles.length} items, no extra text:\n${JSON.stringify(titles)}`
  try {
    const m = (await claudeText(prompt, 2000)).match(/\[[\s\S]*\]/)
    const arr = m ? JSON.parse(m[0]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
