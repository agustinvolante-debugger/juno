// Backfill historical Form D board seats from SEC quarterly structured datasets.
// Downloads {quarter}_d.zip, parses ISSUERS / OFFERING / RELATEDPERSONS, matches
// related persons against known VC partners (vc_people), and upserts inferred board
// seats (source_kind='formd') + companies + filing refs.
//
//   node scripts/vc-backfill.mjs 2025q3 --dry   # parse + match + counts, no DB writes
//   node scripts/vc-backfill.mjs 2025q3         # upsert into Supabase
//
// Env: EDGAR_UA (SEC contact), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normName, matchPartners, looksLikeSpv } from '../lib/vc/edgar.mjs';

const quarter = (process.argv[2] || '').toLowerCase();
const DRY = process.argv.includes('--dry');
if (!/^\d{4}q[1-4]$/.test(quarter)) { console.error('usage: vc-backfill.mjs <YYYYqN> [--dry]'); process.exit(1); }

// env
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const UA = process.env.EDGAR_UA || 'VC Constellation research chaska@caerusai.com';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---- download + unzip the quarter dataset ----
let dir = `/tmp/formd_${quarter}`;
const zip = `/tmp/formd_${quarter}.zip`;
const url = `https://www.sec.gov/files/structureddata/data/form-d-data-sets/${quarter}_d.zip`;
if (!existsSync(dir)) {
  console.log('downloading', url);
  execSync(`curl -sL -A "${UA}" -o "${zip}" "${url}"`, { stdio: 'inherit' });
  execSync(`mkdir -p "${dir}" && unzip -o -q "${zip}" -d "${dir}"`, { stdio: 'inherit' });
}
let files = readdirSync(dir);
if (!files.some((f) => /RELATEDPERSON/i.test(f))) { // zip extracted into a nested subfolder
  const subdir = files.find((f) => { try { return statSync(`${dir}/${f}`).isDirectory(); } catch { return false; } });
  if (subdir) { dir = `${dir}/${subdir}`; files = readdirSync(dir); }
}
const find = (re) => files.find((f) => re.test(f));

// ---- flexible TSV reader (headers vary slightly across dataset vintages) ----
function readTsv(fname) {
  const path = `${dir}/${fname}`;
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const head = lines[0].split('\t').map((h) => h.trim().toUpperCase());
  const col = (want) => head.findIndex((h) => h.includes(want));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    rows.push(lines[i].split('\t'));
  }
  return { head, col, rows };
}

const subF = find(/FORMDSUBMISSION/i);
const issF = find(/ISSUERS?/i);
const offF = find(/OFFERING/i);
const relF = find(/RELATEDPERSON/i);
if (!issF || !relF) { console.error('missing expected TSVs in', dir, files); process.exit(1); }

