'use client'

import { useState } from 'react'
import { useCopy, useLang } from '../../LangContext'
import { fmtDate, type Copy } from '@/lib/pen/i18n'
import type { ReferralSummary } from '@/lib/pen/referrals'

const IV_EN = {
  title: 'Give a month, get a month',
  lede: 'Share your link with colleagues. Their first month is free, and you get a free month for every friend who pays.',
  yourLink: 'Your link',
  copy: 'Copy link',
  copied: 'Copied',
  whatsapp: 'Send on WhatsApp',
  share: (link: string) => `I use Juno Pen to record my client meetings and get the notes, to-dos and follow-up email written for me. Your first month is free with my link: ${link}`,
  paid: 'Friends who paid',
  earned: 'Free months earned',
  credited: 'Free months credited',
  toBonus: (n: number) => (n === 1 ? '1 more paying friend gets you a bonus month.' : `${n} more paying friends get you a bonus month.`),
  friendsTitle: 'Your friends',
  none: 'Nobody yet. When a friend signs up with your link, they show up here.',
  signedUp: 'Signed up. Counts when they make their first payment.',
  paidOn: (d: string, ready: string) => `Paid on ${d}. Your month is added by ${ready}.`,
  creditedOn: (m: number, d: string) => `${m === 1 ? '1 free month' : `${m} free months`} added on ${d}.`,
  rulesTitle: 'How it works',
  rules: [
    'Your friend’s first month is free when they sign up through your link.',
    'You get 1 free month for each friend who pays: 2 if they choose 6 months, 3 if they choose a year.',
    'Bonus month on your 3rd and 5th friend. 10 friends in a year makes your year free, the most there is.',
    'Your free months are added two weeks after your friend’s first payment and come off your next bills. They can’t be paid out.',
    'It doesn’t apply to the free-pen offer, to people who already had an account, or to your own other email addresses.',
  ],
  failed: 'Your referral link couldn’t be loaded. Try again in a minute.',
}

const IV: Copy<typeof IV_EN> = {
  en: IV_EN,
  es: {
    title: 'Regala un mes, gana un mes',
    lede: 'Comparte tu enlace con colegas. Su primer mes es gratis, y tú ganas un mes gratis por cada persona que pague.',
    yourLink: 'Tu enlace',
    copy: 'Copiar enlace',
    copied: 'Copiado',
    whatsapp: 'Enviar por WhatsApp',
    share: (link) => `Uso Juno Pen para grabar mis reuniones con clientes y tener las notas, pendientes y el correo de seguimiento listos. Con mi enlace tu primer mes es gratis: ${link}`,
    paid: 'Amigos que pagaron',
    earned: 'Meses gratis ganados',
    credited: 'Meses gratis abonados',
    toBonus: (n) => (n === 1 ? '1 amigo más que pague te da un mes extra.' : `${n} amigos más que paguen te dan un mes extra.`),
    friendsTitle: 'Tus amigos',
    none: 'Nadie todavía. Cuando alguien se registre con tu enlace, aparece aquí.',
    signedUp: 'Se registró. Cuenta cuando haga su primer pago.',
    paidOn: (d, ready) => `Pagó el ${d}. Tu mes se abona a más tardar el ${ready}.`,
    creditedOn: (m, d) => `${m === 1 ? '1 mes gratis abonado' : `${m} meses gratis abonados`} el ${d}.`,
    rulesTitle: 'Cómo funciona',
    rules: [
      'El primer mes de tu amigo es gratis si se registra con tu enlace.',
      'Ganas 1 mes gratis por cada amigo que pague: 2 si elige 6 meses, 3 si elige un año.',
      'Mes extra con tu 3.er y 5.º amigo. 10 amigos en un año te dan el año gratis, que es el máximo.',
      'Tus meses gratis se abonan dos semanas después del primer pago de tu amigo y se descuentan de tus próximos cobros. No se pagan en dinero.',
      'No aplica a la oferta del lápiz gratis, a quienes ya tuvieron cuenta, ni a tus otros correos.',
    ],
    failed: 'No se pudo cargar tu enlace. Inténtalo de nuevo en un minuto.',
  },
  pt: {
    title: 'Dê um mês, ganhe um mês',
    lede: 'Compartilhe seu link com colegas. O primeiro mês deles é grátis, e você ganha um mês grátis por cada pessoa que pagar.',
    yourLink: 'Seu link',
    copy: 'Copiar link',
    copied: 'Copiado',
    whatsapp: 'Enviar pelo WhatsApp',
    share: (link) => `Uso o Juno Pen para gravar minhas reuniões com clientes e já ter as notas, tarefas e o e-mail de follow-up prontos. Com meu link, seu primeiro mês é grátis: ${link}`,
    paid: 'Amigos que pagaram',
    earned: 'Meses grátis ganhos',
    credited: 'Meses grátis creditados',
    toBonus: (n) => (n === 1 ? 'Mais 1 amigo pagando e você ganha um mês extra.' : `Mais ${n} amigos pagando e você ganha um mês extra.`),
    friendsTitle: 'Seus amigos',
    none: 'Ninguém ainda. Quando alguém se cadastrar com seu link, aparece aqui.',
    signedUp: 'Cadastrou-se. Conta quando fizer o primeiro pagamento.',
    paidOn: (d, ready) => `Pagou em ${d}. Seu mês entra até ${ready}.`,
    creditedOn: (m, d) => `${m === 1 ? '1 mês grátis creditado' : `${m} meses grátis creditados`} em ${d}.`,
    rulesTitle: 'Como funciona',
    rules: [
      'O primeiro mês do seu amigo é grátis se ele se cadastrar pelo seu link.',
      'Você ganha 1 mês grátis por amigo que pagar: 2 se ele escolher 6 meses, 3 se escolher um ano.',
      'Mês extra no seu 3º e 5º amigo. 10 amigos em um ano deixam seu ano grátis, que é o máximo.',
      'Seus meses grátis entram duas semanas depois do primeiro pagamento do amigo e são descontados das próximas cobranças. Não viram dinheiro.',
      'Não vale para a oferta da caneta grátis, para quem já teve conta, nem para seus outros e-mails.',
    ],
    failed: 'Não foi possível carregar seu link. Tente de novo em um minuto.',
  },
}

