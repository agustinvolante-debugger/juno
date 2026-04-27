import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// Exchanges HubSpot OAuth code for tokens and stores them in Supabase
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/auth/signin`)

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard?error=hubspot_denied`)

  const tokenRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/hubspot/callback`,
      code,
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard?error=hubspot_token_failed`)
  }

  await supabaseAdmin.from('oauth_tokens').upsert({
    user_id: session.user.id,
    provider: 'hubspot',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null,
    scope: tokens.scope ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' })

  return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard?connected=hubspot`)
}
