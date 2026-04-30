import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const [kw, contacts, deals, attrs] = await Promise.all([
    supabaseAdmin.from('keywords').select('keyword, source_type, synced_at').eq('user_id', userId).limit(5),
    supabaseAdmin.from('contacts').select('crm_id, crm_provider, utm_term, created_at').eq('user_id', userId).limit(5),
    supabaseAdmin.from('deals').select('crm_deal_id, crm_provider, contact_id, close_date, is_closed_won').eq('user_id', userId).limit(5),
    supabaseAdmin.from('attributions').select('keyword, campaign').eq('user_id', userId).limit(5),
  ])

  return NextResponse.json({
    userId,
    keywords: { count: kw.data?.length ?? 0, error: kw.error?.message ?? null, sample: kw.data?.slice(0, 3) },
    contacts: { count: contacts.data?.length ?? 0, error: contacts.error?.message ?? null, sample: contacts.data?.slice(0, 3) },
    deals: { count: deals.data?.length ?? 0, error: deals.error?.message ?? null, sample: deals.data?.slice(0, 3) },
    attributions: { count: attrs.data?.length ?? 0, error: attrs.error?.message ?? null },
  })
}
