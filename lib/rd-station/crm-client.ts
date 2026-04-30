const RD_CRM_BASE = 'https://crm.rdstation.com/api/v1'

const MAX_DEALS = 10_000

export async function fetchRDDeals(instanceToken: string) {
  const deals: any[] = []
  let page = 1

  do {
    const url = `${RD_CRM_BASE}/deals?token=${instanceToken}&win=true&limit=200&page=${page}&order=created_at&direction=desc`
    const res = await fetch(url)

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`RD Station CRM deals fetch failed: ${err}`)
    }

    const data = await res.json()
    const batch = data.deals ?? data

    if (!Array.isArray(batch) || batch.length === 0) break

    deals.push(...batch)
    page++

    if (deals.length >= MAX_DEALS) break
    if (batch.length < 200) break
  } while (true)

  // For each deal, extract contact emails from the deal's contacts
  const dealResults = await Promise.all(
    deals.slice(0, MAX_DEALS).map(async (d: any) => {
      let contactEmails: string[] = []

      try {
        const contactsRes = await fetch(
          `${RD_CRM_BASE}/deals/${d.id}/contacts?token=${instanceToken}&limit=10`
        )
        if (contactsRes.ok) {
          const contactsData = await contactsRes.json()
          const contactsList = contactsData.contacts ?? contactsData
          if (Array.isArray(contactsList)) {
            contactEmails = contactsList
              .flatMap((c: any) => c.emails?.map((e: any) => e.email) ?? [])
              .filter(Boolean)
          }
        }
      } catch {
        // If contact fetch fails for a deal, continue without emails
      }

      return {
        crm_deal_id: d.id,
        crm_provider: 'rd_station' as const,
        deal_name: d.name ?? '',
        stage: d.deal_stage?.name ?? '',
        amount: d.amount_total ?? d.amount_monthly ?? null,
        close_date: d.closed_at ? d.closed_at.slice(0, 10) : d.win_at ? d.win_at.slice(0, 10) : null,
        is_closed_won: true,
        contact_emails: contactEmails,
      }
    })
  )

  return dealResults
}
