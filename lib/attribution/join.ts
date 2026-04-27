import { supabaseAdmin } from '@/lib/supabase'
import { KeywordCAC } from '@/types'

// First-touch attribution: keyword (via utm_term on contact) → contact → deal
export async function runAttributionJoin(userId: string, from?: string, to?: string): Promise<KeywordCAC[]> {
  const dateFrom = from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateTo = to ?? new Date().toISOString().slice(0, 10)
  // Use end of day for timestamp comparisons so today's records are included
  const dateToEndOfDay = `${dateTo}T23:59:59`

  // 1. Load keywords synced within date range
  const { data: keywords, error: kwError } = await supabaseAdmin
    .from('keywords')
    .select('*')
    .eq('user_id', userId)
    .gte('synced_at', dateFrom)
    .lte('synced_at', dateToEndOfDay)

  if (kwError) throw kwError

  // 2. Load contacts with utm_term set, created within range
  const { data: contacts, error: cError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .not('utm_term', 'is', null)
    .gte('created_at', dateFrom)
    .lte('created_at', dateToEndOfDay)

  if (cError) throw cError

  // 3. Load closed-won deals within date range
  const { data: deals, error: dError } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_closed_won', true)
    .gte('close_date', dateFrom)
    .lte('close_date', dateTo)

  if (dError) throw dError

  // Build contact map: hubspot_id → contact
  const contactMap = new Map(contacts.map((c: any) => [c.id, c]))

  // Build deal→contact lookup: deal.contact_id → contact
  const dealsByContactId = new Map<string, any[]>()
  for (const deal of deals) {
    if (!deal.contact_id) continue
    if (!dealsByContactId.has(deal.contact_id)) {
      dealsByContactId.set(deal.contact_id, [])
    }
    dealsByContactId.get(deal.contact_id)!.push(deal)
  }

  // 4. Compute CAC per keyword
  const kwMap = new Map<string, KeywordCAC>()

  for (const kw of keywords) {
    const key = `${kw.keyword}|||${kw.campaign}`
    if (!kwMap.has(key)) {
      kwMap.set(key, {
        keyword: kw.keyword,
        campaign: kw.campaign,
        spend_monthly: kw.spend_monthly,
        deal_count: 0,
        total_deal_value: 0,
        cac: null,
        action: 'cut',
      })
    }
  }

  // Match contacts by utm_term to keywords, then find their deals
  for (const contact of contacts) {
    const utmTerm = contact.utm_term?.toLowerCase().trim()
    if (!utmTerm) continue

    const relatedDeals = dealsByContactId.get(contact.id) ?? []
    if (relatedDeals.length === 0) continue

    // Find matching keyword entry
    for (const [key, cacRow] of kwMap.entries()) {
      if (cacRow.keyword.toLowerCase().trim() === utmTerm) {
        cacRow.deal_count += relatedDeals.length
        for (const deal of relatedDeals) {
          cacRow.total_deal_value += deal.amount ?? 0
        }
      }
    }
  }

  // 5. Calculate CAC and assign action for each keyword
  const results: KeywordCAC[] = []
  for (const row of kwMap.values()) {
    if (row.deal_count > 0) {
      row.cac = Math.round(row.spend_monthly / row.deal_count)
    }
    row.action = determineAction(row)
    results.push(row)
  }

  // Sort: deals desc, then spend desc
  results.sort((a, b) => b.deal_count - a.deal_count || b.spend_monthly - a.spend_monthly)

  // 6. Persist attribution results
  await persistAttributions(userId, results)

  return results
}

function determineAction(row: KeywordCAC): 'scale' | 'monitor' | 'cut' {
  if (row.deal_count === 0) return 'cut'
  if (row.cac === null) return 'cut'
  // Scale if CAC is low relative to deal value
  if (row.total_deal_value > 0 && row.cac < row.total_deal_value / row.deal_count * 0.2) {
    return 'scale'
  }
  if (row.deal_count >= 2) return 'scale'
  return 'monitor'
}

async function persistAttributions(userId: string, rows: KeywordCAC[]) {
  if (rows.length === 0) return

  // Clear old attributions for this user
  await supabaseAdmin.from('attributions').delete().eq('user_id', userId)

  const records = rows.map((r) => ({
    user_id: userId,
    keyword: r.keyword,
    campaign: r.campaign,
    deal_id: null,
    deal_amount: r.total_deal_value || null,
    spend_at_attribution: r.spend_monthly,
  }))

  await supabaseAdmin.from('attributions').insert(records)
}
