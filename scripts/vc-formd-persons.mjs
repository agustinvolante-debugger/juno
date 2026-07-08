// Build the investor index: aggregate RELATEDPERSONS across all Form D quarterly
// bulk sets (2020q1 -> latest) into vc_formd_persons + vc_formd_person_issuers.
//
//   node scripts/vc-formd-persons.mjs --dry --from 2025q1 --to 2025q1
//   node scripts/vc-formd-persons.mjs                       # full 2020q1->latest
//
// Env: EDGAR_UA, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normName } from '../lib/vc/edgar.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const UA = process.env.EDGAR_UA || 'VC Constellation research chaska@caerusai.com';

function quartersFrom(from, to) {
  const [fy, fq] = [+from.slice(0, 4), +from[5]], [ty, tq] = [+to.slice(0, 4), +to[5]], out = [];
  for (let y = fy, q = fq; y < ty || (y === ty && q <= tq); q++) {
    if (q > 4) { q = 1; y++; if (y > ty || (y === ty && q > tq)) break; }
    out.push(`${y}q${q}`);
  }
  return out;
}
function latestCompleteQuarter() {
  const d = new Date(Date.now()); const y = d.getUTCFullYear(); const q = Math.floor(d.getUTCMonth() / 3) + 1;
  let py = y, pq = q - 1; if (pq < 1) { pq = 4; py--; }
  return `${py}q${pq}`;
}
const FROM = (argVal('--from') || '2020q1').toLowerCase();
const TO = (argVal('--to') || latestCompleteQuarter()).toLowerCase();
const quarters = quartersFrom(FROM, TO);
console.log(`Form D persons ingest: ${quarters.join(', ')}`);

