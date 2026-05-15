import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runAttributionJoin } from '@/lib/attribution/join'
import { generateLabSuggestions } from '@/lib/lab/suggestions'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const keywords = await runAttributionJoin(session.user.id)
  if (keywords.length === 0) {
    return NextResponse.json({ error: 'No attribution data — run attribution first' }, { status: 400 })
  }

  const suggestions = await generateLabSuggestions(keywords)
  return NextResponse.json({ suggestions })
}
