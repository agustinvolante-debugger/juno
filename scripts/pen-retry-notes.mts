// Writes the notes again for recordings whose write-up died on a busy database: status 'error',
// with error_text a passing failure ("canceling statement due to statement timeout", "upstream
// request timeout", 502/503/504, a dropped connection: lib/pen/db-retry.ts isTransientError).
// Made for Chris's 22 Oct batch (14 files at once, two write-ups failed that way); since then the
// pipeline retries these by itself (lib/pen/notes-queue.ts), so this is for older rows.
//
//   npx tsx --env-file=.env.local scripts/pen-retry-notes.mts someone@example.com        (dry run: lists them)
//   npx tsx --env-file=.env.local scripts/pen-retry-notes.mts someone@example.com --yes  (re-runs them)
//
// With --yes, one recording at a time: it goes back to 'transcribed' and through the same
// unattended path as a new upload (notes, people, then the batch email for it; the failure email
// already went, so the notes arriving are the good news). Any other error (no speech, the model
// refused, a bad file) is listed and left alone. Uploads that never got a row can't be retried
// here: those files have to be uploaded again.

import { supabaseAdmin } from '../lib/supabase'
import { isTransientError } from '../lib/pen/db-retry'
import { plainReason } from '../lib/pen/notes-queue'

const email = (process.argv[2] ?? '').trim().toLowerCase()
const GO = process.argv.includes('--yes')
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('usage: scripts/pen-retry-notes.mts <email> [--yes]')
  process.exit(1)
}

type Row = { id: string; user_email: string; title: string | null; source_name: string | null; status: string; error_text: string | null; merge_group: string | null; merge_index: number | null; created_at: string; aai_id: string | null }

const { data, error } = await supabaseAdmin
  .from('pen_sessions')
  .select('id,user_email,title,source_name,status,error_text,merge_group,merge_index,created_at,aai_id')
  .ilike('user_email', email)
  .eq('status', 'error')
  .order('created_at', { ascending: true })
  .limit(200)
if (error) {
  console.error(`read failed: ${error.message}`)
  process.exit(1)
}
const rows = (data ?? []) as Row[]
// Has a transcript to write from: a transcription failure (AssemblyAI) is not a write-up failure.
const { data: withText } = rows.length
  ? await supabaseAdmin.from('pen_sessions').select('id').in('id', rows.map((r) => r.id)).not('transcript->utterances', 'is', null)
  : { data: [] as { id: string }[] }
const transcribed = new Set(((withText ?? []) as { id: string }[]).map((r) => r.id))

const todo = rows.filter((r) => isTransientError(plainReason(r.error_text ?? '')) && transcribed.has(r.id) && !(r.merge_group && (r.merge_index ?? 0) > 0))
const skipped = rows.filter((r) => !todo.includes(r))

console.log(`${email}: ${rows.length} recording(s) in error, ${todo.length} failed on a busy database${GO ? '' : ' (dry run; add --yes to re-run them)'}`)
for (const r of todo) console.log(`  retry  ${r.id}  ${r.title || r.source_name || '(untitled)'}  ${r.created_at}  "${r.error_text}"`)
for (const r of skipped) console.log(`  leave  ${r.id}  ${r.title || r.source_name || '(untitled)'}  ${r.created_at}  "${r.error_text}"${transcribed.has(r.id) ? '' : ' (no transcript)'}`)

if (!GO || !todo.length) process.exit(0)

const { runUnattended } = await import('../lib/pen/unattended')
for (const r of todo) {
  // Back in line, as if its transcript had just landed. Only if it is still in error.
  const { data: moved, error: e } = await supabaseAdmin.from('pen_sessions')
    .update({ status: 'transcribed', error_text: null, updated_at: new Date().toISOString() })
    .eq('id', r.id).eq('status', 'error').select('id')
  if (e || !moved?.length) {
    console.log(`  ${r.id}: not moved (${e?.message ?? 'no longer in error'})`)
    continue
  }
  const outcome = await runUnattended(r.id, r.user_email).catch((x) => `threw: ${(x as Error).message}`)
  const { data: after } = await supabaseAdmin.from('pen_sessions').select('status,error_text,briefing_sent_at').eq('id', r.id).maybeSingle()
  console.log(`  ${r.id}: ${outcome} -> ${after?.status}${after?.error_text ? ` (${after.error_text})` : ''}${after?.briefing_sent_at ? ', emailed' : ''}`)
}
process.exit(0)
