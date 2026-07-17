// News reader — AI layer (Anthropic). All of this is gated behind login at the route level.
import Anthropic from '@anthropic-ai/sdk'
import { searchTopic, resolveChannel, channelItems, interleaveBySource, type Item, type Route, type Monitor, type MonitorCard } from './feeds'

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

// News → VC Constellation bridge: pull {company, round} out of funding-section headlines.
// Used by the ◆ map button (single headline) and the nightly enrich-cron feed (b) (batch).
export async function extractFundingCompanies(headlines: string[]): Promise<{ company: string; round?: string }[]> {
  if (!headlines.length) return []
  const prompt =
    'From these startup-funding headlines, extract the companies that RAISED money (ignore investors, funds, acquirers). ' +
    'Respond with ONLY JSON: {"companies":[{"company":"<official company name>","round":"<round + amount if stated, e.g. \'Series B $55M\'>"}]}. ' +
    'Skip headlines that are not about one specific company raising a round.\n\n' +
    headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
  const j = jsonFrom(await claudeText(prompt, 900))
  const arr = Array.isArray(j?.companies) ? j.companies : []
  return arr
    .filter((c: any) => c?.company && typeof c.company === 'string')
    .map((c: any) => ({ company: c.company.trim().slice(0, 80), round: typeof c.round === 'string' ? c.round.trim().slice(0, 60) : undefined }))
}

