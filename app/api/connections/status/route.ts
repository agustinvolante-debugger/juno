import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tokens } = await supabaseAdmin
    .from('oauth_tokens')
    .select('provider, extra')
    .eq('user_id', session.user.id)

  const providers = new Set((tokens ?? []).map((t: any) => t.provider))
  const gadsToken = (tokens ?? []).find((t: any) => t.provider === 'google_ads')
  const savedCustomerId = gadsToken?.extra?.customer_id ?? null

  return NextResponse.json({
    google_ads: providers.has('google_ads'),
    hubspot: providers.has('hubspot'),
    rd_station_marketing: providers.has('rd_station_marketing'),
    google_ads_customer_id: savedCustomerId,
  })
}
