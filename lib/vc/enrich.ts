// Unattended enrichment: run the MatX flow for one company with no chat attached.
// Same tools as the chat agent, but web-sourced writes are STAGED to
// vc_enrich_queue (review before they hit the map). Cost logs to vc_chat_runs
// with conversation_id null so enrichment spend is separable from chat spend.
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { TOOL_DEFS, executeToolStaged } from '@/lib/vc/agent-tools'

const MODEL = 'claude-sonnet-5'
const MAX_TURNS = 8
const PRICE = { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 }

const SYSTEM = `You are the overnight enrichment worker for VC Constellation. You are given ONE company that recently filed a SEC Form D. Your job:
1. search_edgar with its name (and pass sector if you can infer it) — this adds the company + its filed directors to the graph.
2. web_search its funding history: rounds, investors, lead investors, verified total raised. Prefer primary sources.
3. save_investments for every investor you can source (source URL + honest confidence per entry) and save_funding_override if a verified total is well-sourced.
4. save_company_profile with whatever firmographics the SAME web results establish: website, one-line description, founders/CEO, founded year, headcount estimate, HQ. Only verified fields; omissions are fine.
5. If the web has nothing solid, save nothing — a thin result is fine; never guess.
Rules: only save facts from THIS run's web results or filings. Be efficient: at most 3-4 web searches. End with one short line summarizing what you saved.`

// tool subset for enrichment (no run_query / classify noise)
const ENRICH_TOOLS = TOOL_DEFS.filter((t: any) => ['search_internal', 'search_edgar', 'save_investments', 'save_funding_override', 'save_company_profile'].includes(t.name))

export async function enrichCompany(name: string, hint: string, runNote: string): Promise<{ ok: boolean; summary: string; costUsd: number }> {
  const anthropic = new Anthropic()
  const sb = supabaseAdmin
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Enrich: ${name}${hint ? ` — ${hint}` : ''}` },
  ]
  const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }
  let webSearches = 0
  const toolLog: { name: string; ms: number }[] = []
  let turns = 0
  let summary = ''
  let status: 'ok' | 'error' = 'ok'
  let errMsg: string | null = null
  const startedAt = Date.now()

  try {
    let loop = true
    while (loop && turns < MAX_TURNS) {
      turns++
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 6000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [...(ENRICH_TOOLS as any), { type: 'web_search_20260209', name: 'web_search', max_uses: 4 }] as any,
        messages,
      })
      usage.in += res.usage.input_tokens || 0
      usage.out += res.usage.output_tokens || 0
      usage.cacheRead += (res.usage as any).cache_read_input_tokens || 0
      usage.cacheWrite += (res.usage as any).cache_creation_input_tokens || 0
      webSearches += (res.usage as any).server_tool_use?.web_search_requests || 0
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ')
      if (text.trim()) summary = text.trim().slice(0, 500)

      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue }
      if (res.stop_reason !== 'tool_use') break

      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      messages.push({ role: 'assistant', content: res.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const garbled = Object.values(tu.input as Record<string, unknown>).some((v) => typeof v === 'string' && /antml|<\/?parameter/i.test(v))
        if (garbled) { results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Malformed tool call — re-issue with clean values.', is_error: true }); continue }
        const t0 = Date.now()
        const result = await executeToolStaged(tu.name, tu.input, runNote)
        toolLog.push({ name: tu.name, ms: Date.now() - t0 })
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result).slice(0, 40_000), is_error: !!result?.error })
      }
      messages.push({ role: 'user', content: results })
    }
  } catch (e: any) {
    status = 'error'
    errMsg = e?.message || String(e)
  }

  const costUsd = (usage.in * PRICE.in + usage.out * PRICE.out + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1e6 + webSearches * 0.01
  await sb.from('vc_chat_runs').insert({
    conversation_id: null, model: MODEL, turns, tools: toolLog,
    input_tokens: usage.in, output_tokens: usage.out,
    cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    cost_usd: costUsd, duration_ms: Date.now() - startedAt, status,
    error: errMsg ? `${runNote}: ${errMsg}` : null,
  }).then(() => { /* logged */ }, () => { /* logging must not fail the run */ })
  return { ok: status === 'ok', summary: summary || errMsg || '', costUsd }
}
