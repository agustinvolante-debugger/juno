// Deletes a Juno Pen account when the user asks us to (Privacy: "when you ask us to delete your
// account"). There is no self-serve delete; the founders run this. It used to be one-off copies in
// .pentest/, which fell behind the schema: the Gmail tables (19 Oct) weren't in them, so a deleted
// account would have kept its sealed Gmail token. This is the one script, kept with the schema.
//
//   npx tsx --env-file=.env.local scripts/pen-delete-account.mts someone@example.com        (dry run)
//   npx tsx --env-file=.env.local scripts/pen-delete-account.mts someone@example.com --yes  (delete)
//
// Order: Gmail access is revoked at Google first (disconnectGmail, which skips the revoke when
// the same Google account still serves Calendar/Docs here — those rows go below anyway), then each
// recording goes through deleteSession (audio in our bucket, pieces, AssemblyAI's copy), then every
// remaining row keyed by the address. Exact, case-insensitive match on the address only.
//
// Adding a table to lib/pen/schema.sql that holds a user's data? Add it to TABLES.

import { supabaseAdmin } from '../lib/supabase'
import { deleteSession } from '../lib/pen/store'
import { disconnectGmail, listAccounts } from '../lib/pen/gmail'

const email = (process.argv[2] ?? '').trim().toLowerCase()
const GO = process.argv.includes('--yes')
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('usage: scripts/pen-delete-account.mts <email> [--yes]')
  process.exit(1)
}

const TABLES = [
  'pen_proactive_log', 'pen_suggestions', 'pen_reminders', 'pen_name_mentions', 'pen_segments', 'pen_join_suggestions',
  'pen_session_people', 'pen_people', 'pen_clients', 'pen_chats', 'pen_docs', 'pen_archive_chat', 'pen_sessions',
  'pen_profiles', 'pen_sent_emails', 'pen_usage', 'pen_feedback', 'pen_hour_purchases', 'pen_announcement_sends',
  'pen_email_prefs', 'pen_referral_codes', 'pen_referrals', 'pen_notion', 'pen_notion_pages', 'pen_granola', 'pen_gcal',
  'pen_gmail', 'pen_mail_from',
  'pen_whatsapp_links', 'pen_whatsapp_messages', 'pen_whatsapp_failures', 'pen_login_links', 'pen_signups', 'pen_health',
  'pen_accounts',
]
const COLS = ['user_email', 'email', 'referrer_email', 'referred_email', 'owner_email']

// 1. Gmail: revoke at Google before the token is gone.
const gmail = await listAccounts(email).catch(() => [])
for (const a of gmail) {
  console.log(`gmail ${a.address}${GO ? ' -> disconnecting' : ''}`)
  if (GO) console.log('  ', JSON.stringify(await disconnectGmail(email, a.address).catch((e) => ({ error: (e as Error).message }))))
}

// 2. Recordings, one by one, so their audio and AssemblyAI copies go too.
const { data: sessions } = await supabaseAdmin.from('pen_sessions').select('id').ilike('user_email', email).limit(5000)
console.log(`recordings: ${sessions?.length ?? 0}${GO ? ' -> deleting with audio' : ''}`)
if (GO) for (const s of sessions ?? []) await deleteSession(email, s.id as string).catch((e) => console.warn(`  ${s.id}: ${(e as Error).message}`))

// 3. Every other row keyed by the address.
let total = 0
for (const t of TABLES) {
  for (const c of COLS) {
    const { count, error } = await supabaseAdmin.from(t).select('*', { count: 'exact', head: true }).ilike(c, email)
    if (error || !count) continue
    // Safety: ilike treats _ and % as wildcards; every row must really be this address.
    const { data: check } = await supabaseAdmin.from(t).select(c).ilike(c, email).limit(5000)
    const bad = (check ?? []).filter((r) => String((r as unknown as Record<string, string>)[c]).toLowerCase() !== email)
    if (bad.length) throw new Error(`${t}.${c}: ${bad.length} rows are not ${email}, aborting`)
    total += count
    console.log(`${t}.${c}: ${count}${GO ? ' -> deleting' : ''}`)
    if (GO) {
      const { error: de } = await supabaseAdmin.from(t).delete().ilike(c, email)
      if (de) console.warn(`  ${t}: ${de.message}`)
    }
  }
}
console.log(GO ? `deleted ${total} more rows for ${email}` : `DRY RUN: ${total} rows for ${email} (pass --yes to delete)`)
