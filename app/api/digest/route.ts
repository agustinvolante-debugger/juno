import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runAttributionJoin } from '@/lib/attribution/join'
import { buildDigestHtml } from '@/lib/email/digest'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const keywords = await runAttributionJoin(session.user.id)

  if (keywords.length === 0) {
    return NextResponse.json({ error: 'No attribution data — sync Google Ads and HubSpot first' }, { status: 400 })
  }

  const weekOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const html = buildDigestHtml({
    userEmail: session.user.email,
    keywords,
    weekOf,
  })

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: session.user.email,
    subject: `Juno weekly digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    html,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sent: true, id: data?.id })
}
