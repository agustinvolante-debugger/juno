// Shared SEC EDGAR Form D logic for the VC Constellation.
// Used by the on-demand lookup route, the daily-sync route, and the backfill script.
// SEC rules: send a descriptive User-Agent and stay <=10 req/s. We throttle to ~8/s + retry.
//
// Env: EDGAR_UA (e.g. "Chaska Volante chaska@caerusai.com"). Falls back to a generic UA.

const UA = process.env.EDGAR_UA || 'VC Constellation research chaska@caerusai.com';
const MIN_INTERVAL_MS = 130; // ~7.7 req/s, under SEC's 10/s cap
let lastReq = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, lastReq + MIN_INTERVAL_MS - now);
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastReq = Date.now();
}

async function secGet(url, { accept = 'application/json', tries = 3 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null; // 404 etc. — no filing
      return accept.includes('json') ? await res.json() : await res.text();
    } catch (e) {
      if (attempt === tries) throw e;
      await new Promise((r) => setTimeout(r, 400 * attempt * attempt)); // backoff
    }
  }
  return null;
}

// ---- name normalization + matching ----
export function normName(s) {
  return (s || '').toLowerCase().replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim();
}

// knownPartners: Map<normName, {personId, firmId, firmSlug, name}[]>
export function matchPartners(relatedPersons, knownPartners) {
  const out = [];
  for (const rp of relatedPersons) {
    const hits = knownPartners.get(normName(rp.name));
    if (!hits) continue;
    const isDirector = rp.relationships.some((r) => /director/i.test(r));
    for (const h of hits) out.push({ ...h, role: isDirector ? 'Director' : rp.relationships[0] || 'Related Person', isDirector });
  }
  return out;
}

// ---- full-text search (on-demand lookup) ----
export async function searchFormD(companyName, { limit = 5 } = {}) {
  const q = encodeURIComponent(`"${companyName}"`);
  const data = await secGet(`https://efts.sec.gov/LATEST/search-index?q=${q}&forms=D`);
  const hits = data?.hits?.hits || [];
  return hits.slice(0, limit).map((h) => {
    const src = h._source || {};
    return {
      accession: (h._id || '').split(':')[0],
      primaryDoc: (h._id || '').split(':')[1],
      cik: src.cik || (src.ciks || [])[0] || null,
      date: src.file_date || null,
      names: src.display_names || [],
    };
  });
}

