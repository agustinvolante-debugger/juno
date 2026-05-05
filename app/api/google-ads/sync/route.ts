import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchKeywordReport, fetchDSASearchTermReport, fetchDSATargetMapping, fetchPMAXSearchTermReport } from '@/lib/google-ads/client'
import { NextRequest, NextResponse } from 'next/server'

function extractGoogleAdsError(e: any): string {
  if (e?.errors?.length) {
    return e.errors.map((err: any) => err?.message || err?.error_code ? JSON.stringify(err.error_code) : 'Unknown error').join('; ')
  }
  return e?.message || String(e) || 'Unknown error'
}

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

    const refreshToken = tokenRow.refresh_token
    const warnings: string[] = []

    // 1. Sync standard keywords
    let kwRecords: any[] = []
    try {
      const keywords = await fetchKeywordReport(refreshToken, customer_id)

      kwRecords = keywords.map((kw) => ({
        user_id: session.user.id,
        keyword: kw.keyword,
        campaign: kw.campaign,
        ad_group: kw.ad_group,
        spend_monthly: kw.spend_monthly,
        impressions: kw.impressions,
        clicks: kw.clicks,
        source_type: 'keyword' as const,
        synced_at: new Date().toISOString(),
      }))

      if (kwRecords.length > 0) {
        const { error } = await supabaseAdmin
          .from('keywords')
          .upsert(kwRecords, { onConflict: 'user_id,keyword,campaign,ad_group,source_type' })

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } catch (e: any) {
      const msg = extractGoogleAdsError(e)
      const msgLower = msg.toLowerCase()
      const isAuthError = msgLower.includes('authorization_error') || msgLower.includes('not enabled') || msgLower.includes('deactivated')
      const isPermissionError = msgLower.includes('permission_denied') || msgLower.includes('user_permission_denied')

      if (isAuthError || isPermissionError) {
        return NextResponse.json({
          error: 'Google Ads account not accessible',
          detail: isAuthError
            ? 'This account is not fully enabled — check that billing is set up and Terms of Service are accepted in the Google Ads UI.'
            : 'You do not have permission to access this account. Make sure the account ID is correct and your Google account has at least read-only access.',
        }, { status: 400 })
      }

      console.warn('Keyword sync failed (continuing with DSA/PMAX):', msg)
      warnings.push(`Keyword sync skipped: ${msg}`)
    }

    // 2. Sync DSA search terms (non-blocking — DSA campaigns may not exist)
    let dsaCount = 0
    try {
      const dsaTerms = await fetchDSASearchTermReport(refreshToken, customer_id)

      if (dsaTerms.length > 0) {
        const dsaRecords = dsaTerms.map((t) => ({
          user_id: session.user.id,
          keyword: t.keyword,
          campaign: t.campaign,
          ad_group: t.ad_group,
          spend_monthly: t.spend_monthly,
          impressions: t.impressions,
          clicks: t.clicks,
          source_type: 'dsa_search_term' as const,
          landing_page: t.landing_page,
          headline: t.headline,
          synced_at: new Date().toISOString(),
        }))

        await supabaseAdmin
          .from('keywords')
          .upsert(dsaRecords, { onConflict: 'user_id,keyword,campaign,ad_group,source_type' })

        dsaCount = dsaRecords.length
      }

      // Store DSA target mapping for attribution resolution
      const targetMapping = await fetchDSATargetMapping(refreshToken, customer_id)
      if (Object.keys(targetMapping).length > 0) {
        await supabaseAdmin
          .from('oauth_tokens')
          .update({ extra: { dsa_targets: targetMapping }, updated_at: new Date().toISOString() })
          .eq('user_id', session.user.id)
          .eq('provider', 'google_ads')
      }
    } catch (e: any) {
      console.warn('DSA sync skipped (no DSA campaigns or API limitation):', e.message)
    }

    // 3. Sync PMAX search terms (non-blocking)
    let pmaxCount = 0
    try {
      const pmaxTerms = await fetchPMAXSearchTermReport(refreshToken, customer_id)

      if (pmaxTerms.length > 0) {
        const pmaxRecords = pmaxTerms.map((t) => ({
          user_id: session.user.id,
          keyword: t.keyword,
          campaign: t.campaign,
          ad_group: t.ad_group,
          spend_monthly: t.spend_monthly,
          impressions: t.impressions,
          clicks: t.clicks,
          source_type: 'pmax_search_term' as const,
          synced_at: new Date().toISOString(),
        }))

        await supabaseAdmin
          .from('keywords')
          .upsert(pmaxRecords, { onConflict: 'user_id,keyword,campaign,ad_group,source_type' })

        pmaxCount = pmaxRecords.length
      }
    } catch (e: any) {
      console.warn('PMAX sync skipped (no PMAX campaigns or API limitation):', e.message)
    }

    return NextResponse.json({
      synced: kwRecords.length,
      dsa_search_terms: dsaCount,
      pmax_search_terms: pmaxCount,
      ...(warnings.length > 0 && { warnings }),
    })
  } catch (err: any) {
    console.error('Google Ads sync error:', err)
    const msg = err?.message ?? 'Google Ads sync failed'
    const isClientError = msg.includes('INVALID_CUSTOMER_ID') || msg.includes('customer_id')
    return NextResponse.json(
      { error: msg, detail: err?.errors ?? null },
      { status: isClientError ? 400 : 500 }
    )
  }
}
