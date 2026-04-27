import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'

// Redirects user to HubSpot OAuth consent screen
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/hubspot/callback`,
    scope: 'crm.objects.contacts.read crm.objects.deals.read',
  })

  return NextResponse.redirect(
    `https://app.hubspot.com/oauth/authorize?${params.toString()}`
  )
}
