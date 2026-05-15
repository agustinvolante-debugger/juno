import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runAttributionJoin } from '@/lib/attribution/join'
import { detectWaste } from '@/lib/insights/waste'
import { generateAdvisorReport } from '@/lib/insights/advisor'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { from, to, mode } = await req.json().catch(() => ({}))

    const keywords = await runAttributionJoin(session.user.id, from, to)

    if (keywords.length === 0) {
      return NextResponse.json(
        { error: 'No keyword data — sync Google Ads and run attribution first' },
        { status: 400 }
      )
    }

    const alerts = detectWaste(keywords)

    const dateFrom = from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const dateTo = to ?? new Date().toISOString().slice(0, 10)

    const report = await generateAdvisorReport(keywords, alerts, { from: dateFrom, to: dateTo }, mode)

    return NextResponse.json({ keywords, report })
  } catch (err: any) {
    console.error('Insights error:', err)
    return NextResponse.json({ error: err?.message ?? 'Insights failed' }, { status: 500 })
  }
}
