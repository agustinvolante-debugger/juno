// Sending a briefing, independent of any request.
//
// This was inline in the briefing route, which was fine while a person pressed a button. The
// webhook has no request and no signed-in user, so the render and the send had to come out
// where both can reach them.

import type { PenSession } from './store'
import { buildBriefingHtml } from './briefing-html'
import { fmtDurServer } from './briefing-html-util'
import { sendEmailResult } from '@/lib/news/email'
import type { Lang } from './currency'
import { LOCALE } from './i18n'
import { userLang } from './user-lang'

const MAIL = {
  en: {
    untitled: 'Untitled recording',
    full: (n: number) => `Full briefing (${n} parts) — `,
    brief: 'Briefing — ',
    failSubject: (s: string) => `Juno Pen couldn't write up ${s}`,
    failLead: (s: string) => `Your recording <strong>${s}</strong> uploaded and transcribed, but the write-up failed.`,
    readySubject: (s: string) => `Your recording is ready: ${s}`,
    readyLead: (s: string) => `<strong>${s}</strong> is transcribed and in Juno Pen.`,
    readyBody: 'There were no decisions, to-dos or open questions to pull out of it, so there is no briefing this time. The full transcript is saved, and you can search it or ask about it anytime.',
    readyOpen: 'Open Juno Pen',
    failSafe: '<strong>Nothing is lost.</strong> The recording and its transcript are saved. Open it and press &ldquo;Write the notes&rdquo; to try again.',
  },
  es: {
    untitled: 'Grabación sin título',
    full: (n: number) => `Resumen completo (${n} partes) — `,
    brief: 'Resumen — ',
    failSubject: (s: string) => `Juno Pen no pudo escribir las notas de ${s}`,
    failLead: (s: string) => `Tu grabación <strong>${s}</strong> se subió y se transcribió, pero las notas fallaron.`,
    readySubject: (s: string) => `Tu grabación está lista: ${s}`,
    readyLead: (s: string) => `<strong>${s}</strong> está transcrita y en Juno Pen.`,
    readyBody: 'No había decisiones, tareas ni preguntas abiertas que sacar, así que esta vez no hay resumen. La transcripción completa quedó guardada y puedes buscar en ella o preguntar cuando quieras.',
    readyOpen: 'Abrir Juno Pen',
    failSafe: '<strong>No se perdió nada.</strong> La grabación y su transcripción están guardadas. Ábrela y presiona &ldquo;Escribir las notas&rdquo; para intentarlo otra vez.',
  },
  pt: {
    untitled: 'Gravação sem título',
    full: (n: number) => `Resumo completo (${n} partes) — `,
    brief: 'Resumo — ',
    failSubject: (s: string) => `O Juno Pen não conseguiu escrever as notas de ${s}`,
    failLead: (s: string) => `Sua gravação <strong>${s}</strong> foi enviada e transcrita, mas as notas falharam.`,
    readySubject: (s: string) => `Sua gravação está pronta: ${s}`,
    readyLead: (s: string) => `<strong>${s}</strong> está transcrita e no Juno Pen.`,
    readyBody: 'Não havia decisões, tarefas nem perguntas em aberto para tirar dela, então desta vez não há resumo. A transcrição completa está salva, e você pode buscar nela ou perguntar quando quiser.',
    readyOpen: 'Abrir o Juno Pen',
    failSafe: '<strong>Nada se perdeu.</strong> A gravação e a transcrição estão salvas. Abra e aperte &ldquo;Escrever as notas&rdquo; para tentar de novo.',
  },
} satisfies Record<Lang, unknown>

export function renderBriefing(session: PenSession, lang: Lang = 'en'): string {
  const base = (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
  return buildBriefingHtml({
    notes: session.notes ?? {},
    title: session.title ?? session.source_name ?? MAIL[lang].untitled,
    dateStr: new Date(session.recorded_at ?? session.created_at).toLocaleString(LOCALE[lang], {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    clientName: session.client_name,
    durationStr: fmtDurServer(session.duration_sec ?? 0),
    appUrl: base || 'https://pen.tryjunoapp.com',
    actionDone: Array.isArray(session.action_done) ? session.action_done : [],
    lang,
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
  /** Defaults to the account's App language. */
  lang?: Lang
}): Promise<{ ok: boolean; error?: string }> {
  const lang = opts.lang ?? (await userLang(opts.session.user_email))
  const M = MAIL[lang]
  const title = opts.session.title ?? opts.session.source_name ?? M.untitled
  const prefix = opts.parts && opts.parts > 1 ? M.full(opts.parts) : M.brief
  return sendEmailResult({
    to: opts.to,
    subject: `${prefix}${title}`,
    html: renderBriefing(opts.session, lang),
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
  const M = MAIL[await userLang(opts.to)]
  const base = (process.env.PEN_PUBLIC_URL || 'https://pen.tryjunoapp.com').replace(/\/$/, '')
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  await sendEmailResult({
    to: opts.to,
    subject: M.failSubject(opts.sourceName),
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#16150F;padding:24px">` +
      `<p>${M.failLead(esc(opts.sourceName))}</p>` +
      `<p style="color:#514E45">${esc(opts.reason)}</p>` +
      `<p>${M.failSafe}</p>` +
      `<p><a href="${base}" style="color:#2C5F7C">${base.replace(/^https?:\/\//, '')}</a></p>` +
      `</body></html>`,
  })
}

/**
 * The short email for a recording with nothing to brief: no summary, to-dos, near-misses or open
 * questions. The upload screen promises an email when it's ready, so one always goes out.
 */
export async function sendReadyNotice(opts: { to: string; title: string }): Promise<{ ok: boolean; error?: string }> {
  const M = MAIL[await userLang(opts.to)]
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return sendEmailResult({
    to: opts.to,
    subject: M.readySubject(opts.title),
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#16150F;padding:24px">` +
      `<p>${M.readyLead(esc(opts.title))}</p>` +
      `<p style="color:#514E45">${M.readyBody}</p>` +
      `<p><a href="${base}" style="color:#0B6B44">${M.readyOpen}</a></p>` +
      `</body></html>`,
  })
}

/**
 * The one email a recording gets once its first notes exist: the briefing, or the short
 * "ready" one when there's nothing to brief. Never twice: briefing_sent_at is the record, and a
 * "Redo notes" later finds it set. The tail part of a joined meeting sends nothing; the
 * meeting's first part carries the combined briefing.
 */
export async function briefOnce(opts: { email: string; session: PenSession; parts?: number }): Promise<'sent' | 'skipped' | 'failed'> {
  const s = opts.session
  if (s.briefing_sent_at || (s.merge_group && (s.merge_index ?? 0) > 0)) return 'skipped'
  const r = hasSomethingToSay(s)
    ? await sendBriefing({ session: s, to: [opts.email], replyTo: opts.email, parts: opts.parts ?? 1 })
    : await sendReadyNotice({ to: opts.email, title: s.title || s.source_name || 'your recording' })
  if (!r.ok) {
    console.warn(`pen: briefing not sent for ${s.id}: ${r.error}`)
    return 'failed'
  }
  const { updateSession } = await import('./store')
  await updateSession(s.id, { briefing_sent_at: new Date().toISOString() })
  return 'sent'
}
