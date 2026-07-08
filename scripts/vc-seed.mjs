// One-time seed: port the hand-researched VC Constellation data (vcbrain/data.js + bios.js)
// into the vc_* Supabase tables. Idempotent (upserts on natural keys).
//
//   node scripts/vc-seed.mjs --dry     # shape rows + print counts, no DB writes
//   node scripts/vc-seed.mjs           # upsert into Supabase (needs migration 007 applied)
//
// Reads Supabase creds from .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const VCBRAIN = '/Users/agustinvolante/Downloads/juno_project/vcbrain';

// ---- load a `window.X = ...` browser file into a plain object ----
function loadWindowFile(path) {
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(path, 'utf8'))(win);
  return win;
}
const D = loadWindowFile(`${VCBRAIN}/data.js`).VCBRAIN;
const BIOS = loadWindowFile(`${VCBRAIN}/bios.js`).VCBIOS;

// ---- helpers ----
const norm = (s) => (s || '').toLowerCase().replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim();
function parseAmt(s) {
  if (!s) return null;
  const m = ('' + s).replace(/[, ]/g, '').match(/([\d.]+)\s*([BMK]?)/i);
  if (!m) return null;
  const v = +m[1] || 0, u = (m[2] || '').toUpperCase();
  return v * (u === 'B' ? 1e9 : u === 'M' ? 1e6 : u === 'K' ? 1e3 : 1);
}
const ymToDate = (ym) => (/^\d{4}-\d{2}$/.test(ym || '') ? `${ym}-01` : null);

// ---- build rows ----
const firms = D.vcs.map((v) => ({ slug: v.id, name: v.name, kind: 'vc' }));

// people: bios first (rich), then any partners named in vc arrays but missing a bio
const peopleByKey = new Map(); // `${normName}@${firmSlug}` -> row
for (const b of Object.values(BIOS)) {
  peopleByKey.set(`${norm(b.name)}@${b.firmId}`, {
    full_name: b.name, norm_name: norm(b.name), firm_slug: b.firmId,
    title: b.role || null, bio: b.bio || null, profile_url: b.profileUrl || null,
    linkedin: b.linkedin || null, x_url: b.x || null, kind: 'partner',
  });
}
for (const v of D.vcs) {
  for (const p of v.partners || []) {
    const k = `${norm(p)}@${v.id}`;
    if (!peopleByKey.has(k)) peopleByKey.set(k, {
      full_name: p, norm_name: norm(p), firm_slug: v.id, kind: 'partner',
    });
  }
}
const people = [...peopleByKey.values()];

// companies: derive last round from investments
const invByCo = {};
D.investments.forEach((iv) => (invByCo[iv.company] ||= []).push(iv));
const companies = D.companies.map((c) => {
  const invs = (invByCo[c.id] || []).filter((iv) => iv.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = invs[0];
  return {
    slug: c.id, name: c.name, sector: c.sector, total_raised: c.totalRaised || null,
    last_round: last?.round || null,
    last_round_amount: last ? parseAmt(last.amount) : null,
    last_round_date: last ? ymToDate(last.date) : null,
  };
});

const invSeen = new Set();
const investments = [];
for (const iv of D.investments) {
  const key = `${iv.vc}|${iv.company}|${iv.round || ''}|${iv.date || ''}`; // matches unique(firm,company,round,date)
  if (invSeen.has(key)) continue;
  invSeen.add(key);
  investments.push({
    firm_slug: iv.vc, company_slug: iv.company, partner_key: iv.partner ? `${norm(iv.partner)}@${iv.vc}` : null,
    round: iv.round || null, amount_text: iv.amount || null, amount_num: parseAmt(iv.amount),
    date: iv.date || null, lead: !!iv.lead, confidence: iv.confidence || 'medium', source_text: iv.source || null,
  });
}

const seatMap = new Map(); // dedupe person_name|company|firm
for (const iv of D.investments) {
  if (!iv.boardSeat || !iv.partner) continue;
  const key = `${iv.partner}|${iv.company}|${iv.vc}`;
  if (!seatMap.has(key)) seatMap.set(key, {
    person_name: iv.partner, company_slug: iv.company, firm_slug: iv.vc,
    partner_key: `${norm(iv.partner)}@${iv.vc}`, role: 'Board Member',
    confidence: iv.confidence || 'medium', source_kind: 'news', source_text: iv.source || null, is_published: true,
  });
}
const boardSeats = [...seatMap.values()];

console.log(`shaped: ${firms.length} firms, ${people.length} people, ${companies.length} companies, ${investments.length} investments, ${boardSeats.length} board seats`);

if (DRY) {
  console.log('\nsample firm:', JSON.stringify(firms[0]));
  console.log('sample person:', JSON.stringify(people.find((p) => p.bio)));
  console.log('sample company:', JSON.stringify(companies.find((c) => c.last_round_amount)));
  console.log('sample investment:', JSON.stringify(investments.find((i) => i.partner_key)));
  console.log('sample board seat:', JSON.stringify(boardSeats[0]));
  process.exit(0);
}

// ---- upsert into Supabase ----
for (const line of readFileSync('/Users/agustinvolante/Downloads/juno/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function up(table, rows, onConflict) {
  const { error } = await sb.from(table).upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) { console.error(`upsert ${table} failed:`, error.message); process.exit(1); }
}
async function idMap(table, keyCols) {
  const { data, error } = await sb.from(table).select('*');
  if (error) { console.error(`select ${table} failed:`, error.message); process.exit(1); }
  const m = new Map();
  for (const r of data) m.set(keyCols.map((k) => r[k]).join('|'), r.id);
  return m;
}

await up('vc_firms', firms, 'slug');
const firmId = await idMap('vc_firms', ['slug']);
await up('vc_companies', companies, 'slug');
const coId = await idMap('vc_companies', ['slug']);

await up('vc_people', people.map((p) => ({
  full_name: p.full_name, norm_name: p.norm_name, firm_id: firmId.get(p.firm_slug) || null,
  title: p.title || null, bio: p.bio || null, profile_url: p.profile_url || null,
  linkedin: p.linkedin || null, x_url: p.x_url || null, kind: p.kind,
})), 'norm_name,firm_id');
const personRows = await sb.from('vc_people').select('id,norm_name,firm_id');
const personId = new Map();
for (const r of personRows.data) {
  const slug = [...firmId.entries()].find(([, id]) => id === r.firm_id)?.[0];
  personId.set(`${r.norm_name}@${slug}`, r.id);
}

await up('vc_investments', investments.map((iv) => ({
  firm_id: firmId.get(iv.firm_slug), company_id: coId.get(iv.company_slug),
  partner_id: iv.partner_key ? personId.get(iv.partner_key) || null : null,
  round: iv.round, amount_text: iv.amount_text, amount_num: iv.amount_num, date: iv.date,
  lead: iv.lead, confidence: iv.confidence, source_text: iv.source_text,
})), 'firm_id,company_id,round,date');

await up('vc_board_seats', boardSeats.map((s) => ({
  person_id: personId.get(s.partner_key) || null, company_id: coId.get(s.company_slug),
  firm_id: firmId.get(s.firm_slug) || null, person_name: s.person_name, role: s.role,
  confidence: s.confidence, source_kind: s.source_kind, source_text: s.source_text, is_published: s.is_published,
})), 'person_name,company_id,firm_id');

console.log('seed complete.');
