// POST /api/vc/request-info  { company, note? }
// Logs a search-miss request and emails a notification (reuses the news email helper).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/news/email'

export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }) }

export async function POST(req: NextRequest) {
  const { company, note } = await req.json().catch(() => ({}))
  if (!company || typeof company !== 'string') return NextResponse.json({ error: 'company required' }, { status: 400, headers: CORS })
  const q = company.slice(0, 200)
  await supabaseAdmin.from('vc_info_requests').insert({ company_query: q, note: note ? String(note).slice(0, 500) : null })
  const to = process.env.VC_ALERT_EMAIL || process.env.RESEND_FROM_EMAIL
  if (to) {
    await sendEmail({
      to,
      subject: `VC Constellation — info requested: ${q}`,
      html: `<p>Someone searched <b>${q}</b> in the VC Constellation and it wasn't found (no EDGAR match either).</p>${note ? `<p>Note: ${String(note).slice(0, 500)}</p>` : ''}<p>Logged to <code>vc_info_requests</code>.</p>`,
    })
  }
  return NextResponse.json({ ok: true }, { headers: CORS })
}

// GET /api/vc/request-info -> pending count (for the in-app inbox badge)
export async function GET() {
  const { count } = await supabaseAdmin.from('vc_info_requests').select('*', { count: 'exact', head: true }).eq('resolved', false)
  return NextResponse.json({ pending: count || 0 }, { headers: CORS })
}
