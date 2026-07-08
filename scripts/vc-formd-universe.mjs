// Ingest the full SEC Form D universe (2020q1 -> latest complete quarter) into
// vc_formd_issuers, deduped/aggregated per CIK. One-time + re-runnable (idempotent).
//
//   node scripts/vc-formd-universe.mjs --dry --from 2025q1 --to 2025q1   # parse+aggregate, no DB
//   node scripts/vc-formd-universe.mjs                                    # full ingest 2020q1->latest
//   node scripts/vc-formd-universe.mjs --from 2024q1                      # custom range
//
// Env: EDGAR_UA, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normName } from '../lib/vc/edgar.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

// env
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const UA = process.env.EDGAR_UA || 'VC Constellation research chaska@caerusai.com';

// ---- quarter range ----
function quartersFrom(from, to) {
  const [fy, fq] = [+from.slice(0, 4), +from[5]];
  const [ty, tq] = [+to.slice(0, 4), +to[5]];
  const out = [];
  for (let y = fy, q = fq; y < ty || (y === ty && q <= tq); q++) {
    if (q > 4) { q = 1; y++; if (y > ty || (y === ty && q > tq)) break; }
    out.push(`${y}q${q}`);
  }
  return out;
}
function latestCompleteQuarter() {
  // no argless new Date() in some sandboxes; use env-provided or Date.now via number
  const d = new Date(Date.now()); const y = d.getUTCFullYear(); const q = Math.floor(d.getUTCMonth() / 3) + 1;
  let py = y, pq = q - 1; if (pq < 1) { pq = 4; py--; }
  return `${py}q${pq}`;
}
const FROM = (argVal('--from') || '2020q1').toLowerCase();
const TO = (argVal('--to') || latestCompleteQuarter()).toLowerCase();
const quarters = quartersFrom(FROM, TO);
console.log(`Form D universe ingest: ${quarters.join(', ')}`);

