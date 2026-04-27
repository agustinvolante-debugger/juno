import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// Spreads a date randomly within a month offset from today
function daysAgo(days: number, jitterDays = 5): string {
  const jitter = Math.floor(Math.random() * jitterDays)
  const d = new Date()
  d.setDate(d.getDate() - days - jitter)
  return d.toISOString()
}

function dateOnly(isoString: string): string {
  return isoString.slice(0, 10)
}

/*
  Story: 6 months of data showing:
  - 2 keywords consistently generating deals → SCALE
  - 2 keywords with 1 deal → MONITOR
  - 3 keywords spending for 6 months with zero deals → CUT NOW (the shocking moment)
*/

const MOCK_KEYWORDS = [
  { keyword: 'hubspot attribution software',    campaign: 'Product - Core',       ad_group: 'Attribution Tools', spend_monthly: 1200, impressions: 4200, clicks: 310 },
  { keyword: 'google ads roi tracking',         campaign: 'Product - Core',       ad_group: 'ROI Tracking',      spend_monthly: 980,  impressions: 3800, clicks: 240 },
  { keyword: 'keyword level attribution b2b',   campaign: 'Product - Core',       ad_group: 'Attribution Tools', spend_monthly: 760,  impressions: 2100, clicks: 180 },
  { keyword: 'cac by keyword saas',             campaign: 'Product - Core',       ad_group: 'CAC Tracking',      spend_monthly: 640,  impressions: 1900, clicks: 140 },
  { keyword: 'google ads hubspot integration',  campaign: 'Brand - Competitors',  ad_group: 'Integrations',      spend_monthly: 2200, impressions: 6100, clicks: 410 },
  { keyword: 'marketing attribution software',  campaign: 'Brand - Competitors',  ad_group: 'Attribution Tools', spend_monthly: 3100, impressions: 8400, clicks: 520 },
  { keyword: 'google ads wasted spend',         campaign: 'Pain Points',          ad_group: 'Budget Waste',      spend_monthly: 1800, impressions: 5200, clicks: 380 },
  { keyword: 'paid search tracking tool',       campaign: 'Pain Points',          ad_group: 'Tracking',          spend_monthly: 920,  impressions: 2800, clicks: 195 },
]

// Contacts spread across 6 months — each linked to a keyword via utm_term
const MOCK_CONTACTS = [
  // "hubspot attribution software" → 3 deals (scale)
  { hubspot_id: 'test-001', email: 'sarah@rattle.com',    utm_term: 'hubspot attribution software',   daysAgoCreated: 165 },
  { hubspot_id: 'test-002', email: 'mike@scribe.com',     utm_term: 'hubspot attribution software',   daysAgoCreated: 110 },
  { hubspot_id: 'test-003', email: 'james@airops.com',    utm_term: 'hubspot attribution software',   daysAgoCreated: 45  },
  // "google ads roi tracking" → 2 deals (scale)
  { hubspot_id: 'test-004', email: 'lisa@pylon.com',      utm_term: 'google ads roi tracking',        daysAgoCreated: 140 },
  { hubspot_id: 'test-005', email: 'dan@workos.com',      utm_term: 'google ads roi tracking',        daysAgoCreated: 60  },
  // "keyword level attribution b2b" → 1 deal (monitor)
  { hubspot_id: 'test-006', email: 'anna@posthog.com',    utm_term: 'keyword level attribution b2b',  daysAgoCreated: 90  },
  // "cac by keyword saas" → 1 deal (monitor)
  { hubspot_id: 'test-007', email: 'tom@linear.com',      utm_term: 'cac by keyword saas',            daysAgoCreated: 75  },
  // These contacts clicked but never became deals — they show the keywords are burning budget
  { hubspot_id: 'test-008', email: 'bob@example.com',     utm_term: 'google ads hubspot integration', daysAgoCreated: 155 },
  { hubspot_id: 'test-009', email: 'carol@example.com',   utm_term: 'marketing attribution software', daysAgoCreated: 130 },
  { hubspot_id: 'test-010', email: 'dave@example.com',    utm_term: 'google ads wasted spend',        daysAgoCreated: 100 },
]

