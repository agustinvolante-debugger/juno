import { Client } from '@hubspot/api-client'
import { supabaseAdmin } from '@/lib/supabase'

export function getHubspotClient(accessToken: string) {
  return new Client({ accessToken })
}

export async function refreshHubspotToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const res = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot token refresh failed: ${err}`)
  }

  return res.json()
}

export async function getValidHubspotToken(userId: string): Promise<string> {
  const { data: row, error } = await supabaseAdmin
    .from('oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'hubspot')
    .single()

  if (error || !row) throw new Error('HubSpot not connected')

  const expired = row.expires_at && new Date(row.expires_at) <= new Date()

  if (!expired) return row.access_token

  if (!row.refresh_token) throw new Error('HubSpot token expired and no refresh token available')

  const tokens = await refreshHubspotToken(row.refresh_token)

  await supabaseAdmin.from('oauth_tokens').upsert({
    user_id: userId,
    provider: 'hubspot',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })

  return tokens.access_token
}

function parseUtmTermFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return parsed.searchParams.get('utm_term') ?? null
  } catch {
    return null
  }
}

const MAX_CONTACTS = 10_000
const MAX_DEALS = 5_000

// Pull contacts from HubSpot — only those from Google Ads (utm_source=google)
export async function fetchContacts(accessToken: string) {
  const client = getHubspotClient(accessToken)

  const properties = [
    'email',
    'hs_analytics_source',
    'hs_analytics_first_url',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'createdate',
  ]

  const contacts: any[] = []
  let after: string | undefined = undefined

  do {
    const response = await client.crm.contacts.basicApi.getPage(100, after, properties)

    // Only keep contacts that came from Google Ads — filters out 90%+ of contacts
    const googleContacts = response.results.filter(
      (c) =>
        c.properties.utm_source?.toLowerCase() === 'google' &&
        c.properties.utm_medium?.toLowerCase() === 'cpc'
    )
    contacts.push(...googleContacts)
    after = response.paging?.next?.after

    if (contacts.length >= MAX_CONTACTS) break
  } while (after)

  return contacts.slice(0, MAX_CONTACTS).map((c) => ({
    crm_id: c.id,
    crm_provider: 'hubspot' as const,
    email: c.properties.email ?? null,
    utm_source: c.properties.utm_source ?? null,
    utm_medium: c.properties.utm_medium ?? null,
    utm_campaign: c.properties.utm_campaign ?? null,
    utm_term: c.properties.utm_term ?? parseUtmTermFromUrl(c.properties.hs_analytics_first_url) ?? null,
    first_page_seen: c.properties.hs_analytics_first_url ?? null,
    created_at: c.properties.createdate ?? null,
  }))
}

// Pull deals with association to contacts
export async function fetchDeals(accessToken: string) {
  const client = getHubspotClient(accessToken)

  const properties = [
    'dealname',
    'dealstage',
    'amount',
    'closedate',
    'hs_is_closed_won',
  ]

  const deals: any[] = []
  let after: string | undefined = undefined

  do {
    const response = await client.crm.deals.basicApi.getPage(100, after, properties, undefined, ['contacts'])

    // Only store closed-won deals — open pipeline not needed for CAC calculation
    const closedWon = response.results.filter(
      (d) => d.properties.hs_is_closed_won === 'true'
    )
    deals.push(...closedWon)
    after = response.paging?.next?.after

    if (deals.length >= MAX_DEALS) break
  } while (after)

  return deals.map((d) => ({
    crm_deal_id: d.id,
    crm_provider: 'hubspot' as const,
    deal_name: d.properties.dealname ?? '',
    stage: d.properties.dealstage ?? '',
    amount: d.properties.amount ? parseFloat(d.properties.amount) : null,
    close_date: d.properties.closedate ?? null,
    is_closed_won: d.properties.hs_is_closed_won === 'true',
    associated_contact_ids: (d.associations?.contacts?.results ?? []).map(
      (a: any) => a.id
    ) as string[],
  }))
}
