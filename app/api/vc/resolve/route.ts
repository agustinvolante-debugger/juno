// POST /api/vc/resolve  { query }
// Brand → legal-entity resolver for the VC Constellation search. The universe stores SEC
// legal names ("Open Vision Engineering Inc"), but people search brands ("Pocket") or paste
// the website (heypocket.com). One small web-searched Claude call finds the legal name; the
// result is cached as an alias in vc_ingest_meta ('brand_aliases') so the same brand hits
// /api/vc/search directly forever after. Google-session gated (each miss costs ~1-3 web
// searches); cost logs to vc_chat_runs with conversation_id null like the enrichment runs.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { vcCors, vcSessionEmail } from '@/lib/vc/vc-auth'
import { normName } from '@/lib/vc/edgar.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// sonnet-5: same web_search tool config as lib/vc/enrich.ts (Haiku 4.5 rejects this tool version)
const MODEL = 'claude-sonnet-5'
const PRICE = { in: 3, out: 15 } // $/Mtok
const ALIAS_KEY = 'brand_aliases'
const ALIAS_CAP = 500

type Alias = { legalName: string; brand?: string; website?: string; at: string }

function extractQuery(raw: string): { q: string; isUrl: boolean } {
  const s = raw.trim().slice(0, 200)
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:\/\S*)?$/i)
  return m ? { q: m[1].toLowerCase(), isUrl: true } : { q: s, isUrl: false }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: vcCors(req) })
}

export async function POST(req: NextRequest) {
  const cors = vcCors(req)
  const email = await vcSessionEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors })
  const body = await req.json().catch(() => ({}))
  const raw = (body.query || '').toString()
  if (!raw.trim()) return NextResponse.json({ error: 'query required' }, { status: 400, headers: cors })
  const { q, isUrl } = extractQuery(raw)
  const sb = supabaseAdmin

  // alias cache first — resolving the same brand twice is wasted money
  const { data: metaRow } = await sb.from('vc_ingest_meta').select('value').eq('key', ALIAS_KEY).maybeSingle()
  let aliases: Record<string, Alias> = {}
  try { aliases = metaRow?.value ? JSON.parse(metaRow.value) : {} } catch { aliases = {} }
  const cached = aliases[normName(q)]
  if (cached) return NextResponse.json({ ...cached, cached: true }, { headers: cors })

  const anthropic = new Anthropic()
  const prompt =
    `Find the LEGAL entity name of the company behind ${isUrl ? `the website ${q}` : `the startup brand "${q}"`} — ` +
    'the corporate name it would use on SEC filings (Form D), e.g. brand "Pocket" at heypocket.com → "Open Vision Engineering Inc". ' +
    'Search the web (their site footer, terms of service, privacy policy, Crunchbase, SEC EDGAR) as needed. ' +
    'Then respond with ONLY this JSON (no prose): ' +
    '{"legalName":"<legal entity name, or null if you cannot establish it>","brand":"<consumer brand name>",' +
    '"website":"<primary domain>","confidence":"high|medium|low"}. ' +
    'If several companies share the brand name, pick the venture-backed startup; if truly ambiguous, confidence low.'

  const usage = { in: 0, out: 0 }
  let webSearches = 0
  let text = ''
  const startedAt = Date.now()
  try {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
    for (let turn = 0; turn < 5; turn++) {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 800,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 } as any],
        messages,
      })
      usage.in += res.usage.input_tokens || 0
      usage.out += res.usage.output_tokens || 0
      webSearches += (res.usage as any).server_tool_use?.web_search_requests || 0
      const t = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ')
      if (t.trim()) text = t
      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue }
      break
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 160) }, { status: 502, headers: cors })
  } finally {
    const costUsd = (usage.in * PRICE.in + usage.out * PRICE.out) / 1e6 + webSearches * 0.01
    sb.from('vc_chat_runs').insert({
      conversation_id: null, model: MODEL, turns: 1, tools: [{ name: 'resolve', ms: Date.now() - startedAt }],
      input_tokens: usage.in, output_tokens: usage.out, cost_usd: costUsd,
      duration_ms: Date.now() - startedAt, status: 'ok', error: `resolve: ${q}`,
    }).then(() => {}, () => {})
  }

  let j: any = null
  try { j = JSON.parse((text.match(/\{[\s\S]*\}/) || ['null'])[0]) } catch { j = null }
  const legalName = j?.legalName && typeof j.legalName === 'string' && j.legalName.toLowerCase() !== 'null' ? j.legalName.trim().slice(0, 120) : null
  if (!legalName) return NextResponse.json({ legalName: null, note: 'could not establish a legal entity' }, { headers: cors })

  const alias: Alias = {
    legalName,
    brand: typeof j.brand === 'string' ? j.brand.trim().slice(0, 80) : undefined,
    website: typeof j.website === 'string' ? j.website.trim().slice(0, 120) : undefined,
    at: new Date().toISOString(),
  }
  // store under every handle someone might type: the raw query, the brand, the domain
  for (const k of [q, alias.brand, alias.website?.replace(/^www\./, '')]) {
    if (k) aliases[normName(k)] = alias
  }
  const entries = Object.entries(aliases).slice(-ALIAS_CAP)
  await sb.from('vc_ingest_meta').upsert({ key: ALIAS_KEY, value: JSON.stringify(Object.fromEntries(entries)), updated_at: new Date().toISOString() })

  return NextResponse.json({ ...alias, confidence: j.confidence || 'medium', cached: false }, { headers: cors })
}
