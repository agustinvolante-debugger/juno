import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('lab_experiments')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ experiments: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, type, if_action, then_statement, because_reason, window_days, expected_impact, keywords_affected } = body

  const startDate = new Date()
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + window_days)

  const { data, error } = await supabaseAdmin
    .from('lab_experiments')
    .insert({
      user_id: session.user.id,
      title,
      type,
      if_action,
      then_statement,
      because_reason,
      window_days,
      expected_impact,
      keywords_affected,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ experiment: data })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await req.json()

  const { error } = await supabaseAdmin
    .from('lab_experiments')
    .update({ status })
    .eq('id', id)
    .eq('user_id', session.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
