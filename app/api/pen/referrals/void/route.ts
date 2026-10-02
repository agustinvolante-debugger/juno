import { NextResponse } from 'next/server'
import { authedEmail } from '@/lib/news/auth'
import { isOwner } from '@/lib/pen/owner'
import { voidReferral } from '@/lib/pen/referral-events'
import { supabaseAdmin } from '@/lib/supabase'
import type { Referral } from '@/lib/pen/referrals'

export const dynamic = 'force-dynamic'

// Owners only: void a referral that looks wrong (Customers → Referrals). Takes back unused credit.
export async function POST(req: Request) {
  const email = await authedEmail()
  if (!isOwner(email)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data } = await supabaseAdmin.from('pen_referrals').select('*').eq('id', b.id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'No such referral.' }, { status: 404 })
  try {
    return NextResponse.json(await voidReferral(data as Referral, `voided by ${email}`))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
