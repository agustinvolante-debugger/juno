// An iPhone showing the Juno Pen chat in WhatsApp: a recording goes in, the briefing comes
// back, a question gets a cited answer. Drawn in HTML and CSS, not a screenshot, so it is ours
// to use, stays sharp at any size, and speaks the page's language.
//
// WhatsApp's own colours are used for the chat (the beige wallpaper, the green outgoing
// bubble, the blue ticks) so it reads as WhatsApp at a glance; everything around it stays in
// the Juno palette.

import type { Lang } from './landing-copy'

type Script = {
  status: string
  file: string
  fileMeta: string
  briefTitle: string
  brief: string[]
  question: string
  answer: string
  time: [string, string, string, string]
}

const SCRIPTS: Record<Lang, Script> = {
  en: {
    status: 'online',
    file: 'board-meeting.m4a',
    fileMeta: '42 min · 38 MB',
    briefTitle: 'Board meeting, 42 min',
    brief: ['Budget approved.', 'Peter sends the final proposal Thursday.', 'Nearly missed: nobody asked for the chairs quote.'],
    question: 'What did Peter say about the deadline?',
    answer: '"I can have it Thursday, but not before." [1]',
    time: ['10:42', '10:45', '10:46', '10:46'],
  },
  es: {
    status: 'en línea',
    file: 'reunion-directorio.m4a',
    fileMeta: '42 min · 38 MB',
    briefTitle: 'Directorio, 42 min',
    brief: ['Aprobaron el presupuesto.', 'Pedro manda la propuesta final el jueves.', 'Casi se pasa: nadie pidió la cotización de las sillas.'],
    question: '¿Qué dijo Pedro del plazo?',
    answer: '"El jueves la tengo, antes no alcanzo." [1]',
    time: ['10:42', '10:45', '10:46', '10:46'],
  },
  pt: {
    status: 'online',
    file: 'reuniao-diretoria.m4a',
    fileMeta: '42 min · 38 MB',
    briefTitle: 'Diretoria, 42 min',
    brief: ['Orçamento aprovado.', 'Pedro envia a proposta final na quinta.', 'Quase passou: ninguém pediu o orçamento das cadeiras.'],
    question: 'O que o Pedro disse sobre o prazo?',
    answer: '"Na quinta eu entrego, antes não dá." [1]',
    time: ['10:42', '10:45', '10:46', '10:46'],
  },
}

function Ticks() {
  return (
    <svg className="pen-ph-ticks" viewBox="0 0 18 11" aria-hidden>
      <path d="M1 6.2 4 9.2 10 2.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 9.2 13.2 2.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function PhoneChat({ lang }: { lang: Lang }) {
  const s = SCRIPTS[lang]
  return (
    <div className="pen-ph" role="img" aria-label="WhatsApp chat with Juno Pen">
      <div className="pen-ph-screen">
        <div className="pen-ph-island" />
        <div className="pen-ph-head">
          <span className="pen-ph-back">‹</span>
          <span className="pen-ph-av">j</span>
          <span className="pen-ph-who">
            <strong>Juno Pen</strong>
            <em>{s.status}</em>
          </span>
        </div>
        <div className="pen-ph-chat">
          <div className="pen-ph-msg pen-ph-me">
            <span className="pen-ph-file">
              <span className="pen-ph-fileicon">♪</span>
              <span>
                <strong>{s.file}</strong>
                <em>{s.fileMeta}</em>
              </span>
            </span>
            <span className="pen-ph-meta">{s.time[0]} <Ticks /></span>
          </div>
          <div className="pen-ph-msg pen-ph-them">
            <strong className="pen-ph-title">{s.briefTitle}</strong>
            {s.brief.map((b) => (
              <span key={b} className="pen-ph-line">{`• ${b}`}</span>
            ))}
            <span className="pen-ph-meta">{s.time[1]}</span>
          </div>
          <div className="pen-ph-msg pen-ph-me">
            <span>{s.question}</span>
            <span className="pen-ph-meta">{s.time[2]} <Ticks /></span>
          </div>
          <div className="pen-ph-msg pen-ph-them">
            <span>{s.answer}</span>
            <span className="pen-ph-meta">{s.time[3]}</span>
          </div>
        </div>
        <div className="pen-ph-input">
          <span className="pen-ph-field" />
          <span className="pen-ph-mic">●</span>
        </div>
      </div>
    </div>
  )
}