// Only closed-won deals — these are what drive CAC calculation
const MOCK_DEALS = [
  { hubspot_deal_id: 'deal-001', contact_hubspot_id: 'test-001', deal_name: 'Rattle — Attribution',       amount: 9600,  daysAgoClose: 150 },
  { hubspot_deal_id: 'deal-002', contact_hubspot_id: 'test-002', deal_name: 'Scribe — Attribution',       amount: 9600,  daysAgoClose: 95  },
  { hubspot_deal_id: 'deal-003', contact_hubspot_id: 'test-003', deal_name: 'AirOps — Attribution',       amount: 9600,  daysAgoClose: 30  },
  { hubspot_deal_id: 'deal-004', contact_hubspot_id: 'test-004', deal_name: 'Pylon — ROI Tracking',       amount: 9600,  daysAgoClose: 125 },
  { hubspot_deal_id: 'deal-005', contact_hubspot_id: 'test-005', deal_name: 'WorkOS — ROI Tracking',      amount: 9600,  daysAgoClose: 45  },
  { hubspot_deal_id: 'deal-006', contact_hubspot_id: 'test-006', deal_name: 'PostHog — B2B Attribution',  amount: 9600,  daysAgoClose: 75  },
  { hubspot_deal_id: 'deal-007', contact_hubspot_id: 'test-007', deal_name: 'Linear — CAC Tracking',      amount: 9600,  daysAgoClose: 60  },
]

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  // Clear existing seed data
  await supabaseAdmin.from('attributions').delete().eq('user_id', userId)
  await supabaseAdmin.from('deals').delete().eq('user_id', userId).like('hubspot_deal_id', 'deal-%')
  await supabaseAdmin.from('contacts').delete().eq('user_id', userId).like('hubspot_id', 'test-%')
  await supabaseAdmin.from('keywords').delete().eq('user_id', userId)

  // Seed keywords — synced_at = today (represents current monthly spend rate)
  const kwRecords = MOCK_KEYWORDS.map((kw) => ({
    user_id: userId,
    synced_at: new Date().toISOString(),
    ...kw,
  }))
  await supabaseAdmin.from('keywords').upsert(kwRecords, { onConflict: 'user_id,keyword,campaign,ad_group' })

  // Seed contacts spread across 6 months
  const contactRecords = MOCK_CONTACTS.map((c) => ({
    user_id: userId,
    hubspot_id: c.hubspot_id,
    email: c.email,
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'Product - Core',
    utm_term: c.utm_term,
    first_page_seen: 'https://usejuno.com',
    created_at: daysAgo(c.daysAgoCreated),
    updated_at: new Date().toISOString(),
  }))

  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .upsert(contactRecords, { onConflict: 'user_id,hubspot_id' })
    .select('id, hubspot_id')

  const contactIdMap = new Map((contacts ?? []).map((c: any) => [c.hubspot_id, c.id]))

  // Seed deals spread across 6 months
  const dealRecords = MOCK_DEALS.map((d) => ({
    user_id: userId,
    hubspot_deal_id: d.hubspot_deal_id,
    contact_id: contactIdMap.get(d.contact_hubspot_id) ?? null,
    deal_name: d.deal_name,
    stage: 'closedwon',
    amount: d.amount,
    close_date: dateOnly(daysAgo(d.daysAgoClose, 0)),
    is_closed_won: true,
    updated_at: new Date().toISOString(),
  }))

  await supabaseAdmin.from('deals').upsert(dealRecords, { onConflict: 'user_id,hubspot_deal_id' })

  return NextResponse.json({
    keywords: kwRecords.length,
    contacts: contactRecords.length,
    deals: dealRecords.length,
  })
}
