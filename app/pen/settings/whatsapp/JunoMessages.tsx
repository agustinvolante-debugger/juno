'use client'

// Settings → WhatsApp & iMessage → "Messages from Juno" (critique 15 Oct, P1): the website's
// switch for the messages Juno sends first. The same setting as replying STOP / START in the
// chat (profile.proactive, lib/pen/proactive.ts setPrefs), so the two always agree:
//   · the master switch is STOP / START with no kind;
//   · turning one kind on while everything is off turns that one on and leaves the rest off.

import { useState } from 'react'
import { useCopy } from '../../LangContext'
import { postJson, errMessage } from '@/lib/pen/http'
import type { Copy } from '@/lib/pen/i18n'
import type { ProactiveKind } from '@/lib/pen/suggestions-types'

export type Prefs = { off: boolean; offKinds: ProactiveKind[] }

const KINDS: ProactiveKind[] = ['offers', 'meeting_brief', 'nudges', 'morning_brief', 'notion', 'pen_upload']

type KindCopy = Record<ProactiveKind, { label: string; desc: string }>

const JM_EN = {
  title: 'Messages from Juno',
  lede: 'Juno can write first when it can help. Every message is a question: nothing happens until you answer yes.',
  all: 'Let Juno message me first',
  rules: 'Between 7:30 and 20:00, at most 3 a day. You can also reply STOP on WhatsApp.',
  failed: 'That did not save. Try again.',
  kinds: {
    offers: { label: 'After an upload', desc: 'What Juno noticed in a recording: a meeting to add, something to be reminded of.' },
    meeting_brief: { label: 'Brief before a meeting', desc: 'The evening before: last time you spoke, and what each side still owes.' },
    nudges: { label: 'Follow-up nudges', desc: 'At 9:00, the to-dos due that day.' },
    morning_brief: { label: 'Morning brief', desc: 'Today’s meetings and to-dos, only when there is something.' },
    notion: { label: 'Notion page offers', desc: 'A prep page, plan or memo Juno could write for you in Notion.' },
    pen_upload: { label: 'Pen reminders', desc: 'If you haven’t uploaded from your Juno Pen in a week, a reminder to plug it in.' },
  } as KindCopy,
}

const JM: Copy<typeof JM_EN> = {
  en: JM_EN,
  es: {
    title: 'Mensajes de Juno',
    lede: 'Juno puede escribirte primero cuando te puede ayudar. Cada mensaje es una pregunta: no pasa nada hasta que respondas que sí.',
    all: 'Que Juno me escriba primero',
    rules: 'Entre las 7:30 y las 20:00, máximo 3 al día. También puedes responder STOP en WhatsApp.',
    failed: 'No se guardó. Inténtalo otra vez.',
    kinds: {
      offers: { label: 'Después de subir una grabación', desc: 'Lo que Juno notó: una reunión para agendar, algo que recordarte.' },
      meeting_brief: { label: 'Resumen antes de una reunión', desc: 'La tarde anterior: la última vez que hablaron y lo que cada uno debe.' },
      nudges: { label: 'Recordatorios de seguimiento', desc: 'A las 9:00, los pendientes que vencen ese día.' },
      morning_brief: { label: 'Resumen de la mañana', desc: 'Las reuniones y pendientes del día, solo si hay algo.' },
      notion: { label: 'Ofertas de páginas en Notion', desc: 'Una página de preparación, un plan o un memo que Juno podría escribir en Notion.' },
      pen_upload: { label: 'Recordatorios del lápiz', desc: 'Si no has subido nada de tu Juno Pen en una semana, un recordatorio para conectarlo.' },
    },
  },
  pt: {
    title: 'Mensagens do Juno',
    lede: 'O Juno pode escrever primeiro quando puder ajudar. Toda mensagem é uma pergunta: nada acontece até você responder sim.',
    all: 'Deixar o Juno me escrever primeiro',
    rules: 'Entre 7:30 e 20:00, no máximo 3 por dia. Você também pode responder STOP no WhatsApp.',
    failed: 'Não salvou. Tente de novo.',
    kinds: {
      offers: { label: 'Depois de enviar uma gravação', desc: 'O que o Juno percebeu: uma reunião para agendar, algo para lembrar.' },
      meeting_brief: { label: 'Resumo antes de uma reunião', desc: 'Na noite anterior: a última conversa e o que cada lado ainda deve.' },
      nudges: { label: 'Lembretes de acompanhamento', desc: 'Às 9:00, as tarefas que vencem no dia.' },
      morning_brief: { label: 'Resumo da manhã', desc: 'As reuniões e tarefas do dia, só quando houver algo.' },
      notion: { label: 'Ofertas de páginas no Notion', desc: 'Uma página de preparação, um plano ou um memorando que o Juno poderia escrever no Notion.' },
      pen_upload: { label: 'Lembretes da caneta', desc: 'Se você não enviou nada da sua Juno Pen em uma semana, um lembrete para conectá-la.' },
    },
  },
}

function Switch({ on, onChange, label, id, busy }: { on: boolean; onChange: (v: boolean) => void; label: string; id: string; busy: boolean }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={on} aria-label={label} className="pen-switch" data-on={on} disabled={busy} onClick={() => onChange(!on)}>
      <span className="pen-switch-knob" />
    </button>
  )
}

export default function JunoMessages({ initial }: { initial: Prefs }) {
  const T = useCopy(JM)
  const [prefs, setPrefs] = useState<Prefs>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(on: boolean, kind?: ProactiveKind) {
    setBusy(true)
    setErr(null)
    try {
      setPrefs(await postJson<Prefs>('/api/pen/proactive/prefs', kind ? { on, kind } : { on }))
    } catch (e) {
      setErr(errMessage(e, T.failed))
    } finally {
      setBusy(false)
    }
  }

  const kindOn = (k: ProactiveKind) => !prefs.off && !prefs.offKinds.includes(k)

  return (
    <div className="pen-set-card">
      <div className="pen-set-card-head">
        <h2 className="pen-set-h2">{T.title}</h2>
        <p className="pen-set-lede">{T.lede}</p>
      </div>
      {err && <div className="pen-su-err" role="alert">{err}</div>}
      <div className="pen-jm">
        <div className="pen-jm-row pen-jm-master">
          <label htmlFor="jm-all" className="pen-jm-text">
            <span className="pen-jm-label">{T.all}</span>
            <span className="pen-jm-desc">{T.rules}</span>
          </label>
          <Switch id="jm-all" on={!prefs.off} label={T.all} busy={busy} onChange={(v) => void save(v)} />
        </div>
        <ul className="pen-jm-list" data-dim={prefs.off}>
          {KINDS.map((k) => (
            <li key={k} className="pen-jm-row">
              <label htmlFor={`jm-${k}`} className="pen-jm-text">
                <span className="pen-jm-label">{T.kinds[k].label}</span>
                <span className="pen-jm-desc">{T.kinds[k].desc}</span>
              </label>
              <Switch id={`jm-${k}`} on={kindOn(k)} label={T.kinds[k].label} busy={busy} onChange={(v) => void save(v, k)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
