// /api/vc/memo?slug=… — the cached analyst memo on a company profile (vc_memos, migration 013).
// GET returns the cached memo instantly. POST (re)generates it: one sonnet-5 run grounded in
// the graph's own facts (rounds, investors, board seats, verified totals, firmographics) plus
// a few web searches — then caches it, so research compounds instead of evaporating per chat.
// Cost logs to vc_chat_runs (conversation_id null) like the other unattended runs.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { vcCors, vcSessionEmail } from '@/lib/vc/vc-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = 'claude-sonnet-5'
const PRICE = { in: 3, out: 15 }

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: vcCors(req) })
}

export async function GET(req: NextRequest) {
  const cors = vcCors(req)
  if (!(await vcSessionEmail())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors })
  const slug = (req.nextUrl.searchParams.get('slug') || '').trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400, headers: cors })
  const { data, error } = await supabaseAdmin.from('vc_memos').select('memo,sources,model,user_email,updated_at').eq('company_slug', slug).maybeSingle()
  if (error) return NextResponse.json({ memo: null, error: error.message }, { headers: cors })
  return NextResponse.json({ memo: data?.memo || null, sources: data?.sources || [], model: data?.model, by: data?.user_email, updatedAt: data?.updated_at }, { headers: cors })
}

// what the graph already knows — grounds the memo and saves web searches
async function graphContext(slug: string): Promise<{ name: string; ctx: string } | null> {
  const sb = supabaseAdmin
  const { data: co } = await sb.from('vc_companies').select('*').eq('slug', slug).maybeSingle()
  if (!co) return null
  const { data: inv } = await sb.from('vc_investments').select('round,amount_text,date,lead,confidence,source_text,firm_id').eq('company_id', co.id).limit(40)
  const firmIds = [...new Set((inv || []).map((i: any) => i.firm_id).filter(Boolean))]
  const { data: firms } = firmIds.length ? await sb.from('vc_firms').select('id,name').in('id', firmIds) : { data: [] as any[] }
  const firmName = new Map((firms || []).map((f: any) => [f.id, f.name]))
  const { data: seats } = await sb.from('vc_board_seats').select('person_name,role,as_of,source_kind').eq('company_id', co.id).eq('is_published', true).limit(20)
  const { data: ov } = await sb.from('vc_funding_overrides').select('verified_total_raised,last_round,source_url,note').eq('company_slug', slug).maybeSingle()
  const { data: fil } = await sb.from('vc_filings').select('form_type,filing_date,offering_amount').eq('cik', co.cik || '—').order('filing_date', { ascending: false }).limit(10)
  const lines = [
    `Company: ${co.name} (graph slug ${slug})`,
    co.sector ? `Sector: ${co.sector}` : null,
    co.description ? `Description: ${co.description}` : null,
    co.website ? `Website: ${co.website}` : null,
    co.location ? `HQ: ${co.location}` : null,
    co.founders ? `Founders: ${co.founders}` : null,
    co.founded_year ? `Founded: ${co.founded_year}` : null,
    co.headcount ? `Headcount: ${co.headcount}` : null,
    ov ? `VERIFIED total raised: $${(+ov.verified_total_raised / 1e6).toFixed(0)}M (${ov.last_round || ''}) — ${ov.note || ''} [${ov.source_url || ''}]` : (co.total_raised ? `Total raised (graph): ${co.total_raised}` : null),
    (inv || []).length ? 'Known investments:\n' + (inv || []).map((i: any) => `  - ${firmName.get(i.firm_id) || '?'} · ${i.round || ''} ${i.amount_text || ''} ${i.date || ''}${i.lead ? ' (lead)' : ''} [${i.confidence || ''}] src: ${i.source_text || ''}`).join('\n') : 'No investors mapped yet.',
    (seats || []).length ? 'Board seats (filed/curated):\n' + (seats || []).map((s: any) => `  - ${s.person_name} (${s.role || 'Director'}, as of ${s.as_of || '?'}, ${s.source_kind || ''})`).join('\n') : null,
    (fil || []).length ? 'SEC Form D filings:\n' + (fil || []).map((f: any) => `  - Form ${f.form_type} ${f.filing_date} offering $${Math.round((f.offering_amount || 0) / 1e6)}M`).join('\n') : null,
  ].filter(Boolean)
  return { name: co.name, ctx: lines.join('\n') }
}

export async function POST(req: NextRequest) {
  const cors = vcCors(req)
  const email = await vcSessionEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors })
  const { slug } = await req.json().catch(() => ({}))
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400, headers: cors })
  const g = await graphContext(slug)
  if (!g) return NextResponse.json({ error: 'unknown company' }, { status: 404, headers: cors })

  const prompt =
    `Write a one-page analyst memo on the startup below for a VC/deal-research audience. Use the INTERNAL GRAPH FACTS as ground truth (cite them as "graph/SEC filings"); use web_search (max 4) to fill momentum, recent news, competitive position, and anything the graph lacks — cite every web-sourced claim with its URL inline as a markdown link.\n\n` +
    `INTERNAL GRAPH FACTS:\n${g.ctx}\n\n` +
    `Structure (markdown, ## headers): What they do · Funding & investors · People & board · Momentum & recent news · Risks / open questions · Sources (list every URL used). ` +
    `Be concrete and numbers-first; never invent figures — if something is unknown, say unknown. End the memo after Sources.`

  const anthropic = new Anthropic()
  const usage = { in: 0, out: 0 }
  let webSearches = 0
  let text = ''
  const startedAt = Date.now()
  try {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]
    for (let turn = 0; turn < 6; turn++) {
      const res = await anthropic.messages.create({
        model: MODEL, max_tokens: 3000,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 } as any],
        messages,
      })
      usage.in += res.usage.input_tokens || 0
      usage.out += res.usage.output_tokens || 0
      webSearches += (res.usage as any).server_tool_use?.web_search_requests || 0
      const t = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
      if (t.trim()) text = t
      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue }
      break
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 160) }, { status: 502, headers: cors })
  } finally {
    const costUsd = (usage.in * PRICE.in + usage.out * PRICE.out) / 1e6 + webSearches * 0.01
    supabaseAdmin.from('vc_chat_runs').insert({
      conversation_id: null, model: MODEL, turns: 1, tools: [{ name: 'memo', ms: Date.now() - startedAt }],
      input_tokens: usage.in, output_tokens: usage.out, cost_usd: costUsd, duration_ms: Date.now() - startedAt,
      status: 'ok', error: `memo: ${slug}`,
    }).then(() => {}, () => {})
  }
  if (!text.trim()) return NextResponse.json({ error: 'empty memo' }, { status: 502, headers: cors })

  const sources = [...new Set([...text.matchAll(/\((https?:[^)\s]+)\)/g)].map((m) => m[1]))].slice(0, 30)
  const { error } = await supabaseAdmin.from('vc_memos').upsert(
    { company_slug: slug, memo: text.trim(), sources, model: MODEL, user_email: email, updated_at: new Date().toISOString() },
    { onConflict: 'company_slug' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ memo: text.trim(), sources, model: MODEL, by: email, updatedAt: new Date().toISOString() }, { headers: cors })
}
