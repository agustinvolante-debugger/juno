import { KeywordCAC, WasteAlert } from '@/types'

export function detectWaste(keywords: KeywordCAC[]): WasteAlert[] {
  const alerts: WasteAlert[] = []

  for (const kw of keywords) {
    if (kw.deal_count === 0 && kw.spend_monthly > 0) {
      alerts.push({
        keyword: kw.keyword,
        campaign: kw.campaign,
        spend_monthly: kw.spend_monthly,
        severity: kw.spend_monthly >= 500 ? 'critical' : 'warning',
        reason: `$${kw.spend_monthly.toLocaleString()}/mo with zero deals closed`,
      })
      continue
    }

    if (kw.cac !== null && kw.deal_count > 0 && kw.total_deal_value > 0) {
      const avgDealValue = kw.total_deal_value / kw.deal_count
      if (kw.cac > avgDealValue * 0.5) {
        alerts.push({
          keyword: kw.keyword,
          campaign: kw.campaign,
          spend_monthly: kw.spend_monthly,
          severity: 'warning',
          reason: `CAC ($${kw.cac.toLocaleString()}) exceeds 50% of avg deal value ($${Math.round(avgDealValue).toLocaleString()})`,
        })
      }
    }
  }

  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
    return b.spend_monthly - a.spend_monthly
  })
}

export function sumCriticalWaste(alerts: WasteAlert[]): number {
  return alerts
    .filter((a) => a.severity === 'critical')
    .reduce((sum, a) => sum + a.spend_monthly, 0)
}
