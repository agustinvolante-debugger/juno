import { GoogleAdsApi } from 'google-ads-api'

// TODO: Fill in GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET in .env.local
export function getGoogleAdsClient() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })
}

// Pull keyword spend data for the last 90 days for a given customer account
export async function fetchKeywordReport(
  refreshToken: string,
  customerAccountId: string
) {
  const client = getGoogleAdsClient()

  const customer = client.Customer({
    customer_id: customerAccountId,
    refresh_token: refreshToken,
    login_customer_id: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  })

  const today = new Date()
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(today.getDate() - 90)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const report = await customer.query(`
    SELECT
      ad_group_criterion.keyword.text,
      ad_group.name,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM keyword_view
    WHERE segments.date BETWEEN '${fmt(ninetyDaysAgo)}' AND '${fmt(today)}'
      AND ad_group_criterion.status = 'ENABLED'
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `)

  return report.map((row: any) => ({
    keyword: row.ad_group_criterion.keyword.text as string,
    campaign: row.campaign.name as string,
    ad_group: row.ad_group.name as string,
    spend_monthly: Math.round((row.metrics.cost_micros / 1_000_000) * (30 / 90) * 100) / 100,
    impressions: row.metrics.impressions as number,
    clicks: row.metrics.clicks as number,
  }))
}
