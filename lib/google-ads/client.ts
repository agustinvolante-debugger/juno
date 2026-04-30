import { GoogleAdsApi } from 'google-ads-api'

export function getGoogleAdsClient() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })
}

function getCustomer(refreshToken: string, customerAccountId: string) {
  const client = getGoogleAdsClient()
  return client.Customer({
    customer_id: customerAccountId,
    refresh_token: refreshToken,
    login_customer_id: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  })
}

function dateRange90Days() {
  const today = new Date()
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(today.getDate() - 90)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(ninetyDaysAgo), to: fmt(today) }
}

function microsToDailyToMonthly(costMicros: number): number {
  return Math.round((costMicros / 1_000_000) * (30 / 90) * 100) / 100
}

export async function fetchKeywordReport(
  refreshToken: string,
  customerAccountId: string
) {
  const customer = getCustomer(refreshToken, customerAccountId)
  const { from, to } = dateRange90Days()

  const report = await customer.query(`
    SELECT
      ad_group_criterion.keyword.text,
      ad_group.name,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM keyword_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND ad_group_criterion.status = 'ENABLED'
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `)

  return report.map((row: any) => ({
    keyword: row.ad_group_criterion.keyword.text as string,
    campaign: row.campaign.name as string,
    ad_group: row.ad_group.name as string,
    spend_monthly: microsToDailyToMonthly(row.metrics.cost_micros),
    impressions: row.metrics.impressions as number,
    clicks: row.metrics.clicks as number,
    source_type: 'keyword' as const,
  }))
}

export async function fetchDSASearchTermReport(
  refreshToken: string,
  customerAccountId: string
) {
  const customer = getCustomer(refreshToken, customerAccountId)
  const { from, to } = dateRange90Days()

  const report = await customer.query(`
    SELECT
      dynamic_search_ads_search_term_view.search_term,
      dynamic_search_ads_search_term_view.landing_page,
      dynamic_search_ads_search_term_view.headline,
      ad_group.name,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM dynamic_search_ads_search_term_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 2000
  `)

  return report.map((row: any) => ({
    keyword: row.dynamic_search_ads_search_term_view.search_term as string,
    campaign: row.campaign.name as string,
    ad_group: row.ad_group.name as string,
    landing_page: row.dynamic_search_ads_search_term_view.landing_page as string ?? null,
    headline: row.dynamic_search_ads_search_term_view.headline as string ?? null,
    spend_monthly: microsToDailyToMonthly(row.metrics.cost_micros),
    impressions: row.metrics.impressions as number,
    clicks: row.metrics.clicks as number,
    source_type: 'dsa_search_term' as const,
  }))
}

export async function fetchDSATargetMapping(
  refreshToken: string,
  customerAccountId: string
): Promise<Record<string, string[]>> {
  const customer = getCustomer(refreshToken, customerAccountId)
  const { from, to } = dateRange90Days()

  const report = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      dynamic_search_ads_search_term_view.search_term
    FROM dynamic_search_ads_search_term_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 5000
  `)

  const mapping: Record<string, string[]> = {}

  for (const row of report) {
    const criterionId = row.ad_group_criterion?.criterion_id
    const searchTerm = row.dynamic_search_ads_search_term_view?.search_term
    if (!criterionId || !searchTerm) continue

    const key = `dsa-${criterionId}`
    if (!mapping[key]) mapping[key] = []
    if (!mapping[key].includes(searchTerm)) {
      mapping[key].push(searchTerm)
    }
  }

  return mapping
}

export async function fetchPMAXSearchTermReport(
  refreshToken: string,
  customerAccountId: string
) {
  const customer = getCustomer(refreshToken, customerAccountId)
  const { from, to } = dateRange90Days()

  const report = await customer.query(`
    SELECT
      campaign_search_term_insight.category_label,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM campaign_search_term_insight
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND segments.date BETWEEN '${from}' AND '${to}'
    ORDER BY metrics.cost_micros DESC
    LIMIT 2000
  `)

  return report.map((row: any) => ({
    keyword: row.campaign_search_term_insight.category_label as string,
    campaign: row.campaign.name as string,
    ad_group: 'PMAX',
    spend_monthly: microsToDailyToMonthly(row.metrics.cost_micros),
    impressions: row.metrics.impressions as number,
    clicks: row.metrics.clicks as number,
    source_type: 'pmax_search_term' as const,
  }))
}
