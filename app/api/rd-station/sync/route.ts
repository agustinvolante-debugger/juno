import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { refreshMarketingToken, fetchRDContacts } from '@/lib/rd-station/marketing-client'
import { fetchRDDeals } from '@/lib/rd-station/crm-client'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  // 1. Load and refresh RD Station Marketing token
  const { data: mktToken, error: mktErr } = await supabaseAdmin
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'rd_station_marketing')
    .single()

  if (mktErr || !mktToken) {
    return NextResponse.json({ error: 'RD Station Marketing not connected. Please connect first.' }, { status: 400 })
  }

  let accessToken = mktToken.access_token
  const isExpired = mktToken.expires_at && new Date(mktToken.expires_at) < new Date(Date.now() + 5 * 60 * 1000)

  if (isExpired && mktToken.refresh_token) {
    try {
      const refreshed = await refreshMarketingToken(mktToken.refresh_token)
      accessToken = refreshed.access_token

      await supabaseAdmin.from('oauth_tokens').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('provider', 'rd_station_marketing')
    } catch (e: any) {
      return NextResponse.json({ error: `Token refresh failed: ${e.message}. Please reconnect RD Station Marketing.` }, { status: 401 })
    }
  }

  // 2. Load RD Station CRM token
  const { data: crmToken, error: crmErr } = await supabaseAdmin
    .from('oauth_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'rd_station_crm')
    .single()

  if (crmErr || !crmToken) {
    return NextResponse.json({ error: 'RD Station CRM token not configured. Please enter your API token.' }, { status: 400 })
  }

  // 3. Fetch and upsert contacts from Marketing API
  const contacts = await fetchRDContacts(accessToken)
  const contactRecords = contacts.map((c) => ({
    user_id: userId,
    ...c,
    updated_at: new Date().toISOString(),
  }))

  const { data: upsertedContacts, error: cError } = await supabaseAdmin
    .from('contacts')
    .upsert(contactRecords, { onConflict: 'user_id,crm_provider,crm_id' })
    .select('id, crm_id, email')

  if (cError) return NextResponse.json({ error: `Contact sync failed: ${cError.message}` }, { status: 500 })

  // Build email→contact ID map for bridging deals to contacts
  const emailToContactId = new Map<string, string>()
  for (const c of upsertedContacts ?? []) {
    if (c.email) emailToContactId.set(c.email.toLowerCase(), c.id)
  }

  // 4. Fetch and upsert deals from CRM API
  const deals = await fetchRDDeals(crmToken.access_token)
  const dealRecords = deals.map((d) => {
    // Bridge: match deal's contact emails to our contacts by email
    const contactId = d.contact_emails
      .map((email: string) => emailToContactId.get(email.toLowerCase()))
      .find(Boolean) ?? null

    return {
      user_id: userId,
      crm_deal_id: d.crm_deal_id,
      crm_provider: 'rd_station' as const,
      contact_id: contactId,
      deal_name: d.deal_name,
      stage: d.stage,
      amount: d.amount,
      close_date: d.close_date,
      is_closed_won: d.is_closed_won,
      updated_at: new Date().toISOString(),
    }
  })

  const { error: dError } = await supabaseAdmin
    .from('deals')
    .upsert(dealRecords, { onConflict: 'user_id,crm_provider,crm_deal_id' })

  if (dError) return NextResponse.json({ error: `Deal sync failed: ${dError.message}` }, { status: 500 })

  const linkedDeals = dealRecords.filter((d) => d.contact_id !== null).length

  return NextResponse.json({
    contacts: contactRecords.length,
    deals: dealRecords.length,
    linked_deals: linkedDeals,
  })
}
