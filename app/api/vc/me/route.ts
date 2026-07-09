// GET /api/vc/me — session probe for the vc. frontend login gate.
// Always 200: {authorized, email}. Cross-subdomain via the .tryjunoapp.com cookie.
import { NextRequest, NextResponse } from 'next/server'
import { vcCors, vcSessionEmail } from '@/lib/vc/vc-auth'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: vcCors(req) })
}

export async function GET(req: NextRequest) {
  const email = await vcSessionEmail()
  return NextResponse.json({ authorized: !!email, email }, { headers: vcCors(req) })
}
