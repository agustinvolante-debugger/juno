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
import { classifyIssuer, normName, searchFormD, fetchFilingDoc, looksLikeSpv, matchPartners, upsertUniverse, padCik } from '@/lib/vc/edgar.mjs'

const sb = supabaseAdmin

export const SECTORS = ['AI', 'Dev Tools', 'Fintech', 'Healthcare', 'Productivity', 'Consumer', 'Defense'] as const

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
  },
  {
    name: 'search_edgar',
    description:
      'Live SEC EDGAR lookup when search_internal misses. Company mode: finds the company\'s Form D, ADDS it to the graph (a new bubble on the map), records ALL filed directors as board seats (linking VC firms where a director matches a known partner), and ingests the filing. Person mode (personName): finds a person across Form D filings and adds them to the investor index. After a successful company add, ALWAYS enrich: use web_search for its funding rounds/investors and verified total, then call save_investments and save_funding_override with source URLs. Pass sector when you know the company\'s space — it places the bubble in the right cluster.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Company name to look up on EDGAR' },
        personName: { type: 'string', description: 'OR: person name to look up across Form D filings' },
        sector: { type: 'string', enum: [...SECTORS], description: 'The company\'s sector for map clustering — pass it when known' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'create_company',
    description:
      'Create a company on the map WITHOUT a Form D filing — the web-sourced fallback when search_edgar finds no aligned filing (many real startups never file, or file late). Use ONLY after search_edgar missed, and only with the legal entity name confirmed by web sources (site footer / terms of service / press / Crunchbase). Requires the source URL that confirms the legal name. The bubble carries no filed facts (no Form D directors); if a Form D appears later, search_edgar can still attach filings. After creating, ALWAYS enrich: web_search rounds/investors → save_investments + save_funding_override with sources.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Consumer/brand name, e.g. "Slash"' },
        legalName: { type: 'string', description: 'Legal entity name, e.g. "Slash Financial, Inc." — used as the graph name when given' },
        website: { type: 'string', description: 'Primary domain, e.g. slash.com' },
        sector: { type: 'string', enum: [...SECTORS], description: 'Sector for map clustering' },
        location: { type: 'string', description: 'HQ city/state if known' },
        sourceUrl: { type: 'string', description: 'REQUIRED — URL confirming the legal entity name' },
        note: { type: 'string', description: 'Short provenance note' },
      },
      required: ['name', 'sourceUrl'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_company_profile',
    description:
      'Save firmographics onto a company profile: website, one-line description, founders/CEO, founded year, headcount estimate, HQ. Use during the same web pass that finds investors — facts must come from THIS conversation\'s web results (source URL required). Only pass fields you actually verified; omissions are fine.',
    input_schema: {
      type: 'object' as const,
      properties: {
        companySlug: { type: 'string', description: 'Graph slug (from search_internal / search_edgar / create_company)' },
        website: { type: 'string', description: 'Primary domain, e.g. slash.com' },
        description: { type: 'string', description: 'One line, ≤160 chars, what the company does' },
        founders: { type: 'string', description: 'Founders/CEO as display text, e.g. "Victor Cardenas (CEO), Kevin Bai"' },
        foundedYear: { type: 'number', description: 'Year founded, e.g. 2021' },
        headcountText: { type: 'string', description: 'Estimate as text, e.g. "~50-100 (LinkedIn est.)"' },
        hq: { type: 'string', description: 'HQ city/state, e.g. "San Francisco, CA"' },
        sourceUrl: { type: 'string', description: 'REQUIRED — where these facts came from' },
      },
      required: ['companySlug', 'sourceUrl'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_investments',
    description:
      'Write web-researched investors/funding rounds into the curated graph so they appear on the map as edges. Use ONLY for facts you just found via web_search — every entry needs the source URL you got it from. Firms are created/linked by name. Sets confidence honestly: "high" for company/investor press releases, "medium" for reputable coverage, "low" for secondhand mentions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        companySlug: { type: 'string', description: 'Graph slug of the company (from search_internal or search_edgar)' },
        investments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              firmName: { type: 'string', description: 'Investor firm name, e.g. "Sequoia Capital"' },
              round: { type: 'string', description: 'e.g. "Series B"' },
              amountText: { type: 'string', description: 'Round size as text, e.g. "$6B" (the full round, not per-investor)' },
              date: { type: 'string', description: 'YYYY-MM' },
              lead: { type: 'boolean', description: 'true if this firm led the round' },
              sourceUrl: { type: 'string', description: 'REQUIRED — where this fact came from' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['firmName', 'sourceUrl', 'confidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['companySlug', 'investments'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_funding_override',
    description:
      'Write a verified total-raised figure into the funding truth layer (shown with a ✓ verified badge; the Form D figure stays visible as "per SEC filings"). Use for web-verified totals that Form D undercounts. Requires the source URL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        companySlug: { type: 'string' },
        verifiedTotalRaisedUsd: { type: 'number', description: 'Total raised in DOLLARS, e.g. 161000000000 for $161B' },
        lastRound: { type: 'string', description: 'e.g. "Series H"' },
        sourceUrl: { type: 'string', description: 'REQUIRED' },
        note: { type: 'string', description: 'Short provenance note' },
      },
      required: ['companySlug', 'verifiedTotalRaisedUsd', 'sourceUrl'],
      additionalProperties: false,
    },
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
  },
]

// friendly labels for the chat status line
export const TOOL_LABELS: Record<string, string> = {
  search_internal: 'Searching the database…',
  run_query: 'Running query…',
  classify_entity: 'Classifying entity…',
  search_edgar: 'Fetching from SEC EDGAR…',
  create_company: 'Adding to the map…',
  save_company_profile: 'Saving company profile…',
  save_investments: 'Saving investors to the graph…',
  save_funding_override: 'Recording verified total…',
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
  if (!out.hits.length) out.note = 'No internal hits. For a company or person, try search_edgar next (live SEC lookup + ingest). Only report "not found" after EDGAR also misses.'
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

// ---------- search_edgar (live ingest — Flow A) ----------

function mapSector(industryGroup: string | null): string {
  const ig = industryGroup || ''
  if (/biotech|health|pharma|medical/i.test(ig)) return 'Healthcare'
  if (/bank|insur|invest|financ|lending/i.test(ig)) return 'Fintech'
  if (/aerospace|defense/i.test(ig)) return 'Defense'
  if (/retail|restaurant|travel|lodging|consumer/i.test(ig)) return 'Consumer'
  if (/comput|telecom|technology|electronic/i.test(ig)) return 'Dev Tools'
  return 'Productivity'
}

async function searchEdgarPerson(personName: string) {
  const nq = normName(personName)
  const hits = await searchFormD(personName, { limit: 8 })
  const issuers: any[] = []
  const roles = new Set<string>()
  let filings = 0, first: string | null = null, last: string | null = null, display = personName
  for (const h of hits) {
    if (!h.cik) continue
    const doc: any = await fetchFilingDoc(h.accession, h.primaryDoc, h.cik)
    if (!doc) continue
    const match = (doc.relatedPersons || []).find((p: any) => {
      const pk = normName(p.name)
      return pk === nq || pk.includes(nq) || nq.includes(pk)
    })
    if (!match) continue
    filings++
    display = match.name
    ;(match.relationships || []).forEach((r: string) => roles.add(r))
    if (h.date) { if (!first || h.date < first) first = h.date; if (!last || h.date > last) last = h.date }
    issuers.push({ cik: padCik(h.cik), name: doc.issuerName, date: h.date || null, roles: match.relationships || [] })
  }
  if (!filings) return { found: false, note: 'No Form D related-person record on EDGAR for this name.' }
  const key = normName(display)
  const { data: ex } = await sb.from('vc_formd_persons').select('*').eq('person_key', key).maybeSingle()
  await sb.from('vc_formd_persons').upsert({
    person_key: key, name: display,
    filing_count: Math.max(ex?.filing_count || 0, filings),
    issuer_count: Math.max(ex?.issuer_count || 0, new Set(issuers.map((i) => i.cik)).size),
    roles: [...new Set([...(ex?.roles || []), ...roles])].slice(0, 8),
    first_seen: ex?.first_seen && (!first || ex.first_seen < first) ? ex.first_seen : first,
    last_seen: ex?.last_seen && (!last || ex.last_seen > last) ? ex.last_seen : last,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'person_key' })
  return { found: true, person: { name: display, roles: [...roles], filingCount: filings, issuers }, source: 'SEC EDGAR live', note: 'Added to the investor index.' }
}

async function searchEdgar(input: { name?: string; personName?: string; sector?: string }) {
  if (input.personName) return searchEdgarPerson(input.personName)
  const name = (input.name || '').trim()
  if (!name) return { error: 'name or personName required' }

  const hits = await searchFormD(name, { limit: 8 })
  const nq = normName(name)
  let doc: any = null, hit: any = null
  for (const h of hits) {
    const d: any = await fetchFilingDoc(h.accession, h.primaryDoc, h.cik)
    if (!d) continue
    const ni = normName(d.issuerName || '')
    const aligned = ni && (ni === nq || ni.startsWith(nq) || nq.startsWith(ni))
    if (aligned && !looksLikeSpv(d)) { doc = d; hit = h; break }
  }
  if (!doc) return { found: false, note: 'No aligned Form D on EDGAR (SPV-only mentions excluded). The company may not have filed, or files under a different legal name.' }

  // company node — never clobber existing curated data, only fill gaps
  const slug = hit.cik ? `cik-${hit.cik}` : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  const sector = (SECTORS as readonly string[]).includes(input.sector || '') ? input.sector! : mapSector(doc.industryGroup)
  let { data: co } = await sb.from('vc_companies').select('id,slug,name,sector,cik').eq('slug', slug).maybeSingle()
  if (!co) {
    const byName = await sb.from('vc_companies').select('id,slug,name,sector,cik').eq('cik', hit.cik ? String(hit.cik) : '__none__').maybeSingle()
    co = byName.data || null
  }
  if (co) {
    await sb.from('vc_companies').update({
      cik: co.cik || hit.cik || null,
      sector: co.sector || sector,
    }).eq('id', co.id)
  } else {
    const ins = await sb.from('vc_companies').insert({ slug, name: doc.issuerName || name, cik: hit.cik || null, sector }).select('id,slug,name,sector,cik').single()
    if (ins.error) return { error: `company insert failed: ${ins.error.message}` }
    co = ins.data
  }

  const { data: fil } = await sb.from('vc_filings').upsert({
    accession: hit.accession, form_type: 'D', cik: hit.cik, issuer_name: doc.issuerName,
    filing_date: hit.date, offering_amount: doc.offeringAmount, industry_group: doc.industryGroup, url: doc.url,
  }, { onConflict: 'accession' }).select('id').single()

  // known partners → linked VC board seats; everyone else kept as an unlinked director
  const { data: firms } = await sb.from('vc_firms').select('id,slug,name')
  const firmById = new Map((firms || []).map((f: any) => [f.id, f]))
  const { data: ppl } = await sb.from('vc_people').select('id,full_name,firm_id').eq('kind', 'partner')
  const known = new Map<string, any[]>()
  for (const p of ppl || []) {
    if (!p.firm_id) continue
    const k = normName(p.full_name)
    if (!known.has(k)) known.set(k, [])
    known.get(k)!.push({ person_id: p.id, firm_id: p.firm_id, name: p.full_name })
  }
  const matches = matchPartners(doc.relatedPersons, known).filter((m: any) => m.isDirector)
  const matchedNames = new Set(matches.map((m: any) => normName(m.name)))
  const boardMembers: any[] = []
  for (const m of matches) {
    await sb.from('vc_board_seats').upsert({
      person_id: m.person_id, company_id: co!.id, firm_id: m.firm_id, person_name: m.name,
      role: 'Director', as_of: hit.date, confidence: 'medium', source_kind: 'formd',
      source_text: `SEC Form D ${hit.accession}`, source_url: doc.url, filing_id: (fil as any)?.id || null, is_published: true,
    }, { onConflict: 'person_name,company_id,firm_id' })
    boardMembers.push({ name: m.name, role: 'Director', linkedFirm: (firmById.get(m.firm_id) as any)?.name || null })
  }
  for (const rp of doc.relatedPersons || []) {
    const isDir = (rp.relationships || []).some((r: string) => /director/i.test(r))
    if (!isDir || matchedNames.has(normName(rp.name))) continue
    const { data: dup } = await sb.from('vc_board_seats').select('id').eq('company_id', co!.id).eq('person_name', rp.name).is('firm_id', null).maybeSingle()
    if (!dup) {
      await sb.from('vc_board_seats').insert({
        company_id: co!.id, firm_id: null, person_name: rp.name,
        role: (rp.relationships || []).join(', ') || 'Director', as_of: hit.date, confidence: 'high', source_kind: 'formd',
        source_text: `SEC Form D ${hit.accession}`, source_url: doc.url, filing_id: (fil as any)?.id || null, is_published: true,
      })
    }
    boardMembers.push({ name: rp.name, role: (rp.relationships || []).join(', '), linkedFirm: null })
  }

  if (hit.cik) {
    const { data: uni } = await sb.from('vc_formd_issuers').select('cik,last_filing_date').eq('cik', padCik(hit.cik)).maybeSingle()
    if (!uni || (hit.date && (!uni.last_filing_date || hit.date > uni.last_filing_date))) await upsertUniverse(sb, hit.cik, doc, hit.date)
  }
  await sb.from('vc_sync_log').insert({ source: 'chat', filings_processed: 1, new_board_seats: boardMembers.length, notes: `chat ingest: ${name} -> ${doc.issuerName}` })

  return {
    found: true, addedToGraph: true,
    company: { slug: co!.slug, name: co!.name, sector: co!.sector || sector, cik: hit.cik || null },
    filing: { date: hit.date, offeringAmount: doc.offeringAmount, industry: doc.industryGroup, url: doc.url },
    boardMembers,
    note: 'Company added to the graph (its bubble appears on next load). Board members above are FILED FACT from Form D. Form D does NOT name investors — now web_search its funding rounds and investors, then call save_investments (and save_funding_override for a verified total), citing source URLs.',
  }
}

// ---------- save_investments / save_funding_override (web-enrichment write path) ----------

// Web-sourced company creation: the fallback when a real company simply has no Form D.
// slug is 'web-…' so provenance is visible in the data; a later search_edgar hit for the
// same company will match by normalized name and attach filings as usual.
async function createCompany(input: { name: string; legalName?: string; website?: string; sector?: string; location?: string; sourceUrl: string; note?: string }) {
  const display = (input.legalName || input.name || '').trim().slice(0, 120)
  if (!display) return { error: 'name required' }
  if (!input.sourceUrl || !/^https?:\/\//.test(input.sourceUrl)) return { error: 'sourceUrl (http/https) required — it must confirm the legal entity name' }
  const { data: existing } = await sb.from('vc_companies').select('slug,name')
  const hit = (existing || []).find((c: any) => {
    const n = normName(c.name)
    return n === normName(display) || (input.name && n === normName(input.name))
  })
  if (hit) return { exists: true, company: { slug: hit.slug, name: hit.name }, note: 'Already on the map — enrich it instead of re-creating.' }
  const slug = 'web-' + display.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56)
  const sector = input.sector && (SECTORS as readonly string[]).includes(input.sector) ? input.sector : null
  const { data: co, error } = await sb.from('vc_companies')
    .upsert({ slug, name: display, cik: null, sector, location: input.location?.slice(0, 80) || null }, { onConflict: 'slug' })
    .select('slug,name').single()
  if (error) return { error: error.message }
  await sb.from('vc_sync_log').insert({
    source: 'chat', filings_processed: 0,
    notes: `create_company (web-sourced, no Form D): ${display}${input.website ? ` · ${input.website}` : ''} · ${input.sourceUrl}${input.note ? ` · ${input.note}` : ''}`,
  })
  return {
    created: true, company: { slug: co.slug, name: co.name },
    note: 'Web-sourced bubble created (no filed facts). Now enrich: save_investments + save_funding_override with source URLs.',
  }
}

// Firmographics onto vc_companies (migration 012 columns). Fails with a clear message
// until the migration is applied.
async function saveCompanyProfile(input: { companySlug: string; website?: string; description?: string; founders?: string; foundedYear?: number; headcountText?: string; hq?: string; sourceUrl: string }) {
  if (!input.sourceUrl || !/^https?:\/\//.test(input.sourceUrl)) return { error: 'sourceUrl (http/https) required' }
  const { data: co } = await sb.from('vc_companies').select('id,slug,name').eq('slug', input.companySlug).maybeSingle()
  if (!co) return { error: `no company with slug "${input.companySlug}"` }
  const patch: Record<string, any> = { profile_source_url: input.sourceUrl.slice(0, 300), profile_updated_at: new Date().toISOString() }
  if (input.website) patch.website = input.website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 120)
  if (input.description) patch.description = input.description.slice(0, 200)
  if (input.founders) patch.founders = input.founders.slice(0, 200)
  if (input.foundedYear && input.foundedYear > 1900 && input.foundedYear < 2100) patch.founded_year = Math.round(input.foundedYear)
  if (input.headcountText) patch.headcount = input.headcountText.slice(0, 60)
  if (input.hq) patch.location = input.hq.slice(0, 80)
  const { error } = await sb.from('vc_companies').update(patch).eq('id', co.id)
  if (error) {
    if (/column/.test(error.message)) return { error: 'profile columns missing — apply supabase/migrations/012_vc_company_profile.sql first' }
    return { error: error.message }
  }
  return { ok: true, company: co.name, saved: Object.keys(patch).filter((k) => !k.startsWith('profile_')) }
}

async function saveInvestments(input: { companySlug: string; investments: any[] }) {
  const { data: co } = await sb.from('vc_companies').select('id,slug,name').eq('slug', input.companySlug).maybeSingle()
  if (!co) return { error: `no company with slug "${input.companySlug}" — use the slug from search_internal/search_edgar` }
  const items = (input.investments || []).slice(0, 20)
  let created = 0, skipped = 0
  const results: any[] = []
  for (const iv of items) {
    if (!iv.firmName || !iv.sourceUrl) { skipped++; results.push({ firm: iv.firmName, status: 'skipped: firmName and sourceUrl required' }); continue }
    const fslug = iv.firmName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40)
    let { data: firm } = await sb.from('vc_firms').select('id,slug,name').eq('slug', fslug).maybeSingle()
    if (!firm) {
      const byName = await sb.from('vc_firms').select('id,slug,name').ilike('name', iv.firmName).limit(1).maybeSingle()
      firm = byName.data || null
    }
    if (!firm) {
      const ins = await sb.from('vc_firms').insert({ slug: fslug, name: iv.firmName, kind: 'vc' }).select('id,slug,name').single()
      if (ins.error) { skipped++; results.push({ firm: iv.firmName, status: `firm insert failed: ${ins.error.message}` }); continue }
      firm = ins.data
    }
    const { data: dup } = await sb.from('vc_investments').select('id').eq('firm_id', firm.id).eq('company_id', co.id).eq('round', iv.round || null).maybeSingle()
    if (dup) { skipped++; results.push({ firm: firm.name, status: 'already recorded' }); continue }
    const m = ('' + (iv.amountText || '')).replace(/[, ]/g, '').match(/([\d.]+)\s*([BMK]?)/i)
    const amountNum = m ? (+m[1] || 0) * ({ B: 1e9, M: 1e6, K: 1e3 }[(m[2] || '').toUpperCase()] || 1) : null
    const { error } = await sb.from('vc_investments').insert({
      firm_id: firm.id, company_id: co.id, round: iv.round || null, amount_text: iv.amountText || null,
      amount_num: amountNum, date: iv.date || null, lead: !!iv.lead,
      confidence: ['high', 'medium', 'low'].includes(iv.confidence) ? iv.confidence : 'low',
      source_text: 'added via chat (web-sourced)', source_url: iv.sourceUrl,
    })
    if (error) { skipped++; results.push({ firm: firm.name, status: `failed: ${error.message}` }) }
    else { created++; results.push({ firm: firm.name, status: 'saved' }) }
  }
  await sb.from('vc_sync_log').insert({ source: 'chat', filings_processed: 0, notes: `chat enrichment: ${created} investments for ${co.name}` })
  return { company: co.name, created, skipped, results, note: 'Edges appear on the map on next load. Low/medium-confidence entries are flagged in the UI as usual.' }
}

async function saveFundingOverride(input: { companySlug: string; verifiedTotalRaisedUsd: number; lastRound?: string; sourceUrl: string; note?: string }) {
  if (!input.sourceUrl) return { error: 'sourceUrl required — never write an unsourced verified total' }
  const amt = Number(input.verifiedTotalRaisedUsd)
  if (!isFinite(amt) || amt <= 0) return { error: 'verifiedTotalRaisedUsd must be a positive dollar amount' }
  const { data: co } = await sb.from('vc_companies').select('slug,name,cik').eq('slug', input.companySlug).maybeSingle()
  if (!co) return { error: `no company with slug "${input.companySlug}"` }
  const { error } = await sb.from('vc_funding_overrides').upsert({
    company_slug: co.slug, cik: co.cik || null, verified_total_raised: amt,
    last_round: input.lastRound || null, source_url: input.sourceUrl,
    note: input.note || 'added via chat (web-verified)', updated_at: new Date().toISOString(),
  }, { onConflict: 'company_slug' })
  if (error) return { error: error.message }
  return { saved: true, company: co.name, verifiedTotal: fmtAmt(amt), source: input.sourceUrl }
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
    case 'search_edgar': return searchEdgar(input)
    case 'create_company': return createCompany(input)
    case 'save_company_profile': return saveCompanyProfile(input)
    case 'save_investments': return saveInvestments(input)
    case 'save_funding_override': return saveFundingOverride(input)
    default: return { error: `unknown tool: ${name}` }
  }
}

