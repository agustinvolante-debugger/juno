import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { path } = await req.json()
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'missing path' }, { status: 400 })
  }

  await supabaseAdmin.from('page_views').insert({
    path,
    referrer: req.headers.get('referer') || null,
    user_agent: req.headers.get('user-agent') || null,
    country: req.headers.get('x-vercel-ip-country') || null,
    city: req.headers.get('x-vercel-ip-city') || null,
  })

  return NextResponse.json({ ok: true })
}
