'use client'

// Settings → Connections → "One-tap links open in": which mail app a draft's "Open in …" link is
// for (lib/pen/mail-pref.ts) and which calendar "add to calendar" opens (lib/pen/calendar-pref.ts).
// The same setting as telling Juno "I use Outlook" in the chat. Until someone picks, Juno guesses
// from their address and says so here.

import { useState } from 'react'
import { useCopy } from '../../LangContext'
import type { Copy } from '@/lib/pen/i18n'

export type MailChoice = 'gmail' | 'outlook' | 'yahoo' | 'other'
export type CalChoice = 'google' | 'apple' | 'outlook'

const L_EN = {
  title: 'One-tap links open in',
  lede: 'For anything Juno can’t do straight in your account, it sends a link that opens the app you use, ready to save or send.',
  mail: 'Email drafts',
  cal: 'Add to calendar',
  mailOpts: { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo Mail', other: 'My mail app' } as Record<MailChoice, string>,
  calOpts: { google: 'Google Calendar', apple: 'Apple Calendar', outlook: 'Outlook' } as Record<CalChoice, string>,
  guessed: 'Guessed from your address. Pick one to be sure.',
  unset: 'Not chosen yet: Juno offers a couple of options with each link.',
  saved: 'Saved',
  failed: 'That didn’t save. Try again.',
  chat: 'You can also tell Juno in the chat: “I use Outlook”.',
}

const L: Copy<typeof L_EN> = {
  en: L_EN,
  es: {
    title: 'Los links de un toque abren',
    lede: 'Para lo que Juno no puede hacer directo en tu cuenta, te manda un link que abre la app que usas, listo para guardar o enviar.',
    mail: 'Borradores de correo',
    cal: 'Agregar al calendario',
    mailOpts: { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo Mail', other: 'Mi app de correo' },
    calOpts: { google: 'Google Calendar', apple: 'Calendario de Apple', outlook: 'Outlook' },
    guessed: 'Lo adivinamos por tu dirección. Elige uno para estar seguro.',
    unset: 'Aún sin elegir: Juno te ofrece un par de opciones con cada link.',
    saved: 'Guardado',
    failed: 'No se guardó. Inténtalo de nuevo.',
    chat: 'También se lo puedes decir a Juno en el chat: “uso Outlook”.',
  },
  pt: {
    title: 'Os links de um toque abrem',
    lede: 'Para o que o Juno não consegue fazer direto na sua conta, ele manda um link que abre o app que você usa, pronto para salvar ou enviar.',
    mail: 'Rascunhos de e-mail',
    cal: 'Adicionar à agenda',
    mailOpts: { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo Mail', other: 'Meu app de e-mail' },
    calOpts: { google: 'Google Agenda', apple: 'Calendário da Apple', outlook: 'Outlook' },
    guessed: 'Adivinhamos pelo seu endereço. Escolha um para ter certeza.',
    unset: 'Ainda não escolhido: o Juno oferece algumas opções com cada link.',
    saved: 'Salvo',
    failed: 'Não salvou. Tente de novo.',
    chat: 'Você também pode dizer ao Juno no chat: “uso o Outlook”.',
  },
}

function Group<K extends string>({ gid, label, opts, value, guessed, onPick, T }: {
  gid: string
  label: string
  opts: Record<K, string>
  value: K | null
  guessed: boolean
  onPick: (k: K) => void
  T: typeof L_EN
}) {
  return (
    <div className="pen-lnk-group">
      <span className="pen-lnk-label" id={gid}>{label}</span>
      <div className="pen-set-chips" role="radiogroup" aria-labelledby={gid}>
        {(Object.keys(opts) as K[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} className="pen-set-chip" data-on={value === k} onClick={() => onPick(k)}>
            {opts[k]}
          </button>
        ))}
      </div>
      <span className="pen-lnk-hint">{value ? (guessed ? T.guessed : '') : T.unset}</span>
    </div>
  )
}

export default function LinkPrefs({ mail, mailGuessed, cal, calGuessed }: { mail: MailChoice | null; mailGuessed: boolean; cal: CalChoice | null; calGuessed: boolean }) {
  const T = useCopy(L)
  const [m, setM] = useState({ v: mail, guess: mailGuessed })
  const [c, setC] = useState({ v: cal, guess: calGuessed })
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(body: { mail?: MailChoice; calendar?: CalChoice }, undo: () => void) {
    setNote(null)
    try {
      const r = await fetch('/api/pen/link-apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error()
      setNote({ ok: true, text: T.saved })
    } catch {
      undo()
      setNote({ ok: false, text: T.failed })
    }
  }

  return (
    <div className="pen-lnk" id="links">
      <div className="pen-set-card-head">
        <h3 className="pen-lnk-title">{T.title}</h3>
        <p className="pen-set-lede">{T.lede}</p>
      </div>
      <Group gid="lnk-mail" label={T.mail} opts={T.mailOpts} value={m.v} guessed={m.guess} T={T} onPick={(k) => { const prev = m; setM({ v: k, guess: false }); void save({ mail: k }, () => setM(prev)) }} />
      <Group gid="lnk-cal" label={T.cal} opts={T.calOpts} value={c.v} guessed={c.guess} T={T} onPick={(k) => { const prev = c; setC({ v: k, guess: false }); void save({ calendar: k }, () => setC(prev)) }} />
      <p className="pen-set-fine pen-lnk-foot">
        <span>{T.chat}</span>
        {note && <span className={note.ok ? 'pen-set-saved' : 'pen-lnk-err'} role="status">{note.text}</span>}
      </p>
    </div>
  )
}