// Staged variant for the unattended enrichment loop: web-sourced writes land in
// vc_enrich_queue (pending review) instead of the live graph. Filed-fact tools
// (search_edgar → company node + Form D directors) still run live, same as chat.
export async function executeToolStaged(name: string, input: any, runNote: string): Promise<any> {
  const displayName = async (slug: string) => {
    const { data } = await sb.from('vc_companies').select('name').eq('slug', slug).maybeSingle()
    return data?.name || slug
  }
  if (name === 'save_investments') {
    const items = (input.investments || []).filter((iv: any) => iv.firmName && iv.sourceUrl).slice(0, 20)
    if (!items.length) return { error: 'no valid investments (firmName + sourceUrl required)' }
    const coName = await displayName(input.companySlug)
    const rows = items.map((iv: any) => ({
      company_slug: input.companySlug, company_name: coName, kind: 'investment',
      payload: { companySlug: input.companySlug, investments: [iv] },
      confidence: iv.confidence || 'low', source_url: iv.sourceUrl, run_note: runNote,
    }))
    const { error } = await sb.from('vc_enrich_queue').insert(rows)
    if (error) return { error: error.message }
    return { queued: rows.length, note: 'Staged for review — these will appear on the map once approved.' }
  }
  if (name === 'save_funding_override') {
    if (!input.sourceUrl) return { error: 'sourceUrl required' }
    const { error } = await sb.from('vc_enrich_queue').insert({
      company_slug: input.companySlug, company_name: await displayName(input.companySlug), kind: 'override',
      payload: input, confidence: 'high', source_url: input.sourceUrl, run_note: runNote,
    })
    if (error) return { error: error.message }
    return { queued: 1, note: 'Verified total staged for review.' }
  }
  if (name === 'save_company_profile') {
    if (!input.sourceUrl) return { error: 'sourceUrl required' }
    const { error } = await sb.from('vc_enrich_queue').insert({
      company_slug: input.companySlug, company_name: await displayName(input.companySlug), kind: 'profile',
      payload: input, confidence: 'high', source_url: input.sourceUrl, run_note: runNote,
    })
    if (error) return { error: error.message }
    return { queued: 1, note: 'Profile facts staged for review.' }
  }
  return executeTool(name, input, null)
}

// apply an approved queue row to the live graph (used by the review endpoint)
export async function applyQueued(row: { kind: string; payload: any }): Promise<any> {
  if (row.kind === 'investment') return saveInvestments(row.payload)
  if (row.kind === 'override') return saveFundingOverride(row.payload)
  if (row.kind === 'profile') return saveCompanyProfile(row.payload)
  return { error: `unknown kind ${row.kind}` }
}
