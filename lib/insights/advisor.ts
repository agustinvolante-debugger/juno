import Anthropic from '@anthropic-ai/sdk'
import { KeywordCAC, WasteAlert, AdvisorReport } from '@/types'
import { sumCriticalWaste } from './waste'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a Google Ads advisor for B2B SaaS companies. Give direct, specific recommendations — not generic marketing advice. Use actual keyword names and dollar amounts from the data provided. Never say "attribution", "platform", or "optimize". Say "cut" not "pause". Say "deals" not "conversions". Be blunt. Under 150 words total.`

const MODE_INSTRUCTIONS: Record<string, string> = {
  guardrail: `GUARDRAIL MODE — Be conservative. Only recommend cutting a keyword if it has zero deals AND spend over $500/month. If data is borderline, say monitor. Protect any keyword with pipeline leads even if no closed deals yet. Prioritize pipeline safety over savings.`,
  scale: `SCALE MODE — Be balanced. Cut clear waste (zero deals, high spend). Double down on keywords with proven CAC below average deal value. Reallocate freed budget to top performers.`,
  aggressive: `AGGRESSIVE MODE — Be aggressive. Cut any keyword with zero deals regardless of spend level. Immediately scale any keyword with 2+ deals. Freed budget goes entirely to winners. Speed matters more than caution — flag everything that isn't clearly working.`,
}

export async function generateAdvisorReport(
  keywords: KeywordCAC[],
  alerts: WasteAlert[],
  dateRange: { from: string; to: string },
  mode: 'guardrail' | 'scale' | 'aggressive' = 'scale'
): Promise<AdvisorReport> {
  const totalSpend = keywords.reduce((s, k) => s + k.spend_monthly, 0)
  const totalDeals = keywords.reduce((s, k) => s + k.deal_count, 0)
  const totalWaste = sumCriticalWaste(alerts)
  const wastePct = totalSpend > 0 ? Math.round((totalWaste / totalSpend) * 100) : 0
  const keywordsToCut = keywords.filter((k) => k.action === 'cut').length

  const dataContext = {
    date_range: dateRange,
    total_spend_monthly: totalSpend,
    total_deals_attributed: totalDeals,
    keywords: keywords.map((k) => ({
      keyword: k.keyword,
      spend_monthly: k.spend_monthly,
      deals: k.deal_count,
      cac: k.cac,
      action: k.action,
    })),
    waste_alerts: alerts.map((a) => ({
      keyword: a.keyword,
      spend: a.spend_monthly,
      severity: a.severity,
      reason: a.reason,
    })),
  }

  const modeInstruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.scale

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${modeInstruction}\n\nKeyword attribution data:\n\n${JSON.stringify(dataContext, null, 2)}\n\nWrite a weekly action plan using this exact format:\n\n**This week:** [1 sentence on the state of the account — be specific with numbers]\n\n**Juno Suggestion:**\n1. [specific action with keyword name and dollar amount]\n2. [specific action with keyword name and dollar amount]\n3. [specific action]\n\n**Watch:** [1 sentence on what to monitor next week]`,
      },
    ],
  })

  const narrative =
    message.content[0].type === 'text' ? message.content[0].text : 'Unable to generate insights.'

  return {
    narrative,
    waste_alerts: alerts,
    total_waste: totalWaste,
    waste_pct: wastePct,
    keywords_to_cut: keywordsToCut,
  }
}
