// POST /api/vc/agent — the VC Constellation research chat endpoint.
// Runs the agent loop server-side (Anthropic API key never reaches the browser),
// executes tools against Supabase, and streams SSE events back:
//   conv   {conversationId}                  — sent first
//   status {text}                            — live tool-activity line
//   text   {delta}                           — streamed answer tokens
//   table  {resultSetId, interpretation, total} — render the snapshot as a table artifact
//   done   {usage, costUsd, turns}
//   error  {message}                         — plain-language failure
// Gate: x-chat-key must equal VC_CHAT_KEY. Budget: VC_CHAT_DAILY_CAP USD/day
// enforced from the vc_chat_runs log before every request.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { TOOL_DEFS, TOOL_LABELS, executeTool } from '@/lib/vc/agent-tools'
import { chatGate, CHAT_CORS as CORS } from '@/lib/vc/chat-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = 'claude-sonnet-5'
const MAX_TURNS = 15
const MAX_OUTPUT_BUDGET = 40_000 // cumulative output tokens per message
// $/MTok — sonnet-tier list price (cache read 0.1x input, cache write 1.25x)
const PRICE = { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 }

export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

const SYSTEM = `You are the research analyst inside VC Constellation — a board-seat-first VC/startup intelligence product built on SEC Form D filings, a curated investment graph, and a verified-funding overrides layer. You answer questions about companies, VC firms, investors, board seats, and funding by CALLING TOOLS, never from memory.

GROUNDING RULES (absolute):
- Every factual claim about a company, firm, person, or funding amount MUST come from a tool result in THIS conversation. You have broad general knowledge about these entities — DO NOT USE IT for facts or numbers. If tools return nothing, say so plainly and tell the user what you could not find. Never fill gaps from memory.
- Attach the source to every number you state: "per SEC Form D filings", "curated graph", or "verified override". Form D offering amounts UNDERCOUNT real raises (e.g. Form D may show a fraction of a company's true total) — when only Form D data exists, say so.
- If a classification or match is low-confidence, flag it — never present a guess as fact.

TOOL STRATEGY:
- search_internal FIRST for any entity lookup. run_query for any criteria/list question. classify_entity for ambiguous names.
- run_query's table artifact IS the deliverable — the user sees the FULL result table with CSV download; your preview is truncated and for reference only. Therefore express EVERY user constraint as a run_query filter parameter (sector, minTotalM, filedAfter, …). Subsetting rows yourself in prose while the table shows something broader is a failure: the table must match what the user asked for.
- NEVER retype result rows as a markdown table. State the interpretation line so the user can correct it, then summarize notable findings in a sentence or two.
- To narrow a previous result ("those companies", "filter to $1B+"), call run_query ONCE with the previous filters PLUS the new constraint. Never re-run a query with identical filters — duplicates are suppressed and the user sees nothing new.
- Live EDGAR fetch, web enrichment, and generated maps ship in later phases. If asked, say those are coming and offer what the database can answer today.

STYLE:
- Concise and direct; lead with the answer. Short paragraphs and simple lists. No markdown tables (tables are rendered artifacts). Use **bold** for entity names and key numbers.
- Plain-language errors: if a tool fails, say what happened and what the user can do.

Today's date: ${new Date().toISOString().slice(0, 10)}`

type StoredBlock = { type: 'text'; text: string } | { type: 'table'; resultSetId: string; interpretation: string; total: number }

// rebuild model-facing text from stored display blocks
function blocksToModelText(blocks: StoredBlock[]): string {
  return blocks.map((b) =>
    b.type === 'text' ? b.text : `[rendered result table ${b.resultSetId} — ${b.interpretation} — ${b.total} rows]`,
  ).join('\n\n')
}

// keep exactly one message-side cache breakpoint, on the last content block —
// each loop turn re-reads the whole grown prefix from cache
function moveCacheBreakpoint(messages: Anthropic.MessageParam[]) {
  for (const m of messages) {
    if (Array.isArray(m.content)) for (const b of m.content) delete (b as any).cache_control
  }
  const last = messages[messages.length - 1]
  if (last && Array.isArray(last.content) && last.content.length) {
    ;(last.content[last.content.length - 1] as any).cache_control = { type: 'ephemeral' }
  }
}

