import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/auth/signin', process.env.NEXTAUTH_URL))

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/dashboard?error=rd_station_no_code', process.env.NEXTAUTH_URL))

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/rd-station/marketing/callback`

  const tokenRes = await fetch('https://api.rd.services/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.RD_STATION_MARKETING_CLIENT_ID,
      client_secret: process.env.RD_STATION_MARKETING_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('RD Station Marketing OAuth failed:', err)
    return NextResponse.redirect(new URL('/dashboard?error=rd_station_auth_failed', process.env.NEXTAUTH_URL))
  }

  const tokens = await tokenRes.json()

  await supabaseAdmin.from('oauth_tokens').upsert(
    {
      user_id: session.user.id,
      provider: 'rd_station_marketing',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  )

  return NextResponse.redirect(new URL('/dashboard?connected=rd_station_marketing', process.env.NEXTAUTH_URL))
}
