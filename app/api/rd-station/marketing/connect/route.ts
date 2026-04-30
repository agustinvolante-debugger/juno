import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.redirect(new URL('/auth/signin', process.env.NEXTAUTH_URL))

  const clientId = process.env.RD_STATION_MARKETING_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'RD Station client ID not configured' }, { status: 500 })

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/rd-station/marketing/callback`

  const url = `https://api.rd.services/auth/dialog?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`

  return NextResponse.redirect(url)
}