function ensureQuarter(q) {
  let dir = `/tmp/formd_${q}`;
  if (!existsSync(dir)) {
    const url = `https://www.sec.gov/files/structureddata/data/form-d-data-sets/${q}_d.zip`;
    try {
      execSync(`curl -sfL -A "${UA}" -o "/tmp/formd_${q}.zip" "${url}" && mkdir -p "${dir}" && unzip -o -q "/tmp/formd_${q}.zip" -d "${dir}"`, { stdio: 'pipe' });
    } catch { return null; }
  }
  let files = readdirSync(dir);
  if (!files.some((f) => /RELATEDPERSONS/i.test(f))) {
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

// person identity: first + last name, normalized (middle names too inconsistent across filings)
const P = new Map();   // key -> {name, filing_count, roles:Set, first_seen, last_seen}
const J = new Map();   // key|cik -> {person_key, cik, issuer_name, roles:Set, first_date, last_date, filing_count}
let rows = 0;
for (const q of quarters) {
  const got = ensureQuarter(q);
  if (!got) { console.log(`  ${q}: (missing, skipped)`); continue; }
  const { dir, files } = got;
  const f = (re) => files.find((x) => re.test(x));
  const sub = readTsv(dir, f(/FORMDSUBMISSION/i)), iss = readTsv(dir, f(/ISSUERS?/i)), rel = readTsv(dir, f(/RELATEDPERSONS/i));
  const date = new Map(); { const a = sub.col('ACCESSIONNUMBER'), d = Math.max(sub.col('FILING_DATE'), sub.col('FILINGDATE')); for (const r of sub.rows) date.set(r[a], toIso((r[d] || '').trim())); }
  const issuer = new Map(); { const a = iss.col('ACCESSIONNUMBER'), c = iss.col('CIK'), nm = iss.col('ENTITYNAME'), pr = iss.col('PRIMARYISSUER');
    for (const r of iss.rows) { if (pr >= 0 && r[pr] && !/true|1|y/i.test(r[pr])) continue; const cik = (r[c] || '').trim(); if (cik) issuer.set(r[a], { cik, name: r[nm] }); } }
  const aAcc = rel.col('ACCESSIONNUMBER'), aF = rel.col('FIRSTNAME'), aL = rel.col('LASTNAME'), r1 = rel.col('RELATIONSHIP_1'), r2 = rel.col('RELATIONSHIP_2'), r3 = rel.col('RELATIONSHIP_3');
  for (const r of rel.rows) {
    const first = (r[aF] || '').trim(), last = (r[aL] || '').trim();
    const name = `${first} ${last}`.trim(); if (!name || name.length < 3) continue;
    // fund administrators file corporate GPs as "related persons" — keep humans only
    if (!first || /^n\/?a\.?$/i.test(first) || /^n\/?a\.?$/i.test(last)) continue;
    if (/\b(llc|l\.l\.c|ltd|inc|corp(oration)?|company|fund|funds|gp|lp|partners|group|management|capital|advis[oe]rs?|trustees?|foundation|ventures|series)\b/i.test(name)) continue;
    const key = normName(name); if (!key) continue;
    const acc = r[aAcc], dt = date.get(acc) || null, is = issuer.get(acc);
    const roles = [r[r1], r[r2], r[r3]].map((x) => (x || '').trim()).filter(Boolean);
    let p = P.get(key);
    if (!p) { p = { name, filing_count: 0, roles: new Set(), first_seen: dt, last_seen: dt }; P.set(key, p); }
    p.filing_count++;
    roles.forEach((x) => p.roles.add(x));
    if (dt && (!p.first_seen || dt < p.first_seen)) p.first_seen = dt;
    if (dt && (!p.last_seen || dt > p.last_seen)) { p.last_seen = dt; p.name = name; }
    if (is) {
      const jk = key + '|' + is.cik;
      let j = J.get(jk);
      if (!j) { j = { person_key: key, cik: is.cik, issuer_name: is.name, roles: new Set(), first_date: dt, last_date: dt, filing_count: 0 }; J.set(jk, j); }
      j.filing_count++;
      roles.forEach((x) => j.roles.add(x));
      if (dt && (!j.first_date || dt < j.first_date)) j.first_date = dt;
      if (dt && (!j.last_date || dt > j.last_date)) { j.last_date = dt; j.issuer_name = is.name; }
    }
    rows++;
  }
  console.log(`  ${q}: ${rel.rows.length} related-person rows · unique persons=${P.size} · junctions=${J.size}`);
}
// issuer_count per person
const IC = new Map();
for (const j of J.values()) IC.set(j.person_key, (IC.get(j.person_key) || 0) + 1);
console.log(`\naggregated ${rows} rows -> ${P.size} persons, ${J.size} person-issuer links`);

if (DRY) {
  const top = [...P.entries()].sort((a, b) => b[1].filing_count - a[1].filing_count).slice(0, 10);
  top.forEach(([k, p]) => console.log(`  ${p.name} x${p.filing_count} filings · ${IC.get(k) || 0} issuers · [${[...p.roles].join('/')}] ${p.first_seen}..${p.last_seen}`));
  process.exit(0);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function bulkUpsert(table, arr, conflict) {
  let done = 0;
  const CH = 500, CONC = 4;
  for (let i = 0; i < arr.length; i += CH * CONC) {
    const batch = [];
    for (let c = 0; c < CONC; c++) {
      const chunk = arr.slice(i + c * CH, i + (c + 1) * CH);
      if (chunk.length) batch.push(sb.from(table).upsert(chunk, { onConflict: conflict }).then(({ error }) => { if (error) throw new Error(table + ': ' + error.message); }));
    }
    await Promise.all(batch);
    done = Math.min(arr.length, i + CH * CONC);
    if (done % 20000 < CH * CONC) console.log(`  ${table}: ${done}/${arr.length}`);
  }
}
const now = new Date(Date.now()).toISOString();
const persons = [...P.entries()].map(([key, p]) => ({
  person_key: key, name: p.name, filing_count: p.filing_count, issuer_count: IC.get(key) || 0,
  roles: [...p.roles].slice(0, 8), first_seen: p.first_seen, last_seen: p.last_seen, updated_at: now,
}));
const junctions = [...J.values()].map((j) => ({
  person_key: j.person_key, cik: j.cik, issuer_name: j.issuer_name, roles: [...j.roles].slice(0, 8),
  first_date: j.first_date, last_date: j.last_date, filing_count: j.filing_count,
}));
await bulkUpsert('vc_formd_persons', persons, 'person_key');
await bulkUpsert('vc_formd_person_issuers', junctions, 'person_key,cik');
await sb.from('vc_ingest_meta').upsert({ key: 'persons_as_of', value: TO, updated_at: now }, { onConflict: 'key' });
console.log(`persons ingest complete: ${persons.length} persons, ${junctions.length} links, as_of ${TO}`);
