// When WhatsApp can't reach someone, tell them by email instead of leaving them talking to a
// silent bot.
//
// Meta accepts a reply and only later reports, in a "failed" status webhook, that it could not
// deliver it. Two of those errors mean the person will never hear back on this number:
//
//   130497  the business account can't message users in their country (found on 30 Sep: every
//           Brazilian number; Chile and the US work)
//   131026  undeliverable to this person, most often an outdated WhatsApp or unaccepted terms
//
// One email per number per error, not again within 30 days: the failures table already holds
// every earlier failure, so "was there one for this number before this one?" is the dedupe.
// Numbers not linked to an account have no email to write to and are left alone.

import { supabaseAdmin } from '@/lib/supabase'
import { sendEmailResult } from '@/lib/news/email'
import type { Lang } from '../currency'
import { userLang } from '../user-lang'
import { getLinkByPhone } from './store'
import type { FailedStatus } from './meta'

const NOTIFY_CODES = new Set([130497, 131026])
const QUIET_MS = 30 * 24 * 60 * 60 * 1000

type Copy = { subject: string; lead: string; country: string; device: string; meanwhile: string; other: string; open: string; reply: string }

const MAIL: Record<Lang, Copy> = {
  en: {
    subject: 'Juno Pen can’t reach you on WhatsApp',
    lead: 'We got your WhatsApp messages, but our replies can’t reach your number.',
    country: 'WhatsApp doesn’t let our account message numbers from your country yet. It isn’t anything on your phone.',
    device: 'WhatsApp couldn’t deliver our replies to your number. Updating WhatsApp and accepting its latest terms usually fixes it.',
    meanwhile: 'Everything else works: upload recordings, read your notes and ask about your calls in the app, and your briefings keep arriving by email.',
    other: 'If you have a number from another country, you can link that one instead in Settings, WhatsApp.',
    open: 'Open Juno Pen',
    reply: 'Questions? Just reply to this email.',
  },
  es: {
    subject: 'Juno Pen no puede responderte por WhatsApp',
    lead: 'Recibimos tus mensajes de WhatsApp, pero nuestras respuestas no llegan a tu número.',
    country: 'WhatsApp todavía no le permite a nuestra cuenta escribir a números de tu país. No es nada de tu teléfono.',
    device: 'WhatsApp no pudo entregar nuestras respuestas a tu número. Actualizar WhatsApp y aceptar sus últimos términos suele resolverlo.',
    meanwhile: 'Todo lo demás funciona: sube grabaciones, lee tus notas y pregunta por tus reuniones en la app, y los resúmenes te siguen llegando por correo.',
    other: 'Si tienes un número de otro país, puedes vincular ese en Configuración, WhatsApp.',
    open: 'Abrir Juno Pen',
    reply: '¿Preguntas? Solo responde este correo.',
  },
  pt: {
    subject: 'O Juno Pen não consegue responder você no WhatsApp',
    lead: 'Recebemos suas mensagens no WhatsApp, mas nossas respostas não chegam ao seu número.',
    country: 'O WhatsApp ainda não permite que nossa conta envie mensagens para números do seu país. Não é nada no seu celular.',
    device: 'O WhatsApp não conseguiu entregar nossas respostas ao seu número. Atualizar o WhatsApp e aceitar os termos mais recentes costuma resolver.',
    meanwhile: 'Todo o resto funciona: envie gravações, leia suas notas e pergunte sobre suas reuniões no app, e os resumos continuam chegando por e-mail.',
    other: 'Se você tem um número de outro país, pode vincular esse em Configurações, WhatsApp.',
    open: 'Abrir o Juno Pen',
    reply: 'Dúvidas? É só responder este e-mail.',
  },
}

/** Emails the owner of each unreachable number, once. Never throws. */
export async function notifyUnreachable(failed: FailedStatus[]): Promise<void> {
  // One per number and error, even if a webhook batch carries several failures for it.
  const seen = new Set<string>()
  for (const f of failed) {
    if (f.code == null || !NOTIFY_CODES.has(f.code) || !f.recipient) continue
    const key = `${f.recipient}:${f.code}`
    if (seen.has(key)) continue
    seen.add(key)
    try {
      await notifyOne(f)
    } catch (e) {
      console.warn(`pen whatsapp: unreachable notice for …${f.recipient.slice(-4)} failed: ${(e as Error).message}`)
    }
  }
}

async function notifyOne(f: FailedStatus): Promise<void> {
  // An earlier failure for this number and error within the quiet window means they were told.
  const { count, error } = await supabaseAdmin
    .from('pen_whatsapp_failures')
    .select('message_id', { count: 'exact', head: true })
    .eq('recipient', f.recipient)
    .eq('code', f.code)
    .lt('failed_at', f.at)
    .gt('failed_at', new Date(new Date(f.at).getTime() - QUIET_MS).toISOString())
  if (error) throw new Error(error.message)
  if (count) return

  const link = await getLinkByPhone(f.recipient)
  if (!link?.email) return

  const M = MAIL[await userLang(link.email)]
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  const why = f.code === 130497 ? M.country : M.device
  const r = await sendEmailResult({
    to: link.email,
    subject: M.subject,
    html:
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#16150F;padding:24px">` +
      `<p>${M.lead}</p>` +
      `<p style="color:#514E45">${why}</p>` +
      `<p style="color:#514E45">${M.meanwhile}</p>` +
      (f.code === 130497 ? `<p style="color:#514E45">${M.other}</p>` : '') +
      `<p><a href="${base}" style="color:#0B6B44">${M.open}</a></p>` +
      `<p style="color:#514E45">${M.reply}</p>` +
      `</body></html>`,
    text: [M.lead, why, M.meanwhile, f.code === 130497 ? M.other : '', `${M.open}: ${base}`, M.reply].filter(Boolean).join('\n\n'),
  })
  if (!r.ok) throw new Error(r.error ?? 'email not sent')
}