export async function POST(req: NextRequest) {
  const denied = chatGate(req)
  if (denied) return denied
  const sb = supabaseAdmin
  const body = await req.json().catch(() => ({}))
  const message = (body.message || '').toString().trim()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400, headers: CORS })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY unset' }, { status: 503, headers: CORS })

  // ---- daily spend cap ----
  const cap = Number(process.env.VC_CHAT_DAILY_CAP || 5)
  const dayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'
  const { data: runs } = await sb.from('vc_chat_runs').select('cost_usd').gte('created_at', dayStart)
  const spent = (runs || []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0)
  if (spent >= cap) {
    return NextResponse.json({ error: `Daily budget reached ($${spent.toFixed(2)} of $${cap}). Resets at midnight UTC — or raise VC_CHAT_DAILY_CAP.` }, { status: 429, headers: CORS })
  }

  // ---- conversation ----
  let conversationId: string = body.conversationId || ''
  if (conversationId) {
    const { data } = await sb.from('vc_chat_conversations').select('id').eq('id', conversationId).maybeSingle()
    if (!data) conversationId = ''
  }
  if (!conversationId) {
    const { data, error } = await sb.from('vc_chat_conversations').insert({ title: message.slice(0, 80) }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
    conversationId = data.id
  }
  const { data: history } = await sb.from('vc_chat_messages').select('role,content').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(60)
  // tables already shown earlier in this conversation — used to suppress duplicate artifacts
  const historyTableKeys: string[] = []
  for (const m of history || []) {
    for (const b of (m.content || []) as StoredBlock[]) {
      if (b.type === 'table') historyTableKeys.push(`${b.interpretation}|${b.total}`)
    }
  }
  await sb.from('vc_chat_messages').insert({ conversation_id: conversationId, role: 'user', content: [{ type: 'text', text: message }] })
  await sb.from('vc_chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)

  // model-facing history (display blocks flattened to text; table refs kept as bracketed notes)
  const messages: Anthropic.MessageParam[] = (history || []).map((m: any) => ({
    role: m.role as 'user' | 'assistant',
    content: blocksToModelText(m.content as StoredBlock[]) || '…',
  }))
  messages.push({ role: 'user', content: [{ type: 'text', text: message }] })

  const anthropic = new Anthropic()
  const encoder = new TextEncoder()
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { /* client gone */ }
      }
      send('conv', { conversationId })

      const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }
      const toolLog: { name: string; ms: number }[] = []
      const savedBlocks: StoredBlock[] = []
      const shownTables = new Set<string>(historyTableKeys) // dedupe identical artifacts across the conversation
      let turns = 0
      let status: 'ok' | 'error' = 'ok'
      let errMsg: string | null = null

      try {
        let loop = true
        while (loop) {
          turns++
          moveCacheBreakpoint(messages)
          const msgStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            tools: TOOL_DEFS as any,
            messages,
          })
          let turnText = ''
          for await (const ev of msgStream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              turnText += ev.delta.text
              send('text', { delta: ev.delta.text })
            }
          }
          const final = await msgStream.finalMessage()
          usage.in += final.usage.input_tokens || 0
          usage.out += final.usage.output_tokens || 0
          usage.cacheRead += (final.usage as any).cache_read_input_tokens || 0
          usage.cacheWrite += (final.usage as any).cache_creation_input_tokens || 0
          if (turnText.trim()) savedBlocks.push({ type: 'text', text: turnText })

          if (final.stop_reason !== 'tool_use') { loop = false; break }

          const toolUses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          messages.push({ role: 'assistant', content: final.content })

          const overBudget = turns >= MAX_TURNS || usage.out > MAX_OUTPUT_BUDGET
          const results: Anthropic.ToolResultBlockParam[] = []
          for (const tu of toolUses) {
            if (overBudget) {
              results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Turn/token budget for this message is exhausted. Do not call more tools — summarize what you have and tell the user to send a follow-up to continue.', is_error: true })
              continue
            }
            send('status', { text: TOOL_LABELS[tu.name] || `Running ${tu.name}…` })
            const t0 = Date.now()
            const result = await executeTool(tu.name, tu.input, conversationId)
            toolLog.push({ name: tu.name, ms: Date.now() - t0 })
            if (tu.name === 'run_query' && result?.resultSetId) {
              const artKey = `${result.interpretation}|${result.total}`
              if (shownTables.has(artKey)) {
                result.duplicate = true
                result.uiNote = 'DUPLICATE of a table already displayed in this message — its rows are in your context; do not re-run this query, narrow the filters instead.'
              } else {
                shownTables.add(artKey)
                savedBlocks.push({ type: 'table', resultSetId: result.resultSetId, interpretation: result.interpretation, total: result.total })
                send('table', { resultSetId: result.resultSetId, interpretation: result.interpretation, total: result.total })
              }
            }
            results.push({
              type: 'tool_result', tool_use_id: tu.id,
              content: JSON.stringify(result).slice(0, 60_000),
              is_error: !!result?.error,
            })
          }
          messages.push({ role: 'user', content: results })
        }
      } catch (e: any) {
        status = 'error'
        errMsg = e?.message || String(e)
        const friendly = e?.status === 429
          ? 'The AI service is rate-limited right now — wait a minute and try again.'
          : e?.status >= 500
            ? 'The AI service had a hiccup — try again in a moment.'
            : `Something went wrong: ${errMsg}`
        send('error', { message: friendly })
      }

      // ---- persist + log ----
      const costUsd =
        (usage.in * PRICE.in + usage.out * PRICE.out + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1e6
      try {
        if (savedBlocks.length) {
          await sb.from('vc_chat_messages').insert({ conversation_id: conversationId, role: 'assistant', content: savedBlocks })
        }
        await sb.from('vc_chat_runs').insert({
          conversation_id: conversationId, model: MODEL, turns, tools: toolLog,
          input_tokens: usage.in, output_tokens: usage.out,
          cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
          cost_usd: costUsd, duration_ms: Date.now() - startedAt, status, error: errMsg,
        })
      } catch { /* logging must never kill the stream */ }

      send('done', { usage, costUsd: +costUsd.toFixed(4), turns, durationMs: Date.now() - startedAt })
      try { controller.close() } catch { /* already closed */ }
    },
  })

  return new Response(stream, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
