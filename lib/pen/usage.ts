// What each model call costs, logged per call (table pen_usage, SQL in schema.sql 2026-10-09).
// Until this existed the cost of a recorded hour was an estimate; the owner usage page and a
// plain SQL sum now give the real number. Logging never throws: a missing table or a failed
// insert must not cost anyone their notes.
import { supabaseAdmin } from '@/lib/supabase'

// USD per million tokens: [input, output, cache read, cache write]. claude-api skill, Oct 2026.
const PRICE: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
}

type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function costUsd(model: string, u: Usage): number | null {
  const key = Object.keys(PRICE).find((k) => model.startsWith(k))
  if (!key) return null
  const [i, o, cr, cw] = PRICE[key]
  return ((u.input_tokens ?? 0) * i + (u.output_tokens ?? 0) * o + (u.cache_read_input_tokens ?? 0) * cr + (u.cache_creation_input_tokens ?? 0) * cw) / 1e6
}

export function logUsage(feature: string, msg: { model?: string; usage?: Usage } | null | undefined): void {
  if (!msg?.usage) return
  const model = msg.model ?? ''
  const u = msg.usage
  void supabaseAdmin.from('pen_usage').insert({
    feature,
    model,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    cost_usd: costUsd(model, u),
  }).then(({ error }) => { if (error && !/pen_usage/.test(error.message)) console.warn(`pen usage log: ${error.message}`) }, () => {})
}
