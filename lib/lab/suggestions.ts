import Anthropic from '@anthropic-ai/sdk'
import { KeywordCAC } from '@/types'

const client = new Anthropic()

export interface HypothesisSuggestion {
  id: string
  title: string
  if_action: string
  then_statement: string
  because_reason: string
  window_days: 30 | 90
  expected_impact: string
  keywords_affected: string[]
  type: 'cut_waste' | 'double_down' | 'investigate'
}

const SYSTEM_PROMPT = `You are Juno, a Google Ads advisor for B2B SaaS companies. Generate hypothesis experiments a Head of Marketing can run to improve their keyword ROI. Be specific — use actual keyword names and dollar amounts. Never say "attribution" or "platform". Say "deals" not "conversions".`

export async function generateLabSuggestions(keywords: KeywordCAC[]): Promise<HypothesisSuggestion[]> {
  if (keywords.length === 0) return []

  const dataContext = keywords.map(k => ({
    keyword: k.keyword,
    spend_monthly: k.spend_monthly,
    deals: k.deal_count,
    pipeline_leads: k.pipeline_leads,
    cac: k.cac,
    action: k.action,
  }))

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Attribution data:\n${JSON.stringify(dataContext, null, 2)}\n\nGenerate exactly 3 hypothesis experiments. Return a JSON array with this structure (no markdown, just JSON):\n[\n  {\n    "id": "h1",\n    "title": "Short experiment name",\n    "if_action": "If we [specific action with keyword names]",\n    "then_statement": "Then [metric] will [direction] by [X%]",\n    "because_reason": "Because [specific insight from the data]",\n    "window_days": 30,\n    "expected_impact": "$X saved/mo or X more deals",\n    "keywords_affected": ["keyword1", "keyword2"],\n    "type": "cut_waste"\n  }\n]\n\nTypes: cut_waste (pause/negative zero-pipeline keywords), double_down (increase budget on winners), investigate (borderline keywords needing more data). Make them specific and actionable.`
    }]
  })

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    return JSON.parse(cleaned) as HypothesisSuggestion[]
  } catch (e) {
    console.error('Lab suggestions parse error:', e)
    return []
  }
}