export default function InvitePanel({ summary, link, error }: { summary: ReferralSummary | null; link: string | null; error: string | null }) {
  const T = useCopy(IV)
  const lang = useLang()
  const [copied, setCopied] = useState(false)
  const day = (d: string) => fmtDate(d, lang, { day: 'numeric', month: 'long' })

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      ;(document.getElementById('pen-invite-link') as HTMLInputElement | null)?.select()
    }
  }

  if (!summary || !link) return <div className="pen-su-err">{error ? T.failed : T.failed}</div>

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.title}</h2>
          <p className="pen-set-lede">{T.lede}</p>
        </div>
        <label className="pen-su-field">
          <span className="pen-label">{T.yourLink}</span>
          <input id="pen-invite-link" readOnly value={link} onFocus={(e) => e.target.select()} className="pen-invite-link" />
        </label>
        <div className="pen-set-actions">
          <button type="button" className="pen-btn pen-btn-accent pen-set-pay" onClick={copy}>{copied ? T.copied : T.copy}</button>
          <a className="pen-btn" href={`https://wa.me/?text=${encodeURIComponent(T.share(link))}`} target="_blank" rel="noreferrer">{T.whatsapp}</a>
        </div>
      </div>

      <div className="pen-set-card">
        <div className="pen-invite-stats">
          <div><strong>{summary.paid}</strong><span>{T.paid}</span></div>
          <div><strong>{summary.earned}</strong><span>{T.earned}</span></div>
          <div><strong>{summary.credited}</strong><span>{T.credited}</span></div>
        </div>
        {summary.toBonus !== null && <p className="pen-set-fine pen-invite-bonus">{T.toBonus(summary.toBonus)}</p>}
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.friendsTitle}</h2>
        </div>
        {summary.friends.length === 0 ? (
          <p className="pen-set-lede">{T.none}</p>
        ) : (
          <ul className="pen-invite-friends">
            {summary.friends.map((f, i) => (
              <li key={i} data-status={f.creditedAt ? 'credited' : f.status}>
                <strong>{f.name}</strong>
                <span>{f.creditedAt ? T.creditedOn(f.months, day(f.creditedAt)) : f.status === 'paid' ? T.paidOn(day(f.paidAt!), day(f.readyAt!)) : T.signedUp}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.rulesTitle}</h2>
        </div>
        <ul className="pen-invite-rules">
          {T.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </div>
  )
}
