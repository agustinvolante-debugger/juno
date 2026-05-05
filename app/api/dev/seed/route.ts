import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

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
  - 2 DSA search terms with deals → SCALE (DSA attribution demo)
*/

const MOCK_KEYWORDS = [
  { keyword: 'hubspot attribution software',    campaign: 'Product - Core',       ad_group: 'Attribution Tools', spend_monthly: 1200, impressions: 4200, clicks: 310, source_type: 'keyword' as const },
  { keyword: 'google ads roi tracking',         campaign: 'Product - Core',       ad_group: 'ROI Tracking',      spend_monthly: 980,  impressions: 3800, clicks: 240, source_type: 'keyword' as const },
  { keyword: 'keyword level attribution b2b',   campaign: 'Product - Core',       ad_group: 'Attribution Tools', spend_monthly: 760,  impressions: 2100, clicks: 180, source_type: 'keyword' as const },
  { keyword: 'cac by keyword saas',             campaign: 'Product - Core',       ad_group: 'CAC Tracking',      spend_monthly: 640,  impressions: 1900, clicks: 140, source_type: 'keyword' as const },
  { keyword: 'google ads hubspot integration',  campaign: 'Brand - Competitors',  ad_group: 'Integrations',      spend_monthly: 2200, impressions: 6100, clicks: 410, source_type: 'keyword' as const },
  { keyword: 'marketing attribution software',  campaign: 'Brand - Competitors',  ad_group: 'Attribution Tools', spend_monthly: 3100, impressions: 8400, clicks: 520, source_type: 'keyword' as const },
  { keyword: 'google ads wasted spend',         campaign: 'Pain Points',          ad_group: 'Budget Waste',      spend_monthly: 1800, impressions: 5200, clicks: 380, source_type: 'keyword' as const },
  { keyword: 'paid search tracking tool',       campaign: 'Pain Points',          ad_group: 'Tracking',          spend_monthly: 920,  impressions: 2800, clicks: 195, source_type: 'keyword' as const },
  // DSA search terms (with landing pages for fallback attribution)
  { keyword: 'used excavator for sale',         campaign: 'DSA - Machinery',      ad_group: 'Dynamic Ad Group',  spend_monthly: 450,  impressions: 1800, clicks: 95,  source_type: 'dsa_search_term' as const, landing_page: 'https://maquinalista.com/excavators' },
  { keyword: 'buy used tractor near me',        campaign: 'DSA - Machinery',      ad_group: 'Dynamic Ad Group',  spend_monthly: 380,  impressions: 1500, clicks: 78,  source_type: 'dsa_search_term' as const, landing_page: 'https://maquinalista.com/tractors' },
]

const MOCK_CONTACTS = [
  // "hubspot attribution software" → 3 deals (scale)
  { crm_id: 'test-001', email: 'sarah@rattle.com',    utm_term: 'hubspot attribution software',   daysAgoCreated: 165 },
  { crm_id: 'test-002', email: 'mike@scribe.com',     utm_term: 'hubspot attribution software',   daysAgoCreated: 110 },
  { crm_id: 'test-003', email: 'james@airops.com',    utm_term: 'hubspot attribution software',   daysAgoCreated: 45  },
  // "google ads roi tracking" → 2 deals (scale)
  { crm_id: 'test-004', email: 'lisa@pylon.com',      utm_term: 'google ads roi tracking',        daysAgoCreated: 140 },
  { crm_id: 'test-005', email: 'dan@workos.com',      utm_term: 'google ads roi tracking',        daysAgoCreated: 60  },
  // "keyword level attribution b2b" → 1 deal (monitor)
  { crm_id: 'test-006', email: 'anna@posthog.com',    utm_term: 'keyword level attribution b2b',  daysAgoCreated: 90  },
  // "cac by keyword saas" → 1 deal (monitor)
  { crm_id: 'test-007', email: 'tom@linear.com',      utm_term: 'cac by keyword saas',            daysAgoCreated: 75  },
  // These contacts clicked but never became deals
  { crm_id: 'test-008', email: 'bob@example.com',     utm_term: 'google ads hubspot integration', daysAgoCreated: 155 },
  { crm_id: 'test-009', email: 'carol@example.com',   utm_term: 'marketing attribution software', daysAgoCreated: 130 },
  { crm_id: 'test-010', email: 'dave@example.com',    utm_term: 'google ads wasted spend',        daysAgoCreated: 100 },
  // DSA contacts — utm_term contains target ID that maps to search terms
  { crm_id: 'test-011', email: 'pedro@maquinas.br',   utm_term: 'used excavator for sale',        daysAgoCreated: 50  },
  { crm_id: 'test-012', email: 'maria@agro.br',       utm_term: 'buy used tractor near me',       daysAgoCreated: 35  },
  // FALLBACK TEST: utm_term is null, but first_page_seen URL has utm_term in query params
  { crm_id: 'test-013', email: 'carlos@construcao.br', utm_term: null,                            daysAgoCreated: 40, first_page_seen: 'https://maquinalista.com/excavators?utm_source=google&utm_medium=cpc&utm_term=used+excavator+for+sale' },
  // FALLBACK TEST: utm_term is null, first_page_seen is a plain landing page matching DSA keyword
  { crm_id: 'test-014', email: 'lucia@fazenda.br',     utm_term: null,                            daysAgoCreated: 28, first_page_seen: 'https://maquinalista.com/tractors' },
]

