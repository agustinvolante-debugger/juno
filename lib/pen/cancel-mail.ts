// The three emails around cancelling: it's scheduled, it took effect, and welcome back.
//
// Each is sent by whoever "claims" the state change (setCancelAt / deactivate / activate return
// true exactly once), so the in-app menu, Stripe's portal and webhook retries can't double up.

import { PEN_USD } from './plan'
import { sendEmailResult } from '@/lib/news/email'
import { userLang } from './user-lang'
import { KEEP_DAYS, lastFullDay } from './access'
import type { Lang } from './currency'

const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-CL', pt: 'pt-BR' }

function billingLink(): string {
  const base = (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
  return `${base}/settings/billing`
}

const shell = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"></head>` +
  `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.65;color:#16150F;padding:24px;max-width:560px">` +
  body +
  `</body></html>`

const link = (href: string, text: string) => `<p><a href="${href}" style="color:#0B6B44">${text}</a></p>`

const MAIL = {
  en: {
    scheduledSubject: 'Your Juno Pen plan is cancelled',
    scheduled: (last: string, del: string) =>
      `<p>Your plan is cancelled and no more plan payments will be charged. You keep full access through <strong>${last}</strong>.</p>` +
      `<p>After that your account turns read-only: you can still open every recording, note and transcript until ${del}, but you can’t add new recordings or use search, chat or WhatsApp. On ${del} the account and its recordings are deleted.</p>`,
    pen: '<p>The pen is yours to keep.</p>',
    penFee: (usd: number) => `<p>Your free pen came with a 3-month minimum, and your plan ends before it, so <strong>$${usd} is charged for the pen</strong> when the plan ends. The pen is yours to keep. Keep your plan past the minimum and nothing is charged.</p>`,
    penCharged: (usd: number) => `<p>Your plan ended before the free pen's 3-month minimum, so $${usd} was charged for the pen. It's yours to keep.</p>`,
    changed: 'Changed your mind? Keep your plan with one click',
    endedSubject: 'Your Juno Pen account is now read-only',
    ended: (del: string) =>
      `<p>Your plan has ended. Everything you recorded is still there to read: recordings, notes and transcripts.</p>` +
      `<p>New recordings, search, chat and WhatsApp are off. We keep the account until ${del}, then delete it.</p>`,
    reactivate: 'Reactivate your plan',
    backSubject: 'Welcome back to Juno Pen',
    back: '<p>Your plan is running again, and everything is back on: new recordings, search, chat and WhatsApp.</p>',
    reply: 'Questions? Just reply to this email.',
  },
  es: {
    scheduledSubject: 'Tu plan de Juno Pen está cancelado',
    scheduled: (last: string, del: string) =>
      `<p>Tu plan está cancelado y no se cobrarán más pagos del plan. Mantienes acceso completo hasta el <strong>${last}</strong>.</p>` +
      `<p>Después tu cuenta pasa a ser solo de lectura: podrás abrir todas tus grabaciones, notas y transcripciones hasta el ${del}, pero no agregar grabaciones nuevas ni usar la búsqueda, el chat o WhatsApp. El ${del} la cuenta y sus grabaciones se eliminan.</p>`,
    pen: '<p>El lápiz es tuyo, quédatelo.</p>',
    penFee: (usd: number) => `<p>Tu lápiz gratis venía con un mínimo de 3 meses, y tu plan termina antes, así que <strong>se cobran US$${usd} por el lápiz</strong> cuando termine el plan. El lápiz es tuyo. Si mantienes el plan después del mínimo, no se cobra nada.</p>`,
    penCharged: (usd: number) => `<p>Tu plan terminó antes del mínimo de 3 meses del lápiz gratis, así que se cobraron US$${usd} por el lápiz. Es tuyo.</p>`,
    changed: '¿Cambiaste de opinión? Mantén tu plan con un clic',
    endedSubject: 'Tu cuenta de Juno Pen ahora es solo de lectura',
    ended: (del: string) =>
      `<p>Tu plan terminó. Todo lo que grabaste sigue ahí para leer: grabaciones, notas y transcripciones.</p>` +
      `<p>Las grabaciones nuevas, la búsqueda, el chat y WhatsApp están apagados. Guardamos la cuenta hasta el ${del} y luego la eliminamos.</p>`,
    reactivate: 'Reactiva tu plan',
    backSubject: 'Qué bueno tenerte de vuelta en Juno Pen',
    back: '<p>Tu plan está activo de nuevo y todo volvió: grabaciones nuevas, búsqueda, chat y WhatsApp.</p>',
    reply: '¿Preguntas? Solo responde este correo.',
  },
  pt: {
    scheduledSubject: 'Seu plano do Juno Pen foi cancelado',
    scheduled: (last: string, del: string) =>
      `<p>Seu plano foi cancelado e nenhum outro pagamento do plano será cobrado. Você mantém acesso completo até <strong>${last}</strong>.</p>` +
      `<p>Depois disso a conta fica somente leitura: você ainda abre todas as gravações, notas e transcrições até ${del}, mas não pode adicionar gravações novas nem usar busca, chat ou WhatsApp. Em ${del} a conta e as gravações são excluídas.</p>`,
    pen: '<p>A caneta é sua, pode ficar com ela.</p>',
    penFee: (usd: number) => `<p>Sua caneta grátis veio com um mínimo de 3 meses, e seu plano termina antes disso, então <strong>US$${usd} serão cobrados pela caneta</strong> quando o plano terminar. A caneta é sua. Se mantiver o plano além do mínimo, nada é cobrado.</p>`,
    penCharged: (usd: number) => `<p>Seu plano terminou antes do mínimo de 3 meses da caneta grátis, então US$${usd} foram cobrados pela caneta. Ela é sua.</p>`,
    changed: 'Mudou de ideia? Mantenha seu plano com um clique',
    endedSubject: 'Sua conta do Juno Pen agora é somente leitura',
    ended: (del: string) =>
      `<p>Seu plano terminou. Tudo o que você gravou continua lá para ler: gravações, notas e transcrições.</p>` +
      `<p>Gravações novas, busca, chat e WhatsApp estão desligados. Guardamos a conta até ${del} e depois a excluímos.</p>`,
    reactivate: 'Reative seu plano',
    backSubject: 'Que bom ter você de volta no Juno Pen',
    back: '<p>Seu plano está ativo de novo e tudo voltou: gravações novas, busca, chat e WhatsApp.</p>',
    reply: 'Dúvidas? É só responder este e-mail.',
  },
} as const

const day = (d: Date | string, lang: Lang) => new Date(d).toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' })
const plusKeep = (iso: string) => new Date(new Date(iso).getTime() + KEEP_DAYS * 86_400_000)

/** Cancelled, effective `cancelAt`. Says the last full day, the deletion date, and how to undo it. */
export async function sendCancelScheduled(email: string, cancelAt: string, offer: string | null, penFee = false): Promise<void> {
  const lang = await userLang(email)
  const M = MAIL[lang]
  await sendEmailResult({
    to: email,
    subject: M.scheduledSubject,
    html: shell(
      M.scheduled(day(lastFullDay(cancelAt), lang), day(plusKeep(cancelAt), lang)) +
        (penFee ? M.penFee(PEN_USD) : offer === 'free-pen' || offer === 'posted-pen' ? M.pen : '') +
        link(billingLink(), M.changed) +
        `<p style="color:#514E45">${M.reply}</p>`,
    ),
  })
}

/** The plan ended just now: read-only, and when it will be deleted. */
export async function sendEnded(email: string, endedAt: string, penCharged = false): Promise<void> {
  const lang = await userLang(email)
  const M = MAIL[lang]
  await sendEmailResult({
    to: email,
    subject: M.endedSubject,
    html: shell(M.ended(day(plusKeep(endedAt), lang)) + (penCharged ? M.penCharged(PEN_USD) : '') + link(billingLink(), M.reactivate) + `<p style="color:#514E45">${M.reply}</p>`),
  })
}

export async function sendWelcomeBack(email: string): Promise<void> {
  const lang = await userLang(email)
  const M = MAIL[lang]
  await sendEmailResult({ to: email, subject: M.backSubject, html: shell(M.back + `<p style="color:#514E45">${M.reply}</p>`) })
}
