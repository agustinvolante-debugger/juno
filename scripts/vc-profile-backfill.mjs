// One-off firmographics backfill for curated companies (Phase 2 of the pitchbook plan).
// For each company missing profile_updated_at: ONE web-searched Claude call → website,
// one-line description, founders/CEO, founded year, headcount estimate, HQ → written
// live to vc_companies (low-risk firmographics; source URL stored). Cost logs to
// vc_chat_runs (conversation_id null) like the other unattended runs.
//
//   node --env-file=.env.local scripts/vc-profile-backfill.mjs --cap 5
//
// Requires migration 012 (script fails fast with a clear message if columns are missing).
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const cap = Math.max(1, Math.min(Number(process.argv[process.argv.indexOf('--cap') + 1]) || 5, 200))
const MODEL = 'claude-sonnet-5'
const PRICE = { in: 3, out: 15 }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE)
const anthropic = new Anthropic()

const probe = await sb.from('vc_companies').select('profile_updated_at').limit(1)
if (probe.error) { console.error('Missing profile columns — apply supabase/migrations/012_vc_company_profile.sql first.'); process.exit(1) }

const { data: targets } = await sb.from('vc_companies')
  .select('id,slug,name,sector,location')
  .is('profile_updated_at', null)
  .order('created_at', { ascending: true })
  .limit(cap)

console.log(`Backfilling ${targets?.length || 0} companies (cap ${cap})…`)
let spent = 0
for (const co of targets || []) {
  const prompt =
    `Research the venture-backed company "${co.name}"${co.sector ? ` (${co.sector} space)` : ''} on the web and respond with ONLY JSON:\n` +
    '{"website":"<primary domain or null>","description":"<one line, <=160 chars, what it does, or null>",' +
    '"founders":"<founders/CEO display text, e.g. \'Jane Doe (CEO), John Smith\', or null>","foundedYear":<year or null>,' +
    '"headcountText":"<estimate as text, e.g. \'~50-100 (LinkedIn est.)\', or null>","hq":"<city, state or null>",' +
    '"sourceUrl":"<the URL that best confirms these facts>"}\n' +
    'Only include facts your web results actually establish; use null otherwise. If several companies share the name, pick the venture-backed startup that matches the sector.'
  const usage = { in: 0, out: 0 }
  let webSearches = 0
  let text = ''
  const startedAt = Date.now()
  try {
    const messages = [{ role: 'user', content: prompt }]
    for (let turn = 0; turn < 5; turn++) {
      const res = await anthropic.messages.create({
        model: MODEL, max_tokens: 900,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages,
      })
      usage.in += res.usage.input_tokens || 0
      usage.out += res.usage.output_tokens || 0
      webSearches += res.usage.server_tool_use?.web_search_requests || 0
      const t = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ')
      if (t.trim()) text = t
      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue }
      break
    }
  } catch (e) {
    console.log(`  ✗ ${co.name}: ${String(e.message || e).slice(0, 100)}`)
    continue
  }
  const cost = (usage.in * PRICE.in + usage.out * PRICE.out) / 1e6 + webSearches * 0.01
  spent += cost
  await sb.from('vc_chat_runs').insert({
    conversation_id: null, model: MODEL, turns: 1, tools: [{ name: 'profile-backfill', ms: Date.now() - startedAt }],
    input_tokens: usage.in, output_tokens: usage.out, cost_usd: cost, duration_ms: Date.now() - startedAt,
    status: 'ok', error: `profile-backfill: ${co.name}`,
  }).then(() => {}, () => {})

  let j = null
  try { j = JSON.parse((text.match(/\{[\s\S]*\}/) || ['null'])[0]) } catch { j = null }
  if (!j || !j.sourceUrl) { console.log(`  – ${co.name}: nothing solid found ($${cost.toFixed(3)})`); continue }
  const patch = { profile_source_url: String(j.sourceUrl).slice(0, 300), profile_updated_at: new Date().toISOString() }
  if (j.website) patch.website = String(j.website).replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 120)
  if (j.description) patch.description = String(j.description).slice(0, 200)
  if (j.founders) patch.founders = String(j.founders).slice(0, 200)
  if (j.foundedYear && j.foundedYear > 1900) patch.founded_year = Math.round(j.foundedYear)
  if (j.headcountText) patch.headcount = String(j.headcountText).slice(0, 60)
  if (j.hq && !co.location) patch.location = String(j.hq).slice(0, 80)
  const { error } = await sb.from('vc_companies').update(patch).eq('id', co.id)
  console.log(error ? `  ✗ ${co.name}: ${error.message}` : `  ✓ ${co.name}: ${Object.keys(patch).length - 2} fields ($${cost.toFixed(3)})`)
}
console.log(`Done. Spent ~$${spent.toFixed(2)}.`)
