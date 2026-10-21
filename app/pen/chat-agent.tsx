'use client'

// The web chat's half of the one assistant (22 Oct): what an assistant turn can carry besides
// text (lib/pen/agent-io.ts AgentParts) and how each part reads here.
//
//   RichText       light markdown, built as React nodes (never HTML): **bold**, *italic*,
//                  bullets, numbered lists, line breaks, bare links, and the [n] citations.
//   ProgressSteps  what the assistant is doing while it works, one calm line per tool.
//   DraftCard      an email waiting for Send: the envelope, a body preview, Send / Open / Copy.
//   AskCard        a yes/no the assistant needs before it acts (only live on the latest turn).
//   LinkCards      what the turn made or opened; a Connect link is a primary button.
//   Undo           a quiet text button on a turn that can be taken back.
//
// Buttons never act on their own: ChatView sends the press to the route as an `action`.

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import type { AgentAsk, AgentDraft, AgentLink } from '@/lib/pen/agent-io'
import type { Copy } from '@/lib/pen/i18n'
import Icon, { type IconName } from './Icon'
import { useCopy } from './LangContext'

const AG_EN = {
  from: 'From',
  to: 'To',
  cc: 'Cc',
  subject: 'Subject',
  draft: 'Email draft',
  showAll: 'Show the whole email',
  showLess: 'Show less',
  send: 'Send',
  sending: 'Sending…',
  sent: 'Sent',
  openGmail: 'Open in Gmail',
  openOutlook: 'Open in Outlook',
  openMail: 'Open in your email',
  copy: 'Copy',
  copied: 'Copied',
  yes: 'Yes',
  no: 'No',
  saidYes: 'You said yes',
  saidNo: 'You said no',
  undo: 'Undo',
  undoing: 'Undoing…',
  undone: 'Undone',
  kinds: { doc: 'Google Doc', sheet: 'Google Sheet', notion: 'Notion page', event: 'Calendar event', recording: 'Recording', connect: 'Connect', other: 'Link' } as Record<AgentLink['kind'], string>,
  opensNew: '(opens in a new tab)',
}

export const AG: Copy<typeof AG_EN> = {
  en: AG_EN,
  es: {
    from: 'De',
    to: 'Para',
    cc: 'Cc',
    subject: 'Asunto',
    draft: 'Borrador de correo',
    showAll: 'Ver el correo completo',
    showLess: 'Ver menos',
    send: 'Enviar',
    sending: 'Enviando…',
    sent: 'Enviado',
    openGmail: 'Abrir en Gmail',
    openOutlook: 'Abrir en Outlook',
    openMail: 'Abrir en tu correo',
    copy: 'Copiar',
    copied: 'Copiado',
    yes: 'Sí',
    no: 'No',
    saidYes: 'Dijiste que sí',
    saidNo: 'Dijiste que no',
    undo: 'Deshacer',
    undoing: 'Deshaciendo…',
    undone: 'Deshecho',
    kinds: { doc: 'Documento de Google', sheet: 'Hoja de Google', notion: 'Página de Notion', event: 'Evento del calendario', recording: 'Grabación', connect: 'Conectar', other: 'Enlace' },
    opensNew: '(se abre en otra pestaña)',
  },
  pt: {
    from: 'De',
    to: 'Para',
    cc: 'Cc',
    subject: 'Assunto',
    draft: 'Rascunho de e-mail',
    showAll: 'Ver o e-mail inteiro',
    showLess: 'Ver menos',
    send: 'Enviar',
    sending: 'Enviando…',
    sent: 'Enviado',
    openGmail: 'Abrir no Gmail',
    openOutlook: 'Abrir no Outlook',
    openMail: 'Abrir no seu e-mail',
    copy: 'Copiar',
    copied: 'Copiado',
    yes: 'Sim',
    no: 'Não',
    saidYes: 'Você disse sim',
    saidNo: 'Você disse não',
    undo: 'Desfazer',
    undoing: 'Desfazendo…',
    undone: 'Desfeito',
    kinds: { doc: 'Documento Google', sheet: 'Planilha Google', notion: 'Página do Notion', event: 'Evento da agenda', recording: 'Gravação', connect: 'Conectar', other: 'Link' },
    opensNew: '(abre em outra aba)',
  },
}

