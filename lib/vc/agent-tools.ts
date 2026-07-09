// Agent tools for the VC Constellation research chat (Phase 1).
// Three tools: search_internal (entity lookup across every table we own),
// run_query (the Query-page engine; snapshots exact rows to vc_result_sets so
// tables/CSV never pass through the model), classify_entity (reuses
// classifyIssuer + the person index).
//
// Grounding contract: every executor returns only data read from Supabase in
// this call, tagged with which table it came from. run_query returns a
// resultSetId + a small preview; the UI renders the snapshot directly.
import { supabaseAdmin } from '@/lib/supabase'
import { classifyIssuer, normName } from '@/lib/vc/edgar.mjs'

const sb = supabaseAdmin

// ---------- tool schemas (stable order — cached with the system prompt) ----------

export const TOOL_DEFS = [
  {
    name: 'search_internal',
    description:
      'Search the internal VC Constellation database for a specific entity by name. Covers curated companies (with investors, board seats, verified raise totals), VC firms, partners/people, the 199k-issuer SEC Form D universe, and the 209k-person Form D investor index. ALWAYS try this first before any other data source. Returns typed hits tagged with their source table; a strong curated company match includes its full profile.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Entity name or name fragment, e.g. "Anthropic" or "Peter Fenton"' },
        kind: {
          type: 'string',
          enum: ['any', 'company', 'firm', 'person'],
          description: 'Restrict to one entity kind. Default "any".',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'run_query',
    description:
      'Run a structured criteria query. The user sees the FULL result table with CSV download; you only see a truncated 15-row preview for reference — so express EVERY constraint the user asked for as a filter parameter (never subset rows yourself afterward). Two engines, picked automatically: filters on investor/boardMember/sector run against the curated graph (~172 companies, has investors + verified totals); everything else runs against the full Form D universe (199k issuers — no investor data, amounts are SEC offering amounts). Returns resultSetId, total, the interpretation used, and the preview. ALWAYS state the interpretation to the user so they can correct it. To narrow a previous result, repeat its filters plus the new constraint in ONE call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entityType: { type: 'string', enum: ['operating_company', 'vc_firm', 'person'], description: 'Universe entity-type filter; person queries the Form D investor index' },
        sector: { type: 'string', description: 'Curated sector, e.g. "AI", "Fintech" (curated engine)' },
        industry: { type: 'string', description: 'SEC Form D industry group fragment, e.g. "Computers", "Biotechnology" (universe engine)' },
        state: { type: 'string', description: 'Two-letter US state code, e.g. "CA"' },
        minLastM: { type: 'number', description: 'Minimum last round / last offering, in $ millions' },
        minTotalM: { type: 'number', description: 'Minimum total raised / total filed, in $ millions' },
        filedAfter: { type: 'string', description: 'ISO date YYYY-MM-DD — last filing / last round on or after' },
        filedBefore: { type: 'string', description: 'ISO date YYYY-MM-DD — last filing / last round on or before' },
        investor: { type: 'string', description: 'Investor firm name fragment, e.g. "Sequoia" (curated engine only)' },
        boardMember: { type: 'string', description: 'Board member name fragment (curated engine only)' },
        nameContains: { type: 'string', description: 'Company/person name fragment' },
        includePooledFunds: { type: 'boolean', description: 'Include pooled-investment-fund SPVs in universe results. Default false — they flood results.' },
        sort: { type: 'string', enum: ['amount', 'total', 'date', 'name'], description: 'Sort order. Default: date (amount sort surfaces junk mega-filings in the universe).' },
        limit: { type: 'number', description: 'Max rows to snapshot, 1-500. Default 200.' },
      },
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'classify_entity',
    description:
      'Classify an ambiguous name as operating_company, vc_firm, or person, with a confidence level and the basis for the call. Uses curated tables, the Form D investor index, and fund-name-pattern classification. Classify anything ambiguous before presenting it; if confidence is "low", say so explicitly instead of presenting the classification as fact.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'The entity name to classify' },
        context: { type: 'string', description: 'Optional context, e.g. an SEC industry group or a sentence where the name appeared' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    strict: true,
  },
]

