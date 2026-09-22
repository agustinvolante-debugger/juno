// Sending a briefing, independent of any request.
//
// This was inline in the briefing route, which was fine while a person pressed a button. The
// webhook has no request and no signed-in user, so the render and the send had to come out
// where both can reach them.

import type { PenSession } from './store'
import { buildBriefingHtml } from './briefing-html'
import { fmtDurServer } from './briefing-html-util'
import { sendEmailResult } from '@/lib/news/email'

export function renderBriefing(session: PenSession): string {
  const base = (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
  return buildBriefingHtml({
    notes: session.notes ?? {},
    title: session.title ?? session.source_name ?? 'Untitled recording',
    dateStr: new Date(session.recorded_at ?? session.created_at).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    clientName: session.client_name,
    durationStr: fmtDurServer(session.duration_sec ?? 0),
    appUrl: base || 'https://pen.tryjunoapp.com',
    actionDone: Array.isArray(session.action_done) ? session.action_done : [],
  })
}

export function hasSomethingToSay(session: PenSession): boolean {
  const n = session.notes ?? {}
  return Boolean(n.summary || n.actions?.length || n.missed?.length || n.open_questions?.length)
}

export async function sendBriefing(opts: {
  session: PenSession
  to: string[]
  replyTo?: string
  /** The recorder split this meeting and the parts have since been joined. Says so in the
   *  subject line, because a briefing for part one may already be sitting in the inbox. */
  parts?: number
}): Promise<{ ok: boolean; error?: string }> {
  const title = opts.session.title ?? opts.session.source_name ?? 'Untitled recording'
  const prefix = opts.parts && opts.parts > 1 ? `Full briefing (${opts.parts} parts) — ` : 'Briefing — '
  return sendEmailResult({
    to: opts.to,
    subject: `${prefix}${title}`,
    html: renderBriefing(opts.session),
    replyTo: opts.replyTo,
  })
}

/**
 * Sent when processing failed with nobody watching.
 *
 * Silence is the worst possible failure for a feature whose whole promise is "close the app,
 * we'll email you" — the user assumes their meeting is safe, and finds out days later that it
 * never existed. A short honest email costs nothing and keeps the recording findable.
 */
export async function sendFailureNotice(opts: {
  to: string
  sourceName: string
  reason: string
}): Promise<void> {
  const base = (process.env.PEN_PUBLIC_URL || 'https://pen.tryjunoapp.com').replace(/\/$/, '')
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  await sendEmailResult({
    to: opts.to,
    subject: `Pen couldn't write up ${opts.sourceName}`,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#16150F;padding:24px">` +
      `<p>Your recording <strong>${esc(opts.sourceName)}</strong> uploaded and transcribed, but the write-up failed.</p>` +
      `<p style="color:#514E45">${esc(opts.reason)}</p>` +
      `<p><strong>Nothing is lost.</strong> The recording and its transcript are saved. Open it and press ` +
      `&ldquo;Write the notes&rdquo; to try again.</p>` +
      `<p><a href="${base}" style="color:#2C5F7C">${base.replace(/^https?:\/\//, '')}</a></p>` +
      `</body></html>`,
  })
}
