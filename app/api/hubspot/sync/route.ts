import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchContacts, fetchDeals } from '@/lib/hubspot/client'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!token) return NextResponse.json({ error: 'HubSpot token not configured' }, { status: 500 })

  const contacts = await fetchContacts(token)
  const contactRecords = contacts.map((c) => ({
    user_id: session.user.id,
    ...c,
    updated_at: new Date().toISOString(),
  }))

  const { data: upsertedContacts, error: cError } = await supabaseAdmin
    .from('contacts')
    .upsert(contactRecords, { onConflict: 'user_id,hubspot_id' })
    .select('id, hubspot_id')

  if (cError) return NextResponse.json({ error: cError.message }, { status: 500 })

  const contactIdMap = new Map(
    (upsertedContacts ?? []).map((c: any) => [c.hubspot_id, c.id])
  )

  const deals = await fetchDeals(token)
  const dealRecords = deals.map((d) => {
    const contactId = d.associated_contact_ids
      .map((hid: string) => contactIdMap.get(hid))
      .find(Boolean) ?? null

    return {
      user_id: session.user.id,
      hubspot_deal_id: d.hubspot_deal_id,
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
    .upsert(dealRecords, { onConflict: 'user_id,hubspot_deal_id' })

  if (dError) return NextResponse.json({ error: dError.message }, { status: 500 })

  return NextResponse.json({ contacts: contactRecords.length, deals: dealRecords.length })
}
