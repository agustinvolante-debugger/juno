import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { slug } = await req.json()
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'missing slug' }, { status: 400 })
  }

  await supabaseAdmin.from('report_views').insert({
    slug,
    referrer: req.headers.get('referer') || null,
    user_agent: req.headers.get('user-agent') || null,
    country: req.headers.get('x-vercel-ip-country') || null,
    city: req.headers.get('x-vercel-ip-city') || null,
  })

  return NextResponse.json({ ok: true })
}