// submissions: accession -> {formType, date}
const sub = readTsv(subF);
const iAcc = sub.col('ACCESSIONNUMBER'), iType = sub.col('SUBMISSIONTYPE'), iDate = Math.max(sub.col('FILING_DATE'), sub.col('FILINGDATE'));
const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
function toIso(d) {
  if (!d) return null;
  const m = d.match(/^(\d{2})-([A-Z]{3})-(\d{4})/i);
  if (m) return `${m[3]}-${MONTHS[m[2].toUpperCase()] || '01'}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}
const submission = new Map();
for (const r of sub.rows) submission.set(r[iAcc], { formType: r[iType] || 'D', date: toIso((r[iDate] || '').trim()) });

// issuers: accession -> {name, cik}
const iss = readTsv(issF);
const jAcc = iss.col('ACCESSIONNUMBER'), jName = iss.col('ENTITYNAME'), jCik = iss.col('CIK');
const issuer = new Map();
for (const r of iss.rows) if (!issuer.has(r[jAcc])) issuer.set(r[jAcc], { name: r[jName], cik: r[jCik] });

// offering: accession -> {industry, amount}
const offering = new Map();
if (offF) {
  const off = readTsv(offF);
  const oAcc = off.col('ACCESSIONNUMBER'), oInd = off.col('INDUSTRYGROUPTYPE'), oAmt = off.col('TOTALOFFERINGAMOUNT');
  for (const r of off.rows) offering.set(r[oAcc], { industry: r[oInd] || null, amount: Number(r[oAmt]) || null });
}

// related persons: accession -> [{name, relationships[]}] (group multi-relationship rows)
const rel = readTsv(relF);
const rAcc = rel.col('ACCESSIONNUMBER'), rFirst = rel.col('FIRSTNAME'), rLast = rel.col('LASTNAME'), rRel = rel.col('RELATIONSHIP');
const personsByAcc = new Map();
for (const r of rel.rows) {
  const acc = r[rAcc]; if (!acc) continue;
  const name = `${(r[rFirst] || '').trim()} ${(r[rLast] || '').trim()}`.trim();
  if (!name) continue;
  const relationship = (r[rRel] || '').trim();
  const arr = personsByAcc.get(acc) || [];
  let p = arr.find((x) => x.name === name);
  if (!p) { p = { name, relationships: [] }; arr.push(p); }
  if (relationship) p.relationships.push(relationship);
  personsByAcc.set(acc, arr);
}

console.log(`parsed ${quarter}: ${submission.size} submissions, ${issuer.size} issuers, ${personsByAcc.size} filings-with-persons`);

// ---- known partners from Supabase (norm_name -> [{firm_id, firmSlug, person_id, name}]) ----
const { data: firms } = await sb.from('vc_firms').select('id,slug');
const firmSlugById = new Map((firms || []).map((f) => [f.id, f.slug]));
const { data: ppl } = await sb.from('vc_people').select('id,full_name,firm_id').eq('kind', 'partner');
const known = new Map();
for (const p of ppl || []) {
  if (!p.firm_id) continue;
  const k = normName(p.full_name);
  (known.get(k) || known.set(k, []).get(k)).push({ person_id: p.id, firm_id: p.firm_id, firmSlug: firmSlugById.get(p.firm_id), name: p.full_name });
}

// ---- match ----
let matched = 0, skippedSpv = 0, candidates = [];
for (const [acc, persons] of personsByAcc) {
  const iss2 = issuer.get(acc); if (!iss2) continue;
  const off = offering.get(acc) || {};
  if (looksLikeSpv({ issuerName: iss2.name, industryGroup: off.industry })) { skippedSpv++; continue; }
  const hits = matchPartners(persons, known).filter((h) => h.isDirector);
  for (const h of hits) {
    matched++;
    candidates.push({ acc, issuerName: iss2.name, cik: iss2.cik, industry: off.industry, amount: off.amount,
      date: submission.get(acc)?.date || null, formType: submission.get(acc)?.formType || 'D',
      person_id: h.person_id, firm_id: h.firm_id, firmSlug: h.firmSlug, personName: h.name });
  }
}
console.log(`matched ${matched} director board-seats across ${new Set(candidates.map((c) => c.acc)).size} filings; skipped ${skippedSpv} pooled/SPV issuers`);

if (DRY) {
  console.log('\nsample matches:');
  candidates.slice(0, 12).forEach((c) => console.log(`  ${c.personName} (${c.firmSlug}) -> ${c.issuerName}  [${c.industry || '?'}]  ${c.date}`));
  process.exit(0);
}

// ---- upsert: companies (issuer), filings, board seats ----
const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
let newCompanies = 0, newSeats = 0;
for (const c of candidates) {
  const slug = c.cik ? `cik-${c.cik}` : slugify(c.issuerName);
  const { data: co } = await sb.from('vc_companies').upsert({ slug, name: c.issuerName, cik: c.cik || null }, { onConflict: 'slug' }).select('id').single();
  if (!co) continue;
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=D`;
  const { data: fil } = await sb.from('vc_filings').upsert({ accession: c.acc, form_type: c.formType, cik: c.cik, issuer_name: c.issuerName, filing_date: c.date, offering_amount: c.amount, industry_group: c.industry, url }, { onConflict: 'accession' }).select('id').single();
  const { error } = await sb.from('vc_board_seats').upsert({
    person_id: c.person_id, company_id: co.id, firm_id: c.firm_id, person_name: c.personName,
    role: 'Director', as_of: c.date, confidence: 'medium', source_kind: 'formd',
    source_text: `SEC Form ${c.formType} ${c.acc}`, source_url: url, filing_id: fil?.id || null, is_published: true,
  }, { onConflict: 'person_name,company_id,firm_id' });
  if (!error) newSeats++;
}
await sb.from('vc_sync_log').insert({ source: 'backfill', filings_processed: personsByAcc.size, new_companies: newCompanies, new_board_seats: newSeats, notes: `${quarter}: ${matched} matches, ${skippedSpv} SPVs skipped` });
console.log(`backfill complete: upserted ${newSeats} board seats.`);
