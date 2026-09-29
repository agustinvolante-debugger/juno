// Is Juno Pen working? Run every 15 minutes by Supabase pg_cron (see schema.sql), which calls
// /api/pen/health. Vonage's suspension, Meta's block and stuck notes were all found by accident;
// this is so the next one is found by an email.
//
// Two kinds of check:
//   probes  call a vendor (Meta, AssemblyAI, Resend, Anthropic). A network blip fails one run,
//           so a probe alerts on its SECOND failure in a row.
//   data    read our own tables for work that should have finished (a question with no reply,
//           a transcription stuck, a briefing never sent). These alert at once.
//
// Only changes are emailed: one "down" email, one "back" email, and a reminder every six hours
// while something stays down. State lives in pen_health, one row per check.

import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'
import { getLinkByEmail } from './whatsapp/store'
import { sendText } from './whatsapp/provider'

export type CheckResult = { name: string; ok: boolean; detail: string; probe: boolean }

const MIN = 60 * 1000
const REMIND_MS = 6 * 60 * MIN
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

async function timed(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: 'no-store' })
}

/* ----------------------------------------------------------------- probes */

async function meta(): Promise<CheckResult> {
  const name = 'Meta WhatsApp API'
  const token = process.env.META_WA_TOKEN
  const id = process.env.META_WA_PHONE_NUMBER_ID
  if (!token || !id) return { name, ok: false, detail: 'META_WA_TOKEN / META_WA_PHONE_NUMBER_ID not set', probe: true }
  const v = process.env.META_GRAPH_VERSION || 'v23.0'
  const res = await timed(`https://graph.facebook.com/${v}/${id}?fields=status,quality_rating,display_phone_number`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json().catch(() => ({}))) as { status?: string; quality_rating?: string; error?: { message?: string } }
  if (!res.ok) return { name, ok: false, detail: `HTTP ${res.status}: ${body.error?.message ?? 'no detail'}`, probe: true }
  const bad = [body.status && body.status !== 'CONNECTED' ? `status ${body.status}` : '', body.quality_rating === 'RED' ? 'quality RED' : '']
    .filter(Boolean)
    .join(', ')
  return { name, ok: !bad, detail: bad || `CONNECTED, quality ${body.quality_rating ?? '?'}`, probe: true }
}

async function assembly(): Promise<CheckResult> {
  const name = 'AssemblyAI API'
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) return { name, ok: false, detail: 'ASSEMBLYAI_API_KEY not set', probe: true }
  const res = await timed('https://api.assemblyai.com/v2/transcript?limit=1', { headers: { Authorization: key } })
  return { name, ok: res.ok, detail: res.ok ? 'reachable' : `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, probe: true }
}

async function resend(): Promise<CheckResult> {
  const name = 'Resend (email) API'
  const key = process.env.RESEND_API_KEY
  if (!key) return { name, ok: false, detail: 'RESEND_API_KEY not set', probe: true }
  const res = await timed('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } })
  // A sending-only key may not list domains; it answering at all means Resend is up and the key is real.
  if (res.status === 401 || res.status === 403) {
    const t = await res.text()
    if (/restricted/i.test(t)) return { name, ok: true, detail: 'reachable (sending-only key)', probe: true }
    return { name, ok: false, detail: `HTTP ${res.status}: ${t.slice(0, 200)}`, probe: true }
  }
  if (!res.ok) return { name, ok: false, detail: `HTTP ${res.status}`, probe: true }
  const body = (await res.json().catch(() => ({}))) as { data?: { name: string; status: string }[] }
  const domain = /@([^>\s]+)/.exec(process.env.RESEND_FROM_EMAIL ?? '')?.[1]
  const d = body.data?.find((x) => x.name === domain)
  if (domain && d && d.status !== 'verified') return { name, ok: false, detail: `${domain} is ${d.status}`, probe: true }
  return { name, ok: true, detail: domain && d ? `${domain} verified` : 'reachable', probe: true }
}

async function anthropic(): Promise<CheckResult> {
  const name = 'Anthropic API'
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { name, ok: false, detail: 'ANTHROPIC_API_KEY not set', probe: true }
  const res = await timed('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })
  return { name, ok: res.ok, detail: res.ok ? 'reachable' : `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, probe: true }
}

/* ------------------------------------------------------------------- data */