// ---- parse a Form D primary_doc.xml ----
export function parseFormDXml(xml) {
  const pick = (tag) => (xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`)) || [])[1]?.trim() || null;
  const issuerName = (xml.match(/<entityName>([^<]+)<\/entityName>/) || [])[1]?.trim() || null;
  const industryGroup = pick('industryGroupType');
  const offeringAmount = (() => {
    const v = pick('totalOfferingAmount');
    if (!v || /indefinite/i.test(v)) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })();
  const state = (xml.match(/<issuerAddress>[\s\S]*?<stateOrCountry>([^<]+)<\/stateOrCountry>/) || [])[1]?.trim() || null;
  const revenueRange = pick('revenueRange');
  const relatedPersons = [];
  const blocks = xml.match(/<relatedPersonInfo>[\s\S]*?<\/relatedPersonInfo>/g) || [];
  for (const b of blocks) {
    const first = (b.match(/<firstName>([^<]*)<\/firstName>/) || [])[1]?.trim() || '';
    const last = (b.match(/<lastName>([^<]*)<\/lastName>/) || [])[1]?.trim() || '';
    const name = `${first} ${last}`.trim();
    const relationships = [...b.matchAll(/<relationship>([^<]+)<\/relationship>/g)].map((m) => m[1].trim());
    if (name) relatedPersons.push({ name, relationships });
  }
  return { issuerName, industryGroup, offeringAmount, state, revenueRange, relatedPersons };
}

// ---- Form D universe (vc_formd_issuers) ----
export const padCik = (cik) => String(parseInt(cik || '0', 10)).padStart(10, '0');
// Merge one freshly-parsed filing into the deduped-per-CIK universe row.
export async function upsertUniverse(sb, cik, doc, filingDate) {
  if (!cik || !doc?.issuerName) return;
  const id = padCik(cik);
  const { data: ex } = await sb.from('vc_formd_issuers').select('*').eq('cik', id).maybeSingle();
  const dt = filingDate || null;
  const isNewer = !ex?.last_filing_date || (dt && dt >= ex.last_filing_date);
  const row = {
    cik: id,
    name: isNewer ? doc.issuerName : ex.name,
    norm_name: normName(isNewer ? doc.issuerName : ex.name),
    industry_group: isNewer ? (doc.industryGroup || ex?.industry_group || null) : ex.industry_group,
    state: isNewer ? (doc.state || ex?.state || null) : ex.state,
    first_filing_date: ex?.first_filing_date && (!dt || ex.first_filing_date <= dt) ? ex.first_filing_date : dt,
    last_filing_date: isNewer ? dt : ex.last_filing_date,
    last_offering_amount: isNewer ? (doc.offeringAmount ?? null) : ex.last_offering_amount,
    total_offering_amount: (Number(ex?.total_offering_amount) || 0) + (doc.offeringAmount || 0) || null,
    filing_count: (ex?.filing_count || 0) + 1,
    revenue_range: isNewer ? (doc.revenueRange || ex?.revenue_range || null) : ex.revenue_range,
    updated_at: new Date().toISOString(),
  };
  await sb.from('vc_formd_issuers').upsert(row, { onConflict: 'cik' });
}

const SPV_RE = /pooled investment fund|,?\s*(a )?series of|\bSPV\b|feeder|fund [ivx]+\b|-i,? llc|gaingels|angellist|\bassure\b|syndicate|special purpose/i;
export function looksLikeSpv({ issuerName, industryGroup }) {
  if (industryGroup && /pooled investment fund/i.test(industryGroup)) return true;
  if (issuerName && SPV_RE.test(issuerName)) return true;
  return false;
}

export async function fetchFilingDoc(accession, primaryDoc, cik) {
  if (!accession || !cik) return null;
  const accNoDash = accession.replace(/-/g, '');
  const cikInt = String(parseInt(cik, 10));
  const doc = primaryDoc || 'primary_doc.xml';
  const url = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/${doc}`;
  const xml = await secGet(url, { accept: 'application/xml' });
  if (!xml) return null;
  return { url, ...parseFormDXml(xml) };
}

export function filingUrl(accession, primaryDoc, cik) {
  const accNoDash = (accession || '').replace(/-/g, '');
  const cikInt = String(parseInt(cik || '0', 10));
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/${primaryDoc || 'primary_doc.xml'}`;
}

// ---- daily index (for the scheduled sync): list D / D/A accessions for a date ----
// date = 'YYYY-MM-DD'. Uses the crawler daily-index; returns [{accession, cik, formType}].
export async function dailyFormD(date) {
  const [y, m, d] = date.split('-');
  const q = (m <= '03' ? 'QTR1' : m <= '06' ? 'QTR2' : m <= '09' ? 'QTR3' : 'QTR4');
  const url = `https://www.sec.gov/Archives/edgar/daily-index/${y}/${q}/form.${y}${m}${d}.idx`;
  const txt = await secGet(url, { accept: 'text/plain' });
  if (!txt) return [];
  const out = [];
  for (const line of txt.split('\n')) {
    if (!/^\s*(D|D\/A)\s/.test(line)) continue; // form-type column
    const parts = line.trim().split(/\s{2,}/);
    // columns: Form Type | Company Name | CIK | Date Filed | File Name
    const formType = parts[0];
    const cik = parts[2];
    const fileName = parts[parts.length - 1] || '';
    const acc = (fileName.match(/(\d{10}-\d{2}-\d{6})/) || [])[1];
    if (acc && (formType === 'D' || formType === 'D/A')) out.push({ accession: acc, cik, formType });
  }
  return out;
}
