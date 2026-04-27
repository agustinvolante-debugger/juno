import { Client } from '@hubspot/api-client'

export function getHubspotClient(accessToken: string) {
  return new Client({ accessToken })
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
        c.properties.utm_medium?.toLowerCase() === 'cpc' &&
        c.properties.utm_term
    )
    contacts.push(...googleContacts)
    after = response.paging?.next?.after

    if (contacts.length >= MAX_CONTACTS) break
  } while (after)

  return contacts.slice(0, MAX_CONTACTS).map((c) => ({
    hubspot_id: c.id,
    email: c.properties.email ?? null,
    utm_source: c.properties.utm_source ?? null,
    utm_medium: c.properties.utm_medium ?? null,
    utm_campaign: c.properties.utm_campaign ?? null,
    utm_term: c.properties.utm_term ?? null,
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
    hubspot_deal_id: d.id,
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