async function whatsappReplies(): Promise<CheckResult> {
  const name = 'WhatsApp replies'
  // A linked user's text still 'received' 5 minutes on never got its reply (bot.ts marks
  // answered ones 'done'). Two hours back only: older rows predate that marking.
  const [unanswered, failed, stuckFiles] = await Promise.all([
    supabaseAdmin.from('pen_whatsapp_messages').select('id', { count: 'exact', head: true })
      .eq('kind', 'text').eq('state', 'received').not('email', 'is', null).lt('created_at', ago(5 * MIN)).gt('created_at', ago(120 * MIN)),
    supabaseAdmin.from('pen_whatsapp_messages').select('id', { count: 'exact', head: true })
      .eq('state', 'failed').gt('created_at', ago(60 * MIN)),
    supabaseAdmin.from('pen_whatsapp_messages').select('id', { count: 'exact', head: true })
      .eq('state', 'accepted').lt('created_at', ago(15 * MIN)).gt('created_at', ago(24 * 60 * MIN)),
  ])
  const err = unanswered.error ?? failed.error ?? stuckFiles.error
  if (err) return { name, ok: false, detail: `query failed: ${err.message}`, probe: false }
  const bad = [
    unanswered.count ? `${unanswered.count} message(s) with no reply after 5 min` : '',
    failed.count ? `${failed.count} failed in the last hour` : '',
    stuckFiles.count ? `${stuckFiles.count} file(s) accepted but never sent to transcription` : '',
  ].filter(Boolean)
  return { name, ok: !bad.length, detail: bad.join('; ') || 'all answered', probe: false }
}

async function transcriptions(): Promise<CheckResult> {
  const name = 'Transcriptions and notes'
  // 'held' is left out on purpose: paused or out of hours, waiting for the user.
  const [stuck, errored] = await Promise.all([
    supabaseAdmin.from('pen_sessions').select('id,status,created_at')
      .in('status', ['uploaded', 'transcribing', 'transcribed', 'noting']).lt('created_at', ago(45 * MIN)).gt('created_at', ago(3 * 24 * 60 * MIN)).limit(20),
    supabaseAdmin.from('pen_sessions').select('id', { count: 'exact', head: true })
      .eq('status', 'error').gt('updated_at', ago(60 * MIN)),
  ])
  const err = stuck.error ?? errored.error
  if (err) return { name, ok: false, detail: `query failed: ${err.message}`, probe: false }
  const s = (stuck.data ?? []) as { id: string; status: string }[]
  const bad = [
    s.length ? `${s.length} stuck over 45 min (${[...new Set(s.map((r) => r.status))].join(', ')})` : '',
    errored.count ? `${errored.count} ended in error in the last hour` : '',
  ].filter(Boolean)
  return { name, ok: !bad.length, detail: bad.join('; ') || 'none stuck', probe: false }
}

async function emails(): Promise<CheckResult> {
  const name = 'Emails sending'
  // A recording written up 45 min to a day ago with no briefing or "ready" email. First parts
  // of joined meetings only: a tail never gets its own email. Samples have no aai_id.
  const [unbriefed, failedSends] = await Promise.all([
    supabaseAdmin.from('pen_sessions').select('id', { count: 'exact', head: true })
      .eq('status', 'noted').is('briefing_sent_at', null).not('aai_id', 'is', null).or('merge_index.is.null,merge_index.eq.0')
      .lt('created_at', ago(45 * MIN)).gt('created_at', ago(24 * 60 * MIN)),
    supabaseAdmin.from('pen_sent_emails').select('id', { count: 'exact', head: true })
      .eq('ok', false).gt('created_at', ago(60 * MIN)),
  ])
  if (unbriefed.error) return { name, ok: false, detail: `query failed: ${unbriefed.error.message}`, probe: false }
  const bad = [
    unbriefed.count ? `${unbriefed.count} recording(s) noted but no briefing email sent` : '',
    // Before its table exists the follow-up log reads as an error; that is not an outage.
    !failedSends.error && failedSends.count ? `${failedSends.count} follow-up email(s) failed in the last hour` : '',
  ].filter(Boolean)
  return { name, ok: !bad.length, detail: bad.join('; ') || 'all sent', probe: false }
}