const MOCK_DEALS = [
  { crm_deal_id: 'deal-001', contact_crm_id: 'test-001', deal_name: 'Rattle — Attribution',       amount: 9600,  daysAgoClose: 150 },
  { crm_deal_id: 'deal-002', contact_crm_id: 'test-002', deal_name: 'Scribe — Attribution',       amount: 9600,  daysAgoClose: 95  },
  { crm_deal_id: 'deal-003', contact_crm_id: 'test-003', deal_name: 'AirOps — Attribution',       amount: 9600,  daysAgoClose: 30  },
  { crm_deal_id: 'deal-004', contact_crm_id: 'test-004', deal_name: 'Pylon — ROI Tracking',       amount: 9600,  daysAgoClose: 125 },
  { crm_deal_id: 'deal-005', contact_crm_id: 'test-005', deal_name: 'WorkOS — ROI Tracking',      amount: 9600,  daysAgoClose: 45  },
  { crm_deal_id: 'deal-006', contact_crm_id: 'test-006', deal_name: 'PostHog — B2B Attribution',  amount: 9600,  daysAgoClose: 75  },
  { crm_deal_id: 'deal-007', contact_crm_id: 'test-007', deal_name: 'Linear — CAC Tracking',      amount: 9600,  daysAgoClose: 60  },
  // DSA deals
  { crm_deal_id: 'deal-008', contact_crm_id: 'test-011', deal_name: 'Excavator Sale — São Paulo',  amount: 85000, daysAgoClose: 25  },
  { crm_deal_id: 'deal-009', contact_crm_id: 'test-012', deal_name: 'Tractor Sale — Minas Gerais', amount: 62000, daysAgoClose: 15  },
  // Fallback deals — these should still attribute even though contacts have no utm_term
  { crm_deal_id: 'deal-010', contact_crm_id: 'test-013', deal_name: 'Excavator Sale — Rio (URL fallback)',     amount: 72000, daysAgoClose: 20  },
  { crm_deal_id: 'deal-011', contact_crm_id: 'test-014', deal_name: 'Tractor Sale — Goiás (landing page fallback)', amount: 55000, daysAgoClose: 10  },
]

export async function POST() {
  try {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  // Clear existing seed data
  const { error: delAttrErr } = await supabaseAdmin.from('attributions').delete().eq('user_id', userId)
  const { error: delDealErr } = await supabaseAdmin.from('deals').delete().eq('user_id', userId).like('crm_deal_id', 'deal-%')
  const { error: delContactErr } = await supabaseAdmin.from('contacts').delete().eq('user_id', userId).like('crm_id', 'test-%')
  const { error: delKwErr } = await supabaseAdmin.from('keywords').delete().eq('user_id', userId)

  if (delAttrErr || delDealErr || delContactErr || delKwErr) {
    console.error('Seed delete errors:', { delAttrErr, delDealErr, delContactErr, delKwErr })
  }

  // Seed keywords
  const kwRecords = MOCK_KEYWORDS.map((kw) => ({
    user_id: userId,
    synced_at: new Date().toISOString(),
    ...kw,
  }))
  const { error: kwError } = await supabaseAdmin.from('keywords').upsert(kwRecords, { onConflict: 'user_id,keyword,campaign,ad_group,source_type' })
  if (kwError) console.error('Seed keywords error:', kwError)

  // Seed contacts
  const contactRecords = MOCK_CONTACTS.map((c) => ({
    user_id: userId,
    crm_id: c.crm_id,
    crm_provider: 'hubspot' as const,
    email: c.email,
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'Product - Core',
    utm_term: c.utm_term,
    first_page_seen: (c as any).first_page_seen ?? 'https://usejuno.com',
    created_at: daysAgo(c.daysAgoCreated),
    updated_at: new Date().toISOString(),
  }))

  const { data: contacts, error: contactError } = await supabaseAdmin
    .from('contacts')
    .upsert(contactRecords, { onConflict: 'user_id,crm_provider,crm_id' })
    .select('id, crm_id')

  if (contactError) console.error('Seed contacts error:', contactError)
  console.log('Seed contacts returned:', contacts?.length ?? 0, 'rows')

  const contactIdMap = new Map((contacts ?? []).map((c: any) => [c.crm_id, c.id]))

  // Seed deals
  const dealRecords = MOCK_DEALS.map((d) => ({
    user_id: userId,
    crm_deal_id: d.crm_deal_id,
    crm_provider: 'hubspot' as const,
    contact_id: contactIdMap.get(d.contact_crm_id) ?? null,
    deal_name: d.deal_name,
    stage: 'closedwon',
    amount: d.amount,
    close_date: dateOnly(daysAgo(d.daysAgoClose, 0)),
    is_closed_won: true,
    updated_at: new Date().toISOString(),
  }))

  const { error: dealError } = await supabaseAdmin.from('deals').upsert(dealRecords, { onConflict: 'user_id,crm_provider,crm_deal_id' })
  if (dealError) console.error('Seed deals error:', dealError)

  return NextResponse.json({
    keywords: kwRecords.length,
    contacts: contactRecords.length,
    deals: dealRecords.length,
    errors: {
      keywords: kwError?.message ?? null,
      contacts: contactError?.message ?? null,
      deals: dealError?.message ?? null,
    },
  })
  } catch (err: any) {
    console.error('Seed error:', err)
    return NextResponse.json({ error: err?.message ?? 'Seed failed' }, { status: 500 })
  }
}