// friendly labels for the chat status line
export const TOOL_LABELS: Record<string, string> = {
  search_internal: 'Searching the database…',
  run_query: 'Running query…',
  classify_entity: 'Classifying entity…',
}

// ---------- shared helpers ----------

const fmtAmt = (n: number | null | undefined) => {
  if (n == null || !isFinite(Number(n))) return null
  const v = Number(n)
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

const coName = (s: string) => {
  let t = normName(s || '').replace(/,/g, '')
  let prev
  do { prev = t; t = t.replace(/\s+(incorporated|inc|corp|corporation|company|llc|co|ltd|pbc|plc)$/, '').trim() } while (t !== prev)
  return t
}

// ---------- search_internal ----------

async function searchInternal(input: { query: string; kind?: string }) {
  const q = (input.query || '').trim()
  if (!q) return { error: 'query required' }
  const kind = input.kind || 'any'
  const like = `%${q}%`

  const wants = (k: string) => kind === 'any' || kind === k
  const [companies, firms, people, issuers, persons, overrides] = await Promise.all([
    wants('company') ? sb.from('vc_companies').select('id,slug,name,cik,sector,location,total_raised,last_round,last_round_amount,last_round_date').ilike('name', like).limit(5) : Promise.resolve({ data: [] as any[] }),
    wants('firm') ? sb.from('vc_firms').select('id,slug,name,kind,website').ilike('name', like).limit(5) : Promise.resolve({ data: [] as any[] }),
    wants('person') ? sb.from('vc_people').select('id,full_name,title,bio,firm_id,linkedin,x_url,profile_url,kind').ilike('full_name', like).limit(5) : Promise.resolve({ data: [] as any[] }),
    wants('company') || wants('firm') ? sb.from('vc_formd_issuers').select('cik,name,industry_group,state,entity_type,type_confidence,last_offering_amount,total_offering_amount,filing_count,last_filing_date').ilike('name', like).or('industry_group.neq.Pooled Investment Fund,industry_group.is.null').order('last_filing_date', { ascending: false, nullsFirst: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
    wants('person') ? sb.from('vc_formd_persons').select('person_key,name,filing_count,issuer_count,roles,first_seen,last_seen').ilike('name', like).order('filing_count', { ascending: false }).limit(8) : Promise.resolve({ data: [] as any[] }),
    sb.from('vc_funding_overrides').select('company_slug,verified_total_raised,last_round,source_url'),
  ])

  const ovBySlug = new Map((overrides.data || []).map((o: any) => [o.company_slug, o]))
  const out: any = { query: q, hits: [] as any[] }

  // curated company hits get the full profile (investors + board + verified raise)
  for (const c of companies.data || []) {
    const ov: any = ovBySlug.get(c.slug)
    const [inv, seats] = await Promise.all([
      sb.from('vc_investments').select('firm_id,round,amount_text,date,lead,confidence,source_url').eq('company_id', c.id).limit(50),
      sb.from('vc_board_seats').select('person_name,firm_id,role,as_of,source_kind,source_url').eq('company_id', c.id).eq('is_published', true).limit(30),
    ])
    const firmIds = [...new Set([...(inv.data || []).map((i: any) => i.firm_id), ...(seats.data || []).map((s: any) => s.firm_id)].filter(Boolean))]
    const { data: fRows } = firmIds.length ? await sb.from('vc_firms').select('id,slug,name').in('id', firmIds) : { data: [] as any[] }
    const fById = new Map((fRows || []).map((f: any) => [f.id, f]))
    out.hits.push({
      kind: 'company', source: 'curated (vc_companies)', slug: c.slug, name: c.name, sector: c.sector,
      location: c.location, cik: c.cik,
      totalRaised: ov ? fmtAmt(+ov.verified_total_raised) : c.total_raised,
      totalRaisedSource: ov ? `verified override (${ov.source_url || 'manual'})` : 'graph data / public reporting',
      formDTotalRaised: ov ? c.total_raised : undefined,
      lastRound: ov?.last_round || c.last_round,
      lastRoundAmount: fmtAmt(c.last_round_amount), lastRoundDate: c.last_round_date,
      investors: (inv.data || []).map((i: any) => ({ firm: (fById.get(i.firm_id) as any)?.name, round: i.round, amount: i.amount_text, date: i.date, lead: i.lead, confidence: i.confidence })),
      boardSeats: (seats.data || []).map((s: any) => ({ person: s.person_name, firm: (fById.get(s.firm_id) as any)?.name || null, role: s.role, since: s.as_of, source: s.source_kind })),
    })
  }
  for (const f of firms.data || []) {
    const { data: partners } = await sb.from('vc_people').select('full_name,title').eq('firm_id', f.id).limit(30)
    const { data: inv } = await sb.from('vc_investments').select('company_id').eq('firm_id', f.id).limit(1000)
    out.hits.push({
      kind: 'firm', source: 'curated (vc_firms)', slug: f.slug, name: f.name, firmKind: f.kind, website: f.website,
      partners: (partners || []).map((p: any) => p.full_name), investmentCount: (inv || []).length,
    })
  }
  for (const p of people.data || []) {
    const firm = p.firm_id ? (await sb.from('vc_firms').select('slug,name').eq('id', p.firm_id).maybeSingle()).data : null
    out.hits.push({
      kind: 'person', source: 'curated (vc_people)', name: p.full_name, title: p.title, firm: firm?.name || null,
      firmSlug: firm?.slug || null, bio: p.bio, linkedin: p.linkedin, x: p.x_url, profileUrl: p.profile_url,
    })
  }
  // universe issuers — skip ones already surfaced as curated (match by norm name)
  const curatedNames = new Set((companies.data || []).map((c: any) => coName(c.name)))
  for (const d of issuers.data || []) {
    if (curatedNames.has(coName(d.name))) continue
    out.hits.push({
      kind: d.entity_type === 'vc_firm' ? 'firm' : 'company', source: 'SEC Form D universe (vc_formd_issuers)',
      name: d.name, cik: d.cik, industry: d.industry_group, state: d.state,
      entityType: d.entity_type, typeConfidence: d.type_confidence,
      lastOffering: fmtAmt(d.last_offering_amount), totalFiled: fmtAmt(d.total_offering_amount),
      filings: d.filing_count, lastFiled: d.last_filing_date,
      note: 'Form D offering amounts undercount real raises; no investor identities in Form D.',
    })
  }
  const curatedPeople = new Set((people.data || []).map((p: any) => normName(p.full_name)))
  for (const r of persons.data || []) {
    if (curatedPeople.has(normName(r.name))) continue
    out.hits.push({
      kind: 'person', source: 'SEC Form D investor index (vc_formd_persons)',
      name: r.name, roles: r.roles || [], issuerCount: r.issuer_count, filingCount: r.filing_count,
      firstSeen: r.first_seen, lastSeen: r.last_seen,
    })
  }
  if (!out.hits.length) out.note = 'No internal hits. Say so honestly; EDGAR live lookup and web enrichment arrive in a later phase — offer the existing Query page live-lookup as a workaround.'
  return out
}

// ---------- run_query ----------

export const RESULT_COLUMNS = ['name', 'entity_type', 'sector', 'state', 'last_round', 'total_raised', 'filed_date', 'investors', 'source'] as const

type QueryInput = {
  entityType?: string; sector?: string; industry?: string; state?: string
  minLastM?: number; minTotalM?: number; filedAfter?: string; filedBefore?: string
  investor?: string; boardMember?: string; nameContains?: string
  includePooledFunds?: boolean; sort?: string; limit?: number
}

function interpret(input: QueryInput, engine: string): string {
  const parts: string[] = [`engine=${engine}`]
  if (input.entityType) parts.push(`type=${input.entityType}`)
  if (input.nameContains) parts.push(`name~"${input.nameContains}"`)
  if (input.sector) parts.push(`sector~"${input.sector}"`)
  if (input.industry) parts.push(`industry~"${input.industry}"`)
  if (input.state) parts.push(`state=${input.state.toUpperCase()}`)
  if (input.minLastM) parts.push(`last_round≥$${input.minLastM}M`)
  if (input.minTotalM) parts.push(`total≥$${input.minTotalM}M`)
  if (input.filedAfter) parts.push(`filed_after=${input.filedAfter}`)
  if (input.filedBefore) parts.push(`filed_before=${input.filedBefore}`)
  if (input.investor) parts.push(`investor~"${input.investor}"`)
  if (input.boardMember) parts.push(`board~"${input.boardMember}"`)
  if (engine === 'universe' && !input.includePooledFunds && input.entityType !== 'person') parts.push('pooled_funds=hidden')
  return parts.join(' · ')
}

async function runQuery(input: QueryInput, conversationId: string | null) {
  const limit = Math.min(Math.max(Number(input.limit) || 200, 1), 500)
  const curated = !!(input.investor || input.boardMember || input.sector)
  let rows: any[] = []
  let total = 0
  let engine = curated ? 'curated' : 'universe'

  if (input.entityType === 'person') {
    engine = 'person-index'
    let pq = sb.from('vc_formd_persons').select('name,roles,issuer_count,filing_count,first_seen,last_seen', { count: 'estimated' })
    if (input.nameContains) pq = pq.ilike('name', `%${input.nameContains}%`)
    if (input.filedAfter) pq = pq.gte('last_seen', input.filedAfter)
    if (input.filedBefore) pq = pq.lte('last_seen', input.filedBefore)
    pq = pq.order(input.sort === 'name' ? 'name' : 'filing_count', { ascending: input.sort === 'name', nullsFirst: false }).limit(limit)
    const { data, count, error } = await pq
    if (error) return { error: error.message }
    total = count || 0
    rows = (data || []).map((r: any) => ({
      name: r.name, entity_type: 'person', sector: (r.roles || []).join(', '), state: null,
      last_round: null, total_raised: null, filed_date: r.last_seen,
      investors: `${r.issuer_count} issuers / ${r.filing_count} filings`, source: 'SEC Form D',
    }))
  } else if (curated) {
    const [coR, invR, seatsR, firmsR, ovR] = await Promise.all([
      sb.from('vc_companies').select('id,slug,name,sector,location,total_raised,last_round,last_round_amount,last_round_date').limit(5000),
      sb.from('vc_investments').select('firm_id,company_id,round,amount_text,lead').limit(50000),
      sb.from('vc_board_seats').select('company_id,person_name').eq('is_published', true).limit(50000),
      sb.from('vc_firms').select('id,name').limit(10000),
      sb.from('vc_funding_overrides').select('company_slug,verified_total_raised,last_round'),
    ])
    if (coR.error) return { error: coR.error.message }
    const fById = new Map((firmsR.data || []).map((f: any) => [f.id, f.name]))
    const ovBySlug = new Map((ovR.data || []).map((o: any) => [o.company_slug, o]))
    const invByCo = new Map<string, any[]>()
    for (const iv of invR.data || []) {
      if (!invByCo.has(iv.company_id)) invByCo.set(iv.company_id, [])
      invByCo.get(iv.company_id)!.push(iv)
    }
    const boardByCo = new Map<string, string[]>()
    for (const s of seatsR.data || []) {
      if (!boardByCo.has(s.company_id)) boardByCo.set(s.company_id, [])
      boardByCo.get(s.company_id)!.push(s.person_name)
    }
    const parseTotal = (s: string | null) => {
      if (!s) return 0
      const m = ('' + s).replace(/[, ]/g, '').match(/([\d.]+)\s*([BMK]?)/i)
      if (!m) return 0
      return (+m[1] || 0) * ({ B: 1e9, M: 1e6, K: 1e3 }[(m[2] || '').toUpperCase()] || 1)
    }
    let cos = (coR.data || []).filter((c: any) => {
      const ov: any = ovBySlug.get(c.slug)
      const totalNum = ov ? Number(ov.verified_total_raised) : parseTotal(c.total_raised)
      if (input.nameContains && !c.name.toLowerCase().includes(input.nameContains.toLowerCase())) return false
      if (input.sector && !(c.sector || '').toLowerCase().includes(input.sector.toLowerCase())) return false
      if (input.state && !(c.location || '').toUpperCase().includes(input.state.toUpperCase())) return false
      if (input.minLastM && (c.last_round_amount || 0) < input.minLastM * 1e6) return false
      if (input.minTotalM && totalNum < input.minTotalM * 1e6) return false
      if (input.filedAfter && (!c.last_round_date || c.last_round_date < input.filedAfter)) return false
      if (input.filedBefore && (!c.last_round_date || c.last_round_date > input.filedBefore)) return false
      if (input.investor) {
        const iv = (invByCo.get(c.id) || []).some((i: any) => ((fById.get(i.firm_id) as string) || '').toLowerCase().includes(input.investor!.toLowerCase()))
        if (!iv) return false
      }
      if (input.boardMember) {
        const bm = (boardByCo.get(c.id) || []).some((n) => n.toLowerCase().includes(input.boardMember!.toLowerCase()))
        if (!bm) return false
      }
      return true
    })
    const sortKey = (c: any) => {
      const ov: any = ovBySlug.get(c.slug)
      if (input.sort === 'name') return c.name
      if (input.sort === 'total') return ov ? Number(ov.verified_total_raised) : parseTotal(c.total_raised)
      if (input.sort === 'amount') return c.last_round_amount || 0
      return c.last_round_date || ''
    }
    cos.sort((a: any, b: any) => (input.sort === 'name' ? String(sortKey(a)).localeCompare(String(sortKey(b))) : sortKey(b) > sortKey(a) ? 1 : -1))
    total = cos.length
    rows = cos.slice(0, limit).map((c: any) => {
      const ov: any = ovBySlug.get(c.slug)
      const invs = [...new Set((invByCo.get(c.id) || []).map((i: any) => fById.get(i.firm_id)).filter(Boolean))]
      return {
        name: c.name, entity_type: 'operating_company', sector: c.sector, state: c.location,
        last_round: [c.last_round, fmtAmt(c.last_round_amount)].filter(Boolean).join(' '),
        total_raised: ov ? `${fmtAmt(+ov.verified_total_raised)} (verified)` : c.total_raised,
        filed_date: c.last_round_date, investors: invs.join(', '),
        source: ov ? 'curated + verified override' : 'curated', slug: c.slug,
      }
    })
  } else {
    let query = sb.from('vc_formd_issuers').select('cik,name,industry_group,state,entity_type,type_confidence,last_offering_amount,total_offering_amount,filing_count,last_filing_date', { count: 'estimated' })
    if (input.entityType) query = query.eq('entity_type', input.entityType)
    if (input.nameContains) query = query.ilike('name', `%${input.nameContains}%`)
    if (input.industry) query = query.ilike('industry_group', `%${input.industry}%`)
    if (input.state) query = query.ilike('state', input.state)
    if (input.minLastM) query = query.gte('last_offering_amount', input.minLastM * 1e6)
    if (input.minTotalM) query = query.gte('total_offering_amount', input.minTotalM * 1e6)
    if (input.filedAfter) query = query.gte('last_filing_date', input.filedAfter)
    if (input.filedBefore) query = query.lte('last_filing_date', input.filedBefore)
    if (!input.includePooledFunds) query = query.or('industry_group.neq.Pooled Investment Fund,industry_group.is.null')
    const sortCol = { amount: 'last_offering_amount', total: 'total_offering_amount', name: 'name' }[input.sort || ''] || 'last_filing_date'
    query = query.order(sortCol, { ascending: input.sort === 'name', nullsFirst: false }).limit(limit)
    const { data, count, error } = await query
    if (error) return { error: error.message }
    total = count || 0
    rows = (data || []).map((d: any) => ({
      name: d.name, entity_type: d.entity_type + (d.type_confidence === 'low' ? ' (low confidence)' : ''),
      sector: d.industry_group, state: d.state,
      last_round: fmtAmt(d.last_offering_amount), total_raised: fmtAmt(d.total_offering_amount),
      filed_date: d.last_filing_date, investors: '', source: 'SEC Form D', cik: d.cik,
    }))
  }

  const interpretation = interpret(input, engine)
  const { data: rs, error: rsErr } = await sb.from('vc_result_sets').insert({
    conversation_id: conversationId, interpretation, filters: input as any,
    columns: [...RESULT_COLUMNS], rows, total,
  }).select('id').single()
  if (rsErr) return { error: `result set save failed: ${rsErr.message}` }

  return {
    resultSetId: rs.id, total, snapshotRows: rows.length, interpretation,
    engine,
    engineNote: engine === 'universe'
      ? 'Form D universe: amounts are SEC offering amounts (undercount real raises), no investor identities.'
      : engine === 'curated' ? 'Curated graph: ~172 companies with investors, board seats, and verified totals where overridden.' : 'Form D related-person investor index.',
    preview: rows.slice(0, 15),
    previewNote: 'Truncated preview for your reference ONLY — the user already sees the full table with CSV. Do not retype rows or subset them in prose; to narrow, call run_query again with tighter filters.',
  }
}

// ---------- classify_entity ----------

async function classifyEntity(input: { name: string; context?: string }) {
  const name = (input.name || '').trim()
  if (!name) return { error: 'name required' }
  const like = `%${name}%`
  const [co, firm, person, idx, issuer] = await Promise.all([
    sb.from('vc_companies').select('name,sector').ilike('name', like).limit(1).maybeSingle(),
    sb.from('vc_firms').select('name,kind').ilike('name', like).limit(1).maybeSingle(),
    sb.from('vc_people').select('full_name,title').ilike('full_name', like).limit(1).maybeSingle(),
    sb.from('vc_formd_persons').select('name,filing_count,roles').ilike('name', like).order('filing_count', { ascending: false }).limit(1).maybeSingle(),
    sb.from('vc_formd_issuers').select('name,entity_type,type_confidence,industry_group').ilike('name', like).limit(1).maybeSingle(),
  ])
  if (firm?.data) return { name, type: 'vc_firm', confidence: 'high', basis: `curated firm match: "${firm.data.name}" (${firm.data.kind})` }
  if (co?.data) return { name, type: 'operating_company', confidence: 'high', basis: `curated company match: "${co.data.name}" (${co.data.sector})` }
  if (person?.data) return { name, type: 'person', confidence: 'high', basis: `curated person match: "${person.data.full_name}"${person.data.title ? ` — ${person.data.title}` : ''}` }
  if (idx?.data) return { name, type: 'person', confidence: 'high', basis: `Form D investor index match: "${idx.data.name}" (${idx.data.filing_count} filings, roles: ${(idx.data.roles || []).join(', ')})` }
  if (issuer?.data) return { name, type: issuer.data.entity_type, confidence: issuer.data.type_confidence, basis: `Form D universe match: "${issuer.data.name}" (industry: ${issuer.data.industry_group || '—'}), pattern-classified` }
  const cls = classifyIssuer(name, input.context || '')
  return { name, type: cls.type, confidence: cls.conf === 'high' ? 'medium' : 'low', basis: 'no database match — name-pattern classification only; flag this to the user' }
}

// ---------- dispatcher ----------

export async function executeTool(name: string, input: any, conversationId: string | null): Promise<any> {
  switch (name) {
    case 'search_internal': return searchInternal(input)
    case 'run_query': return runQuery(input, conversationId)
    case 'classify_entity': return classifyEntity(input)
    default: return { error: `unknown tool: ${name}` }
  }
}