// ---- download + parse helpers (mirror vc-backfill.mjs) ----
function ensureQuarter(q) {
  let dir = `/tmp/formd_${q}`;
  if (!existsSync(dir)) {
    const url = `https://www.sec.gov/files/structureddata/data/form-d-data-sets/${q}_d.zip`;
    try {
      execSync(`curl -sfL -A "${UA}" -o "/tmp/formd_${q}.zip" "${url}" && mkdir -p "${dir}" && unzip -o -q "/tmp/formd_${q}.zip" -d "${dir}"`, { stdio: 'pipe' });
    } catch { return null; } // 404 / missing quarter
  }
  let files = readdirSync(dir);
  if (!files.some((f) => /ISSUERS/i.test(f))) {
    const sub = files.find((f) => { try { return statSync(`${dir}/${f}`).isDirectory(); } catch { return false; } });
    if (sub) { dir = `${dir}/${sub}`; files = readdirSync(dir); }
  }
  return { dir, files };
}
function readTsv(dir, fname) {
  const text = readFileSync(`${dir}/${fname}`, 'utf8');
  const lines = text.split('\n');
  const head = lines[0].split('\t').map((h) => h.trim().toUpperCase());
  const col = (want) => head.findIndex((h) => h.includes(want));
  return { col, rows: lines.slice(1).filter(Boolean).map((l) => l.split('\t')) };
}
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const toIso = (d) => { if (!d) return null; const m = d.match(/^(\d{2})-([A-Z]{3})-(\d{4})/i); if (m) return `${m[3]}-${MON[m[2].toUpperCase()] || '01'}-${m[1]}`; return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

// ---- aggregate per CIK across all quarters ----
const M = new Map();
let filings = 0;
for (const q of quarters) {
  const got = ensureQuarter(q);
  if (!got) { console.log(`  ${q}: (missing, skipped)`); continue; }
  const { dir, files } = got;
  const f = (re) => files.find((x) => re.test(x));
  const sub = readTsv(dir, f(/FORMDSUBMISSION/i)), iss = readTsv(dir, f(/ISSUERS?/i)), off = readTsv(dir, f(/OFFERING/i));
  const date = new Map(); { const a = sub.col('ACCESSIONNUMBER'), d = Math.max(sub.col('FILING_DATE'), sub.col('FILINGDATE')); for (const r of sub.rows) date.set(r[a], toIso((r[d] || '').trim())); }
  const offer = new Map(); { const a = off.col('ACCESSIONNUMBER'), ig = off.col('INDUSTRYGROUPTYPE'), ta = off.col('TOTALOFFERINGAMOUNT'), rr = off.col('REVENUERANGE'); for (const r of off.rows) offer.set(r[a], { industry: r[ig] || null, amt: num(r[ta]), rev: rr >= 0 ? r[rr] || null : null }); }
  const aAcc = iss.col('ACCESSIONNUMBER'), aCik = iss.col('CIK'), aName = iss.col('ENTITYNAME'), aPrim = iss.col('PRIMARYISSUER'), aState = Math.max(iss.col('STATEORCOUNTRY'), iss.col('STATE'));
  for (const r of iss.rows) {
    if (aPrim >= 0 && r[aPrim] && !/true|1|y/i.test(r[aPrim])) continue; // primary issuer only
    const cik = (r[aCik] || '').trim(); if (!cik) continue;
    const acc = r[aAcc]; const dt = date.get(acc) || null; const o = offer.get(acc) || {};
    const state = (r[aState] || '').trim() || null;
    let e = M.get(cik);
    if (!e) { e = { cik, name: r[aName], norm_name: normName(r[aName]), industry_group: o.industry, state, country: null, first_filing_date: dt, last_filing_date: dt, last_offering_amount: o.amt, total_offering_amount: 0, filing_count: 0, revenue_range: o.rev }; M.set(cik, e); }
    e.filing_count++;
    if (o.amt) e.total_offering_amount += o.amt;
    if (dt && (!e.first_filing_date || dt < e.first_filing_date)) e.first_filing_date = dt;
    if (dt && (!e.last_filing_date || dt >= e.last_filing_date)) { e.last_filing_date = dt; e.last_offering_amount = o.amt; e.name = r[aName]; e.norm_name = normName(r[aName]); e.industry_group = o.industry; if (state) e.state = state; e.revenue_range = o.rev; }
    filings++;
  }
  console.log(`  ${q}: ${iss.rows.length} issuer rows · running unique CIKs=${M.size}`);
}
console.log(`\naggregated ${filings} filings -> ${M.size} unique issuers`);

if (DRY) {
  const sample = [...M.values()].sort((a, b) => (b.last_offering_amount || 0) - (a.last_offering_amount || 0)).slice(0, 8);
  sample.forEach((e) => console.log(`  ${e.name} [${e.industry_group || '?'} · ${e.state || '?'}] last $${e.last_offering_amount} total $${Math.round(e.total_offering_amount)} x${e.filing_count} ${e.last_filing_date}`));
  process.exit(0);
}

// ---- bulk upsert ----
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const all = [...M.values()];
let done = 0;
for (let i = 0; i < all.length; i += 500) {
  const chunk = all.slice(i, i + 500).map((e) => ({ ...e, total_offering_amount: Math.round(e.total_offering_amount) || null, updated_at: new Date(Date.now()).toISOString() }));
  const { error } = await sb.from('vc_formd_issuers').upsert(chunk, { onConflict: 'cik' });
  if (error) { console.error('upsert failed:', error.message); process.exit(1); }
  done += chunk.length; if (done % 5000 < 500) console.log(`  upserted ${done}/${all.length}`);
}
await sb.from('vc_ingest_meta').upsert({ key: 'formd_as_of', value: TO, updated_at: new Date(Date.now()).toISOString() }, { onConflict: 'key' });
await sb.from('vc_ingest_meta').upsert({ key: 'formd_coverage', value: `${FROM}..${TO}`, updated_at: new Date(Date.now()).toISOString() }, { onConflict: 'key' });
console.log(`ingest complete: ${all.length} issuers, as_of ${TO}`);
