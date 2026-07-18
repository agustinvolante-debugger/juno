// /api/vc/state — per-user VC Constellation state (migration 013: vc_user_state).
// GET → { watchlist, savedQueries }.  POST one of:
//   { watch: {slug, name} } | { unwatch: slug }
//   { saveQuery: {name, filters} } | { deleteQuery: name }
// Google session only (the chat key is a shared secret, not an identity for state).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { vcCors, vcSessionEmail } from '@/lib/vc/vc-auth'

export const dynamic = 'force-dynamic'

const WATCH_CAP = 100
const QUERY_CAP = 30

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: vcCors(req) })
}

async function getState(email: string) {
  const { data, error } = await supabaseAdmin.from('vc_user_state').select('watchlist,saved_queries').eq('user_email', email).maybeSingle()
  if (error) throw new Error(/relation|does not exist/.test(error.message) ? 'apply supabase/migrations/013_vc_multiuser.sql first' : error.message)
  return { watchlist: (data?.watchlist as any[]) || [], savedQueries: (data?.saved_queries as any[]) || [] }
}

export async function GET(req: NextRequest) {
  const cors = vcCors(req)
  const email = await vcSessionEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors })
  try {
    return NextResponse.json(await getState(email), { headers: cors })
  } catch (e: any) {
    return NextResponse.json({ watchlist: [], savedQueries: [], error: e.message }, { headers: cors })
  }
}

export async function POST(req: NextRequest) {
  const cors = vcCors(req)
  const email = await vcSessionEmail()
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors })
  const body = await req.json().catch(() => ({}))
  let st
  try { st = await getState(email) } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500, headers: cors }) }

  if (body.watch?.slug) {
    st.watchlist = st.watchlist.filter((w) => w.slug !== body.watch.slug)
    st.watchlist.push({ slug: String(body.watch.slug).slice(0, 80), name: String(body.watch.name || body.watch.slug).slice(0, 120), added: new Date().toISOString() })
    st.watchlist = st.watchlist.slice(-WATCH_CAP)
  } else if (body.unwatch) {
    st.watchlist = st.watchlist.filter((w) => w.slug !== body.unwatch)
  } else if (body.saveQuery?.name) {
    st.savedQueries = st.savedQueries.filter((q) => q.name !== body.saveQuery.name)
    st.savedQueries.push({ name: String(body.saveQuery.name).slice(0, 60), filters: body.saveQuery.filters || {}, created: new Date().toISOString() })
    st.savedQueries = st.savedQueries.slice(-QUERY_CAP)
  } else if (body.deleteQuery) {
    st.savedQueries = st.savedQueries.filter((q) => q.name !== body.deleteQuery)
  } else {
    return NextResponse.json({ error: 'nothing to do' }, { status: 400, headers: cors })
  }

  const { error } = await supabaseAdmin.from('vc_user_state').upsert(
    { user_email: email, watchlist: st.watchlist, saved_queries: st.savedQueries, updated_at: new Date().toISOString() },
    { onConflict: 'user_email' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ ok: true, ...st }, { headers: cors })
}