/* ------------------------------------------------------------------------- rich text */

export type CiteFn = (marker: number) => ReactNode

// [n] · **bold** · *one-star* · a bare link. Order matters: ** is tried before *.
const INLINE = /(\[\d+\])|\*\*([^*\n]+?)\*\*|\*([^*\s](?:[^*\n]*?[^*\s])?)\*|(https?:\/\/[^\s<>"]+)/g
const TRAIL = /[).,;:!?'"’”\]]+$/

function shortUrl(u: string): string {
  const s = u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  return s.length > 44 ? `${s.slice(0, 42)}…` : s
}

function inline(text: string, oneStarBold: boolean, cite: CiteFn, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}.${n++}`
    if (m[1]) {
      const marker = Number(m[1].slice(1, -1))
      out.push(<Fragment key={k}>{cite(marker)}</Fragment>)
    } else if (m[2]) {
      out.push(<strong key={k}>{inline(m[2], oneStarBold, cite, k)}</strong>)
    } else if (m[3]) {
      // WhatsApp's *bold*: the same assistant writes for WhatsApp too. When a message uses
      // markdown's ** anywhere, one star is italic; otherwise it is WhatsApp bold.
      out.push(oneStarBold ? <strong key={k}>{inline(m[3], oneStarBold, cite, k)}</strong> : <em key={k}>{inline(m[3], oneStarBold, cite, k)}</em>)
    } else if (m[4]) {
      const trail = TRAIL.exec(m[4])?.[0] ?? ''
      const url = trail ? m[4].slice(0, -trail.length) : m[4]
      out.push(
        <a key={k} className="pen-md-link" href={url} target="_blank" rel="noopener noreferrer">{shortUrl(url)}</a>,
      )
      if (trail) out.push(trail)
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block = { k: 'p'; lines: string[] } | { k: 'ul'; items: string[] } | { k: 'ol'; items: string[]; start: number }

const BULLET = /^\s*(?:[-•–]|\*(?=\s))\s+(.*)$/
const NUMBER = /^\s*(\d{1,3})[.)]\s+(.*)$/

function blocks(text: string): Block[] {
  const out: Block[] = []
  let cur: Block | null = null
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) { cur = null; continue }
    const b = BULLET.exec(line)
    const o = !b && NUMBER.exec(line)
    if (b) {
      if (cur?.k !== 'ul') out.push((cur = { k: 'ul', items: [] }))
      cur.items.push(b[1])
    } else if (o) {
      if (cur?.k !== 'ol') out.push((cur = { k: 'ol', items: [], start: Number(o[1]) }))
      cur.items.push(o[2])
    } else if ((cur?.k === 'ul' || cur?.k === 'ol') && /^\s{2,}\S/.test(raw)) {
      // An indented line under a list item continues that item.
      cur.items[cur.items.length - 1] += ` ${line.trim()}`
    } else {
      if (cur?.k !== 'p') out.push((cur = { k: 'p', lines: [] }))
      cur.lines.push(line)
    }
  }
  return out
}

/** Markdown-light, as React nodes. `cite` draws a [n] marker (or nothing for an unknown one). */
export function RichText({ text, cite, className }: { text: string; cite?: CiteFn; className?: string }) {
  const c: CiteFn = cite ?? (() => null)
  const oneStarBold = !text.includes('**')
  const bs = useMemo(() => blocks(text), [text])
  return (
    <div className={className ? `pen-md ${className}` : 'pen-md'}>
      {bs.map((b, i) =>
        b.k === 'p' ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l, oneStarBold, c, `${i}.${j}`)}
              </span>
            ))}
          </p>
        ) : b.k === 'ul' ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, oneStarBold, c, `${i}.${j}`)}</li>)}</ul>
        ) : (
          <ol key={i} start={b.start}>{b.items.map((it, j) => <li key={j}>{inline(it, oneStarBold, c, `${i}.${j}`)}</li>)}</ol>
        ),
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- progress */

/** What the assistant is doing, newest last; the last line carries the spinner. */
export function ProgressSteps({ steps, fallback }: { steps: string[]; fallback: string }) {
  const list = steps.length ? steps : [fallback]
  return (
    <div className="pen-steps" role="status" aria-live="polite">
      <ol>
        {list.map((s, i) => {
          const current = i === list.length - 1
          return (
            <li key={`${i}-${s}`} data-current={current}>
              <span className="pen-steps-mark" aria-hidden>
                {current ? <span className="pen-spin" /> : <Icon name="check" size={14} />}
              </span>
              <span>{s}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ----------------------------------------------------------------------------- draft */

export type ActState = 'busy' | 'done' | undefined

function composeLabel(url: string, A: typeof AG_EN): string {
  if (/mail\.google\./.test(url)) return A.openGmail
  if (/outlook\.(live|office|office365)\.com|outlook\.com/.test(url)) return A.openOutlook
  return A.openMail
}

export function DraftCard({
  draft,
  state,
  canSend,
  onSend,
}: {
  draft: AgentDraft
  state: ActState
  /** The newest draft in the thread, nothing in flight: the server holds only that one. */
  canSend: boolean
  onSend: () => void
}) {
  const A = useCopy(AG)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const long = draft.body.split('\n').length > 6 || draft.body.length > 360
  const compose = draft.composeUrl || draft.mailtoUrl || null
  const copy = async () => {
    const head = [draft.to.length ? `${A.to}: ${draft.to.join(', ')}` : '', draft.cc?.length ? `${A.cc}: ${draft.cc.join(', ')}` : '', `${A.subject}: ${draft.subject}`]
    try {
      await navigator.clipboard.writeText(`${head.filter(Boolean).join('\n')}\n\n${draft.body}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked: nothing to say that would help */ }
  }
  return (
    <section className="pen-draft" aria-label={A.draft} data-sent={state === 'done'}>
      <dl className="pen-draft-env">
        {draft.from && (<><dt>{A.from}</dt><dd>{draft.from}</dd></>)}
        <dt>{A.to}</dt><dd>{draft.to.join(', ')}</dd>
        {!!draft.cc?.length && (<><dt>{A.cc}</dt><dd>{draft.cc.join(', ')}</dd></>)}
        <dt>{A.subject}</dt><dd className="pen-draft-subj">{draft.subject}</dd>
      </dl>
      <div className="pen-draft-body" data-open={open || !long}>
        {draft.body}
      </div>
      {long && (
        <button type="button" className="pen-draft-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? A.showLess : A.showAll}
        </button>
      )}
      <div className="pen-agent-row">
        {state === 'done' ? (
          <span className="pen-agent-done"><Icon name="check" size={16} />{A.sent}</span>
        ) : (
          canSend && (
            <button type="button" className="pen-btn pen-btn-accent pen-agent-btn" disabled={state === 'busy'} onClick={onSend}>
              <Icon name="mail" size={16} />{state === 'busy' ? A.sending : A.send}
            </button>
          )
        )}
        {compose && state !== 'done' && (
          <a className="pen-btn pen-agent-btn" href={compose} target="_blank" rel="noopener noreferrer">
            {composeLabel(compose, A)}
          </a>
        )}
        <button type="button" className="pen-btn pen-agent-btn" onClick={() => void copy()} aria-live="polite">
          {copied ? A.copied : A.copy}
        </button>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------------------- ask */

export function AskCard({
  ask,
  live,
  answer,
  onAnswer,
  cite,
}: {
  ask: AgentAsk
  /** The latest turn and nothing in flight: the only place a yes/no still means something. */
  live: boolean
  /** What was pressed here, this visit. */
  answer: boolean | undefined
  onAnswer: (yes: boolean) => void
  cite?: CiteFn
}) {
  const A = useCopy(AG)
  const answered = answer !== undefined
  return (
    <section className="pen-ask" data-live={live && !answered}>
      <span className="pen-ask-icon" aria-hidden><Icon name="question" size={18} /></span>
      <div className="pen-ask-main">
        <RichText text={ask.summary} cite={cite} className="pen-ask-text" />
        {answered ? (
          <span className="pen-ask-said">{answer ? A.saidYes : A.saidNo}</span>
        ) : live ? (
          <div className="pen-agent-row">
            <button type="button" className="pen-btn pen-btn-accent pen-agent-btn pen-ask-yes" onClick={() => onAnswer(true)}>{A.yes}</button>
            <button type="button" className="pen-btn pen-agent-btn" onClick={() => onAnswer(false)}>{A.no}</button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------------------- links */

const LINK_ICON: Record<AgentLink['kind'], IconName | 'sheet' | 'notion'> = {
  doc: 'doc', sheet: 'sheet', notion: 'notion', event: 'calendar', connect: 'link', recording: 'recordings', other: 'link',
}

/** Two glyphs the shared set lacks, drawn on the same 20px grid and stroke as Icon.tsx. */
function LinkGlyph({ kind }: { kind: AgentLink['kind'] }) {
  const name = LINK_ICON[kind]
  if (name === 'sheet' || name === 'notion') {
    return (
      <svg width={18} height={18} viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        {name === 'sheet' ? (
          <><rect x="3.4" y="3.4" width="13.2" height="13.2" rx="1.8" /><path d="M3.4 8h13.2M3.4 12.3h13.2M8.4 8v8.6" /></>
        ) : (
          <><rect x="3.4" y="3.4" width="13.2" height="13.2" rx="2.4" /><path d="M7.4 13.6V6.6l5.2 7V6.4" /></>
        )}
      </svg>
    )
  }
  return <Icon name={name} size={18} />
}

/** The recording a link points at, when it is one of ours (/pen?open=<id>). */
function recordingId(url: string): string | null {
  return /[?&]open=([^&#]+)/.exec(url)?.[1] ?? /\/pen\/(?:sessions?|recordings?)\/([^/?#]+)/.exec(url)?.[1] ?? null
}

function external(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  try { return new URL(url).origin !== window.location.origin } catch { return true }
}

export function LinkCards({ links, onOpenRecording }: { links: AgentLink[]; onOpenRecording: (id: string) => void }) {
  const A = useCopy(AG)
  const connect = links.filter((l) => l.kind === 'connect')
  const rest = links.filter((l) => l.kind !== 'connect')
  return (
    <div className="pen-links">
      {connect.length > 0 && (
        <div className="pen-agent-row">
          {connect.map((l) => (
            <a key={l.url} className="pen-btn pen-btn-accent pen-agent-btn" href={l.url} {...(external(l.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              <Icon name="link" size={16} />{l.title}
            </a>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <ul className="pen-links-list">
          {rest.map((l, i) => {
            const rid = l.kind === 'recording' ? recordingId(l.url) : null
            const inner = (
              <>
                <span className="pen-link-ic" data-kind={l.kind}><LinkGlyph kind={l.kind} /></span>
                <span className="pen-link-txt">
                  <strong>{l.title}</strong>
                  <em>{A.kinds[l.kind] ?? A.kinds.other}</em>
                </span>
                <Icon name="chevron" size={15} className="pen-link-go" />
              </>
            )
            return (
              <li key={`${l.url}-${i}`}>
                {rid ? (
                  <button type="button" className="pen-link" onClick={() => onOpenRecording(rid)}>{inner}</button>
                ) : external(l.url) ? (
                  <a className="pen-link" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`${l.title}, ${A.kinds[l.kind] ?? A.kinds.other} ${A.opensNew}`}>{inner}</a>
                ) : (
                  <a className="pen-link" href={l.url}>{inner}</a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------------ undo */

export function UndoButton({ state, disabled, onUndo }: { state: ActState; disabled: boolean; onUndo: () => void }) {
  const A = useCopy(AG)
  if (state === 'done') return <span className="pen-undo pen-undo-done"><Icon name="check" size={14} />{A.undone}</span>
  return (
    <button type="button" className="pen-undo" disabled={disabled || state === 'busy'} onClick={onUndo}>
      <Icon name="back" size={14} />{state === 'busy' ? A.undoing : A.undo}
    </button>
  )
}
