import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runAttributionJoin } from '@/lib/attribution/join'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { from, to } = await req.json().catch(() => ({}))

    const results = await runAttributionJoin(session.user.id, from, to)
    return NextResponse.json({ results })
  } catch (err: any) {
    console.error('Attribution error:', err)
    return NextResponse.json({ error: err?.message ?? 'Attribution failed' }, { status: 500 })
  }
}
