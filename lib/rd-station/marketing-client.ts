const RD_MARKETING_BASE = 'https://api.rd.services'

export async function refreshMarketingToken(refreshToken: string) {
  const res = await fetch(`${RD_MARKETING_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.RD_STATION_MARKETING_CLIENT_ID,
      client_secret: process.env.RD_STATION_MARKETING_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`RD Station token refresh failed: ${err}`)
  }

  return res.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
  }>
}

const MAX_CONTACTS = 10_000

export async function fetchRDContacts(accessToken: string) {
  const contacts: any[] = []
  let page = 1

  do {
    const res = await fetch(`${RD_MARKETING_BASE}/platform/contacts?page=${page}&order=email:asc`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      if (res.status === 404) break
      const err = await res.text()
      throw new Error(`RD Station contacts fetch failed: ${err}`)
    }

    const data = await res.json()
    const batch = data.contacts ?? data

    if (!Array.isArray(batch) || batch.length === 0) break

    const googleContacts = batch.filter((c: any) => {
      const source = (c.traffic_source ?? c.last_conversion?.content?.traffic_source ?? '').toLowerCase()
      const medium = (c.traffic_medium ?? c.last_conversion?.content?.traffic_medium ?? '').toLowerCase()
      return source === 'google' && medium === 'cpc'
    })

    contacts.push(...googleContacts)
    page++

    if (contacts.length >= MAX_CONTACTS) break
    if (batch.length < 200) break
  } while (true)

  return contacts.slice(0, MAX_CONTACTS).map((c: any) => {
    const utmTerm = c.cf_utm_term
      ?? c.custom_fields?.utm_term
      ?? c.traffic_value
      ?? c.last_conversion?.content?.traffic_value
      ?? null

    return {
      crm_id: c.uuid ?? c.id,
      crm_provider: 'rd_station' as const,
      email: c.email ?? null,
      utm_source: c.traffic_source ?? c.last_conversion?.content?.traffic_source ?? null,
      utm_medium: c.traffic_medium ?? c.last_conversion?.content?.traffic_medium ?? null,
      utm_campaign: c.traffic_campaign ?? c.last_conversion?.content?.traffic_campaign ?? null,
      utm_term: utmTerm,
      first_page_seen: c.first_conversion?.content?.conversion_origin?.source ?? null,
      created_at: c.created_at ?? null,
    }
  })
}