export async function classifyTopic(query: string): Promise<Route & { kind?: string; enrich?: string }> {
  const prompt =
    `A user wants a news briefing on: "${query}".\n` +
    'Return ONLY a JSON object picking Google News settings that surface the most AUTHORITATIVE, ' +
    'detailed, current sources for THIS specific topic:\n' +
    '{"query":"<concise search query>","hl":"<e.g. en-US or es-419>","gl":"<country e.g. US, CL, AR, GB>",' +
    '"ceid":"<e.g. US:en or CL:es>","sites":["up to 4 source domains; [] if none clearly dominate"],' +
    '"kind":"earnings|sports|company|event|generic",' +
    '"enrich":"<a focused query (NO site filter) that surfaces the HARD FACTS: for earnings add words like ' +
    'revenue EPS estimate beat miss billion; for sports add score result final fixtures; else \\"\\">"}\n' +
    'Guidance: NBA/NFL/MLB -> espn.com,theathletic.com,nba.com (US:en). Chilean topics/politics -> ' +
    'emol.com,latercera.com,biobiochile.cl (CL, es-419). World Cup/soccer -> ole.com.ar,marca.com,' +
    'globoesporte.globo.com,bbc.com (AR or ES locale). Tech/startups/funding -> techcrunch.com,theinformation.com. ' +
    'Markets/econ -> bloomberg.com,wsj.com,cnbc.com. JSON only, no prose.'
  try {
    return jsonFrom(await claudeText(prompt, 350)) || {}
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

// Curate one standard section: collapse near-duplicate stories (the same event reported by
// 6 outlets), re-rank by genuine importance (not just recency), and write a tight "what
// matters today" line. Runs in the shared cron, so the cost is amortized across all users.
export async function curateSection(
  label: string,
  items: Item[],
  lang = 'en',
  instruction = '',
): Promise<{ items: Item[]; brief: string }> {
  if (items.length < 3) return { items, brief: '' }
  const pool = items.slice(0, 45)
  const list = pool.map((it, i) => `${i}. ${it.t} — ${it.s}`).join('\n')
  const langLine = lang === 'es' ? 'Write "brief" in Spanish.' : 'Write "brief" in English.'
  // The user's per-section instruction, if any. It can add priorities, EXCLUDE a source/topic,
  // or bias toward a viewpoint — and must be followed literally (even dropping notable stories).
  const instrLine = instruction.trim()
    ? `\nUSER INSTRUCTIONS for this section — follow them literally:\n"${instruction.trim()}"\n` +
      `They may tell you to EXCLUDE a source or topic (then OMIT those stories entirely from "order"), ` +
      `to FAVOR a viewpoint/topic/source (then rank those first and include more of them), or what to ` +
      `prioritise. Apply them even if it means dropping otherwise-notable stories.\n`
    : ''
  const keepLine = instruction.trim()
    ? 'Include the stories that fit the instructions (usually 12-20; fewer is fine if the instructions exclude a lot).'
    : 'Keep 14-20 indices.'
  const prompt =
    `You are curating the "${label}" section of a personal news dashboard. Below are ${pool.length} ` +
    `headlines (index. title — source), some of which cover the SAME event from different outlets.\n${instrLine}\n${list}\n\n` +
    'Return ONLY a JSON object:\n' +
    '{"order":[<indices, most important first, ONE per real-world story — drop near-duplicates>],' +
    '"brief":"<1-2 sentences: the single most important thing in this section right now and why it matters>"}\n' +
    'Rank by importance and impact, not recency. ' + keepLine + ' ' + langLine + ' JSON only, no prose.'
  try {
    const j = jsonFrom(await claudeText(prompt, 700))
    const order: number[] = Array.isArray(j?.order) ? j.order : []
    const brief: string = typeof j?.brief === 'string' ? j.brief.trim() : ''
    if (!order.length) return { items, brief }
    const picked: Item[] = []
    const used = new Set<number>()
    for (const i of order) {
      if (Number.isInteger(i) && i >= 0 && i < pool.length && !used.has(i)) {
        used.add(i)
        picked.push(pool[i])
      }
    }
    // With NO instruction this is dedup/rank only — append the unranked items so we never lose
    // coverage. WITH an instruction, the order IS the final set, so exclusions actually stick.
    if (!instruction.trim()) pool.forEach((it, i) => { if (!used.has(i)) picked.push(it) })
    return { items: picked.length ? picked : items, brief }
  } catch {
    return { items, brief: '' }
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

// Refresh a pinned topic in place: re-pull items with the stored route (no classify call),
// and only re-write the AI brief when it's gone stale — so the general ↻ can refresh every
// topic without paying an AI call per section per click.
const TOPIC_BRIEF_TTL = 6 * 3600 * 1000
export async function refreshTopic(t: { query: string; route?: any; brief?: string }, lang = 'en'): Promise<BuiltTopic> {
  const route: Route & { brief_at?: string } = t.route || {}
  const q = route.query || t.query
  let items = await searchTopic(q, route, { when: '4d', maxAgeDays: 5 })
  if (items.length < 3) items = await searchTopic(q, { hl: route.hl, gl: route.gl, ceid: route.ceid }, { when: '7d', maxAgeDays: 9 })
  if (items.length < 3) items = await searchTopic(t.query, {}, { when: '14d', maxAgeDays: 16 })
  const briefAt = route.brief_at ? Date.parse(route.brief_at) : 0
  const stale = !t.brief || !briefAt || Date.now() - briefAt > TOPIC_BRIEF_TTL
  const b = stale && items.length ? await brief(t.query, items, lang) : t.brief || ''
  return { query: t.query, route, brief: b, items: items.slice(0, 14), brief_at: stale ? new Date().toISOString() : route.brief_at || new Date().toISOString(), lang }
}

// "Monitor the situation": fetch the latest on a developing story, preserving when each item
// was first seen (so the UI can mark what's NEW), plus a short "what's developing / watch next" line.
async function monitorBrief(query: string, items: Item[], lang: string): Promise<string> {
  const arts = items.slice(0, 12).map((it) => `- ${it.t} (${it.s})`).join('\n')
  const prompt =
    `A user is MONITORING this developing situation: "${query}". Latest headlines, newest first:\n\n${arts}\n\n` +
    `In ${lang === 'es' ? 'SPANISH' : 'ENGLISH'}, write 1-2 plain-text sentences: the latest development and what to watch next. No preamble.`
  try {
    return await claudeText(prompt, 250)
  } catch {
    return ''
  }
}

// Classify the situation and extract a type-specific "card" from the headlines, for an adaptive
// layout. Critically: never invent numbers — leave a field blank if the coverage doesn't state it.
async function monitorCard(query: string, items: Item[]): Promise<MonitorCard | undefined> {
  const arts = items.slice(0, 18).map((it) => `- ${it.t}`).join('\n')
  const prompt =
    `A user is monitoring: "${query}". Recent headlines:\n${arts}\n\n` +
    'Classify the situation and extract what the HEADLINES actually state. Return ONLY this JSON:\n' +
    '{"type":"earnings|sports|company|event|generic","card":{...}}\n' +
    'Pick the type by subject: a company reporting results -> earnings; a team, league, match, ' +
    'or tournament -> sports; otherwise company/event/generic.\n' +
    'Card shape by type:\n' +
    '- earnings: {"company":"","reportDate":"<when it reports, or \\"\\" if unknown>","reported":true|false,' +
    '"revenue":"","revenueEst":"","eps":"","epsEst":"","verdict":"<e.g. Beat on EPS, missed revenue / Not reported yet>"}\n' +
    '  Scan EVERY headline for hard figures — revenue (e.g. "$10.8B"), EPS, growth %, and any analyst ' +
    'estimate/expectation ("vs $X expected") — and fill revenue/revenueEst/eps/epsEst if a headline states them.\n' +
    '- sports: {"competition":"","results":[{"label":"Team A 2-1 Team B","detail":"Final"}],"fixtures":[{"label":"Team C vs Team D","when":"Sat"}]}\n' +
    '  For sports ALWAYS fill what the headlines imply: completed matches (with score ONLY if stated) go in ' +
    '"results"; upcoming or just-announced matchups go in "fixtures" (a matchup with no score is a fixture, not a result).\n' +
    '- company|event|generic: {"headline":"<one-line current status>"}\n' +
    'CRITICAL: never invent numbers, scores, or dates — only use what a headline states; otherwise leave "" or omit. JSON only.'
  try {
    const j = jsonFrom(await claudeText(prompt, 600))
    if (!j || !j.type) return undefined
    return { type: j.type, ...(j.card || {}) } as MonitorCard
  } catch {
    return undefined
  }
}

export async function buildMonitor(query: string, lang = 'en', prev?: Monitor): Promise<Monitor> {
  const r = await classifyTopic(query)
  const route: Route = { sites: r.sites || null, hl: r.hl || 'en-US', gl: r.gl || 'US', ceid: r.ceid, query: r.query || query }
  // Two searches: the base recency feed, plus an "enrichment" query biased toward the recap
  // headlines that actually STATE the figures (revenue/EPS/score/beat-miss). Article bodies sit
  // behind Google News's obfuscated links, but these number-bearing headlines are served reliably.
  // The enrichment search drops the site restriction (keeps locale) and uses a fact-seeking query
  // (from classifyTopic) — the headlines that state hard figures often come from smaller finance/
  // sports outlets, not the few big sites classifyTopic pins. This is what surfaces "revenue $10.8B".
  const broad: Route = { hl: route.hl, gl: route.gl, ceid: route.ceid }
  const enrichQ = r.enrich && r.enrich.trim() ? r.enrich.trim() : ''
  const [base, enrich] = await Promise.all([
    searchTopic(route.query!, route, { when: '3d', maxAgeDays: 4, limit: 18 }),
    enrichQ ? searchTopic(enrichQ, broad, { when: '4d', maxAgeDays: 5, limit: 14 }) : Promise.resolve([] as Item[]),
  ])
  const byLink = new Map<string, Item>()
  for (const it of [...base, ...enrich]) if (!byLink.has(it.l)) byLink.set(it.l, it)
  let items = Array.from(byLink.values()).sort((a, b) => (Date.parse(b.d || '') || 0) - (Date.parse(a.d || '') || 0))
  if (items.length < 3) items = await searchTopic(query, {}, { when: '7d', maxAgeDays: 8, limit: 20 })
  const now = new Date().toISOString()
  const prevFirst = new Map((prev?.items || []).map((it) => [it.l, it.first || now]))
  const merged = items.map((it) => ({ ...it, first: prevFirst.get(it.l) || now }))
  // Card extraction sees the fact-seeking enrichment headlines FIRST so figures aren't crowded out
  // by reaction coverage; the brief + timeline use the recency-sorted merge.
  const cardInput = [...enrich, ...merged].filter((it, i, a) => a.findIndex((x) => x.l === it.l) === i)
  const [brief, card] = await Promise.all([monitorBrief(query, merged, lang), monitorCard(query, cardInput)])
  return { query, items: merged.slice(0, 20), brief, card, updated_at: now, ...(prev?.alerts ? { alerts: true } : {}) }
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

export async function translateTitles(titles: string[], target: 'en' | 'es' = 'es'): Promise<string[]> {
  if (!titles.length) return []
  const langName = target === 'en' ? 'English' : 'Spanish'
  const prompt =
    `Translate these news headlines to natural, concise ${langName}. If a headline is ALREADY in ${langName}, ` +
    `return it unchanged. Return ONLY a JSON array of strings — ` +
    `same order, exactly ${titles.length} items, no extra text:\n${JSON.stringify(titles)}`
  try {
    const m = (await claudeText(prompt, 2500)).match(/\[[\s\S]*\]/)
    const arr = m ? JSON.parse(m[0]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
