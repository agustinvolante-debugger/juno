export interface KeywordRow {
  id: string
  user_id: string
  keyword: string
  campaign: string
  ad_group: string
  spend_monthly: number
  impressions: number
  clicks: number
  source_type: 'keyword' | 'dsa_search_term' | 'pmax_search_term' | 'asset_group'
  target_id: string | null
  landing_page: string | null
  headline: string | null
  synced_at: string
}

export interface Contact {
  id: string
  user_id: string
  crm_id: string
  crm_provider: 'hubspot' | 'rd_station'
  email: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  first_page_seen: string | null
  created_at: string
}

export interface Deal {
  id: string
  user_id: string
  crm_deal_id: string
  crm_provider: 'hubspot' | 'rd_station'
  contact_id: string | null
  deal_name: string
  stage: string
  amount: number | null
  close_date: string | null
  is_closed_won: boolean
  created_at: string
}

export interface Attribution {
  id: string
  user_id: string
  keyword: string
  campaign: string
  deal_id: string
  deal_amount: number | null
  spend_at_attribution: number
  created_at: string
}

export interface KeywordCAC {
  keyword: string
  campaign: string
  spend_monthly: number
  deal_count: number
  total_deal_value: number
  cac: number | null
  action: 'scale' | 'monitor' | 'cut'
  source_type: 'keyword' | 'dsa_search_term' | 'pmax_search_term' | 'asset_group'
}

export interface OAuthToken {
  id: string
  user_id: string
  provider: 'google_ads' | 'hubspot' | 'rd_station_marketing' | 'rd_station_crm'
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  scope: string | null
  extra: Record<string, unknown> | null
}
