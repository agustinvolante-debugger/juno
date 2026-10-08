// Copy VC Constellation (vc_*) and Daily Brief (news_*) from the Pen Supabase project to the
// "juno-apps" project (split of 8 Oct 2026). Reads the old project, never writes to it.
//
//   node --env-file=.env.local scripts/apps-copy.mjs            full copy (resumable: re-run to continue)
//   node --env-file=.env.local scripts/apps-copy.mjs --top-up   before switching: re-copy the small tables,
//                                                                and Form D issuers updated since the full copy
//   node --env-file=.env.local scripts/apps-copy.mjs --verify   row counts, old vs new
//
// Upserts on each table's primary key, so every mode is safe to repeat.
// Progress lives in .apps-copy-state.json (gitignored via .apps-*).

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const OLD = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const NEW = createClient(process.env.APPS_SUPABASE_URL, process.env.APPS_SUPABASE_SERVICE_ROLE_KEY)
if (!process.env.APPS_SUPABASE_URL || process.env.APPS_SUPABASE_URL === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('APPS_SUPABASE_URL missing or equal to the Pen project. Stopping.'); process.exit(1)
}

// Parents before children (foreign keys). pk = upsert key; batch = rows per write.
const TABLES = [
  { t: 'vc_firms', pk: ['id'] },
  { t: 'vc_filings', pk: ['id'] },
  { t: 'vc_companies', pk: ['id'] },
  { t: 'vc_people', pk: ['id'] },
  { t: 'vc_investments', pk: ['id'] },
  { t: 'vc_board_seats', pk: ['id'] },
  { t: 'vc_info_requests', pk: ['id'] },
  { t: 'vc_sync_log', pk: ['id'] },
  { t: 'vc_ingest_meta', pk: ['key'] },
  { t: 'vc_funding_overrides', pk: ['company_slug'] },
  { t: 'vc_funding_events', pk: ['id'] },
  { t: 'vc_chat_conversations', pk: ['id'] },
  { t: 'vc_chat_messages', pk: ['id'], batch: 200 },
  { t: 'vc_result_sets', pk: ['id'], batch: 20 },
  { t: 'vc_chat_runs', pk: ['id'] },
  { t: 'vc_enrich_queue', pk: ['id'], batch: 200 },
  { t: 'vc_user_state', pk: ['user_email'] },
  { t: 'vc_memos', pk: ['company_slug'] },
  { t: 'news_topics', pk: ['id'] },
  { t: 'news_prefs', pk: ['user_email'] },
  { t: 'news_profile', pk: ['user_email'] },
  { t: 'news_feed_cache', pk: ['section'], batch: 20 },
  { t: 'news_macro_cache', pk: ['id'] },
  { t: 'news_translations', pk: ['link'] },
  { t: 'vc_formd_issuers', pk: ['cik'], big: true },
  { t: 'vc_formd_persons', pk: ['person_key'], big: true },
  { t: 'vc_formd_person_issuers', pk: ['person_key', 'cik'], big: true },
]

const PAGE = 1000 // Supabase's default max rows per request
const STATE = '.apps-copy-state.json'
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1))

const count = async (db, t) => {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${t} count: ${error.message}`)
  return count
}

async function retry(fn, what) {
  for (let i = 1; ; i++) {
    try { return await fn() } catch (e) {
      if (i >= 5) throw e
      console.log(`  retry ${i} (${what}): ${e.message}`)
      await new Promise((r) => setTimeout(r, 2000 * i))
    }
  }
}

async function write(spec, rows) {
  const n = spec.batch || PAGE
  for (let i = 0; i < rows.length; i += n) {
    await retry(async () => {
      const { error } = await NEW.from(spec.t).upsert(rows.slice(i, i + n), { onConflict: spec.pk.join(',') })
      if (error) throw new Error(error.message)
    }, `${spec.t} write`)
  }
}

// Reads ordered by the primary key. Single-column keys page by "pk > last" (fast at any depth, and resumable);
// the composite key pages by offset (resumable by row position, since the old table doesn't change meanwhile).
async function copyTable(spec, filter) {
  const key = spec.pk[0]
  const composite = spec.pk.length > 1
  const s = (state[spec.t] ??= {})
  if (s.done && !filter) { console.log(`${spec.t}: already copied`); return }
  let done = filter ? 0 : (s.rows || 0)
  let last = filter ? null : (s.last ?? null)
  const t0 = Date.now()
  for (;;) {
    const rows = await retry(async () => {
      let q = OLD.from(spec.t).select('*')
      for (const k of spec.pk) q = q.order(k, { ascending: true })
      if (filter) q = filter(q)
      if (composite) q = q.range(done, done + PAGE - 1)
      else { if (last !== null) q = q.gt(key, last); q = q.limit(PAGE) }
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data
    }, `${spec.t} read`)
    if (!rows.length) break
    await write(spec, rows)
    done += rows.length
    last = rows[rows.length - 1][key]
    if (!filter) { s.rows = done; s.last = last; save() }
    if (spec.big) process.stdout.write(`\r${spec.t}: ${done.toLocaleString()} rows, ${Math.round((Date.now() - t0) / 1000)}s   `)
    if (rows.length < PAGE) break
  }
  if (spec.big) process.stdout.write('\n')
  if (!filter) { s.done = true; s.finished_at = new Date().toISOString(); save() }
  console.log(`${spec.t}: ${done.toLocaleString()} rows copied${filter ? ' (top-up)' : ''}`)
}

async function verify() {
  let bad = 0
  for (const { t } of TABLES) {
    const [a, b] = await Promise.all([count(OLD, t), count(NEW, t)])
    if (a !== b) bad++
    console.log(`${a === b ? 'OK  ' : 'DIFF'} ${t.padEnd(26)} old ${String(a).padStart(8)}  new ${String(b).padStart(8)}`)
  }
  console.log(bad ? `\n${bad} table(s) differ.` : '\nAll tables match.')
}

const mode = process.argv[2]
if (mode === '--verify') await verify()
else if (mode === '--top-up') {
  const since = state.started_at
  if (!since) { console.error('No full copy recorded yet. Run without --top-up first.'); process.exit(1) }
  for (const spec of TABLES.filter((x) => !x.big)) await copyTable(spec, (q) => q)
  await copyTable(TABLES.find((x) => x.t === 'vc_formd_issuers'), (q) => q.gte('updated_at', since))
  await verify()
} else {
  state.started_at ??= new Date().toISOString(); save()
  for (const spec of TABLES) await copyTable(spec)
  await verify()
}
