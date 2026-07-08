// GET /api/vc/graph — returns the VC Constellation dataset reshaped into the exact
// window.VCBRAIN / window.VCBIOS structures the static frontend render engine expects.
// Public read (data is public reference info). Optional filters narrow the subset.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS })
}

export async function GET(req: NextRequest) {
  const sb = supabaseAdmin
  const p = req.nextUrl.searchParams
  const sector = p.get('sector')
  const minLast = p.get('minLastRound') ? Number(p.get('minLastRound')) : null
  const minTotal = p.get('minTotalRaised') ? Number(p.get('minTotalRaised')) : null
  const investor = p.get('investor')       // firm slug
  const boardMember = p.get('boardMember') // person name (normalized-ish)
  const boardSeatsOnly = p.get('boardSeatsOnly') === '1'

  const [firmsR, peopleR, coR, invR, seatsR] = await Promise.all([
    sb.from('vc_firms').select('id,slug,name').limit(10000),
    sb.from('vc_people').select('id,full_name,firm_id,title,bio,profile_url,linkedin,x_url').limit(10000),
    sb.from('vc_companies').select('id,slug,name,sector,total_raised,last_round,last_round_amount,last_round_date').limit(10000),
    sb.from('vc_investments').select('firm_id,company_id,partner_id,round,amount_text,amount_num,date,lead,confidence,source_text').limit(50000),
    sb.from('vc_board_seats').select('person_id,company_id,firm_id,person_name,as_of,confidence,source_text,source_url,source_kind,is_published').eq('is_published', true).limit(50000),
  ])
  for (const r of [firmsR, peopleR, coR, invR, seatsR]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500, headers: CORS })
  }

  const firmById = new Map(firmsR.data!.map((f) => [f.id, f]))
  const coById = new Map(coR.data!.map((c) => [c.id, c]))
  const personById = new Map(peopleR.data!.map((p2) => [p2.id, p2]))

  // vcs (with partner name lists) + companies, in the frontend's slug-keyed shape
  const partnersByFirm: Record<string, string[]> = {}
  for (const p2 of peopleR.data!) if (p2.firm_id) (partnersByFirm[p2.firm_id] ||= []).push(p2.full_name)
  const vcs = firmsR.data!.map((f) => ({ id: f.slug, name: f.name, partners: partnersByFirm[f.id] || [] }))
  const companies = coR.data!.map((c) => ({
    id: c.slug, name: c.name, sector: c.sector, totalRaised: c.total_raised,
    lastRound: c.last_round, lastRoundAmount: c.last_round_amount, lastRoundDate: c.last_round_date,
  }))

  // investments — merge board-seat flag; synthesize edges for board seats without an investment row
  const investments = invR.data!.map((iv) => {
    const f = firmById.get(iv.firm_id), c = coById.get(iv.company_id)
    const partner = iv.partner_id ? personById.get(iv.partner_id)?.full_name || null : null
    return {
      vc: f?.slug, company: c?.slug, partner, boardSeat: false,
      amount: iv.amount_text, round: iv.round, date: iv.date, lead: iv.lead,
      confidence: iv.confidence, source: iv.source_text,
      sourceKind: null as string | null, sourceUrl: null as string | null,
    }
  }).filter((e) => e.vc && e.company)

  const seatByKey = new Map<string, any>()
  for (const s of seatsR.data!) {
    const f = s.firm_id ? firmById.get(s.firm_id) : null
    const c = coById.get(s.company_id)
    if (!c) continue
    seatByKey.set(`${f?.slug || ''}|${c.slug}|${s.person_name}`, { s, fSlug: f?.slug, cSlug: c.slug })
  }
  for (const e of investments) {
    const k = `${e.vc}|${e.company}|${e.partner || ''}`
    const hit = seatByKey.get(k)
    if (hit) { e.boardSeat = true; e.sourceKind = hit.s.source_kind; e.sourceUrl = hit.s.source_url; seatByKey.delete(k) }
  }
  // remaining board seats had no matching investment (e.g. Form D-sourced) → add gold edges
  for (const { s, fSlug, cSlug } of seatByKey.values()) {
    if (!fSlug || !cSlug) continue
    investments.push({
      vc: fSlug, company: cSlug, partner: s.person_name, boardSeat: true, amount: null,
      round: null, date: s.as_of ? String(s.as_of).slice(0, 7) : null, lead: false,
      confidence: s.confidence, source: s.source_text,
      sourceKind: s.source_kind, sourceUrl: s.source_url,
    })
  }

  // bios keyed "<Name>@<firmSlug>" (frontend lookup key)
  const bios: Record<string, any> = {}
  for (const p2 of peopleR.data!) {
    if (!p2.firm_id) continue
    const f = firmById.get(p2.firm_id)
    if (!f) continue
    bios[`${p2.full_name}@${f.slug}`] = {
      name: p2.full_name, firm: f.name, firmId: f.slug, bio: p2.bio || null,
      role: p2.title || null, profileUrl: p2.profile_url || null, linkedin: p2.linkedin || null, x: p2.x_url || null,
    }
  }

  // ---- optional filters (server-side subset) ----
  let cos = companies
  if (sector) cos = cos.filter((c) => (c.sector || '').toLowerCase().includes(sector.toLowerCase()))
  if (minLast != null) cos = cos.filter((c) => (c.lastRoundAmount || 0) >= minLast)
  if (minTotal != null) cos = cos.filter((c) => parseTotal(c.totalRaised) >= minTotal)
  if (investor) {
    const backed = new Set(investments.filter((e) => e.vc === investor).map((e) => e.company))
    cos = cos.filter((c) => backed.has(c.id))
  }
  if (boardMember) {
    const bm = boardMember.toLowerCase()
    const boards = new Set(investments.filter((e) => e.boardSeat && (e.partner || '').toLowerCase().includes(bm)).map((e) => e.company))
    cos = cos.filter((c) => boards.has(c.id))
  }
  const filtered = sector || minLast != null || minTotal != null || investor || boardMember
  if (filtered) {
    const keep = new Set(cos.map((c) => c.id))
    let inv = investments.filter((e) => keep.has(e.company))
    if (boardSeatsOnly) inv = inv.filter((e) => e.boardSeat)
    const firmsUsed = new Set(inv.map((e) => e.vc))
    return NextResponse.json(
      { graph: { vcs: vcs.filter((v) => firmsUsed.has(v.id)), companies: cos, investments: inv }, bios },
      { headers: CORS },
    )
  }

  return NextResponse.json({ graph: { vcs, companies, investments }, bios }, { headers: CORS })
}

function parseTotal(s: string | null): number {
  if (!s) return 0
  const m = ('' + s).replace(/[, ]/g, '').match(/([\d.]+)\s*([BMK]?)/i)
  if (!m) return 0
  const v = +m[1] || 0, u = (m[2] || '').toUpperCase()
  return v * (u === 'B' ? 1e9 : u === 'M' ? 1e6 : u === 'K' ? 1e3 : 1)
}