async function reminders(): Promise<CheckResult> {
  const name = 'WhatsApp reminders'
  const [late, failed] = await Promise.all([
    supabaseAdmin.from('pen_reminders').select('id', { count: 'exact', head: true }).is('sent_at', null).lt('due_at', ago(5 * MIN)),
    supabaseAdmin.from('pen_reminders').select('id', { count: 'exact', head: true }).not('error', 'is', null).gt('due_at', ago(60 * MIN)),
  ])
  // Before its table exists there is nothing to check.
  if (late.error) return { name, ok: true, detail: 'not set up', probe: false }
  const bad = [
    late.count ? `${late.count} overdue by 5+ min (is the pg_cron job running?)` : '',
    !failed.error && failed.count ? `${failed.count} failed to send in the last hour` : '',
  ].filter(Boolean)
  return { name, ok: !bad.length, detail: bad.join('; ') || 'on time', probe: false }
}

/* ------------------------------------------------------------------- run */

type StateRow = { name: string; ok: boolean; fails: number; since: string; alerted_at: string | null; detail: string | null }

function alertTo(): string | null {
  const to = process.env.PEN_ALERT_EMAIL || process.env.PEN_SIGNUP_NOTIFY
  return to ? to.replace(/^.*<|>.*$/g, '') : null
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function notify(subject: string, lines: string[]): Promise<void> {
  const to = alertTo()
  if (!to) return
  const r = await sendEmailResult({
    to,
    subject,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:20px">` +
      lines.map((l) => `<div style="margin-bottom:6px">${esc(l)}</div>`).join('') +
      `</body></html>`,
    text: lines.join('\n'),
  })
  if (r.ok) return
  // Email itself is down. WhatsApp to the owner's linked phone, which Meta only delivers inside
  // the 24-hour window after their last message; better than nothing.
  const link = await getLinkByEmail(to).catch(() => null)
  if (link?.phone) await sendText(link.phone, `${subject}\n\n${lines.join('\n')}\n\n(email failed: ${r.error})`).catch(() => {})
}

export async function runHealth(): Promise<{ results: CheckResult[]; alerted: string[] }> {
  const checks = [meta, assembly, resend, anthropic, whatsappReplies, transcriptions, emails, reminders]
  const results = await Promise.all(
    checks.map((c) =>
      c().catch((e): CheckResult => ({ name: c.name, ok: false, detail: `check threw: ${(e as Error).message}`, probe: true })),
    ),
  )

  const { data: rows } = await supabaseAdmin.from('pen_health').select('*')
  const prev = new Map(((rows ?? []) as StateRow[]).map((r) => [r.name, r]))
  const now = new Date().toISOString()
  const down: string[] = []
  const back: string[] = []
  const upserts: StateRow[] = []

  for (const r of results) {
    const p = prev.get(r.name)
    const fails = r.ok ? 0 : (p?.fails ?? 0) + 1
    const failing = !r.ok && fails >= (r.probe ? 2 : 1)
    const wasAlerted = !!p?.alerted_at
    let alerted_at = p?.alerted_at ?? null
    if (failing && (!wasAlerted || Date.now() - new Date(alerted_at!).getTime() > REMIND_MS)) {
      down.push(`✗ ${r.name}: ${r.detail}${wasAlerted ? ` (still down since ${p!.since.slice(0, 16).replace('T', ' ')} UTC)` : ''}`)
      alerted_at = now
    }
    if (r.ok && wasAlerted) {
      back.push(`✓ ${r.name}: ${r.detail}`)
      alerted_at = null
    }
    upserts.push({
      name: r.name,
      ok: r.ok,
      fails,
      since: p && p.ok === r.ok ? p.since : now,
      alerted_at,
      detail: r.detail.slice(0, 500),
    })
  }

  await supabaseAdmin.from('pen_health').upsert(upserts.map((u) => ({ ...u, checked_at: now })), { onConflict: 'name' })

  const status = results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name}: ${r.detail}`)
  if (down.length) await notify(`Juno Pen DOWN: ${down.length === 1 ? down[0].slice(2, 80) : `${down.length} problems`}`, [...down, '', 'All checks:', ...status])
  if (back.length) await notify(`Juno Pen recovered: ${back.map((b) => b.slice(2).split(':')[0]).join(', ')}`, [...back, '', 'All checks:', ...status])
  return { results, alerted: [...down, ...back] }
}
