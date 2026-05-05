import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// Exchanges the OAuth code for tokens and stores them in Supabase
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/auth/signin`)

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard?error=google_ads_denied`)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/google-ads/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    console.error('Google Ads token exchange failed:', JSON.stringify(tokens))
    const detail = tokens.error_description || tokens.error || 'unknown'
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard?error=google_ads_token_failed&detail=${encodeURIComponent(detail)}`)
  }

  await supabaseAdmin.from('oauth_tokens').upsert({
    user_id: session.user.id,
    provider: 'google_ads',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null,
    scope: tokens.scope ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })

  return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard?connected=google_ads`)
}
