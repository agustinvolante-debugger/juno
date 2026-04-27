import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchKeywordReport } from '@/lib/google-ads/client'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { customer_id } = body
    if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

    const { data: tokenRow } = await supabaseAdmin
      .from('oauth_tokens')
      .select('refresh_token')
      .eq('user_id', session.user.id)
      .eq('provider', 'google_ads')
      .single()

    if (!tokenRow?.refresh_token) {
      return NextResponse.json({ error: 'Google Ads not connected — please reconnect' }, { status: 400 })
    }

    const keywords = await fetchKeywordReport(tokenRow.refresh_token, customer_id)

    if (keywords.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No active keywords found in the last 90 days' })
    }

    const records = keywords.map((kw) => ({
      user_id: session.user.id,
      keyword: kw.keyword,
      campaign: kw.campaign,
      ad_group: kw.ad_group,
      spend_monthly: kw.spend_monthly,
      impressions: kw.impressions,
      clicks: kw.clicks,
      synced_at: new Date().toISOString(),
    }))

    const { error } = await supabaseAdmin
      .from('keywords')
      .upsert(records, { onConflict: 'user_id,keyword,campaign,ad_group' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ synced: records.length })
  } catch (err: any) {
    console.error('Google Ads sync error:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Google Ads sync failed', detail: err?.errors ?? null },
      { status: 500 }
    )
  }
}
