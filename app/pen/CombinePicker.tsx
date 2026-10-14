'use client'

// "Combine with…": join this recording with others by hand, for the cases the filename rule
// can't see (a meeting sent in two parts over WhatsApp, a renamed file, a long pause).
//
// Three steps in one small sheet: pick, order ("which came first", defaulting to recorded time),
// confirm. The join itself is the existing one (POST /api/pen/merge), passed in as onJoin, which
// rewrites the notes and opens the combined recording. Nothing is written before the last tap.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import type { PenSession } from '@/lib/pen/store'
import { startFromName } from '@/lib/pen/merge-detect'
import type { AppCopy } from './PenApp.copy'
import { LOCALE, type Lang } from '@/lib/pen/i18n'

function startMs(s: PenSession): number {
  return (startFromName(s.source_name) ?? new Date(s.recorded_at ?? s.created_at)).getTime()
}
function sameDay(a: number, b: number) {
  const x = new Date(a), y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}
function dur(sec: number | null | undefined): string {
  const s = Math.round(sec ?? 0)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
const titleOf = (s: PenSession, T: AppCopy) => s.title || s.client_name || s.source_name || T.untitled

export default function CombinePicker({ session, sessions, T, lang, onJoin, onClose }: {
  session: PenSession
  sessions: PenSession[]
  T: AppCopy
  lang: Lang
  /** The existing join (PenApp.joinRun): rewrites the notes, then opens the result. */
  onJoin: (ids: string[]) => Promise<boolean>
  onClose: () => void
}) {
  const [step, setStep] = useState<'pick' | 'order' | 'working'>('pick')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [order, setOrder] = useState<PenSession[]>([])
  const [host, setHost] = useState<Element | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'working') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, step])
  useEffect(() => { requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('input, button')?.focus()) }, [step, host])

  const here = startMs(session)
  const fmt = (ms: number) => new Date(ms).toLocaleString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  // Others that can be joined: transcribed, not already part of a meeting, not the sample.
  // Same day as this one first, then most recent.
  const options = useMemo(() => {
    const ok = sessions.filter((s) =>
      s.id !== session.id && !s.merge_group && s.source_channel !== 'sample' &&
      ((s.transcript?.utterances?.length ?? 0) > 0 || !!s.transcript?.text))
    return ok
      .map((s) => ({ s, t: startMs(s), day: sameDay(startMs(s), here) }))
      .sort((a, b) => Number(b.day) - Number(a.day) || b.t - a.t)
  }, [sessions, session.id, here])
  const shown = options.filter(({ s }) => !q.trim() || titleOf(s, T).toLowerCase().includes(q.trim().toLowerCase()))

  const toOrder = () => {
    const all = [session, ...options.filter((o) => picked.includes(o.s.id)).map((o) => o.s)]
    setOrder(all.sort((a, b) => startMs(a) - startMs(b)))
    setStep('order')
  }
  const move = (i: number, d: -1 | 1) => setOrder((xs) => {
    const ys = [...xs]
    const j = i + d
    if (j < 0 || j >= ys.length) return xs
    ;[ys[i], ys[j]] = [ys[j], ys[i]]
    return ys
  })
  const go = async () => {
    setStep('working')
    const ok = await onJoin(order.map((s) => s.id))
    if (ok) onClose()
    else setStep('order')
  }

  if (!host) return null
  return createPortal(
    <div className="pen-promo pen-combine" role="dialog" aria-modal="true" aria-labelledby="pen-combine-title">
      <div className="pen-promo-dim" onClick={() => step !== 'working' && onClose()} aria-hidden="true" />
      <div className="pen-promo-card pen-combine-card" ref={box}>
        <div className="pen-combine-head">
          <h2 id="pen-combine-title" className="pen-combine-h">{step === 'pick' ? T.combineTitle : T.combineOrderTitle}</h2>
          {step !== 'working' && (
            <button type="button" className="pen-combine-x" onClick={onClose} aria-label={T.close}><Icon name="plus" size={18} /></button>
          )}
        </div>

        {step === 'pick' && (
          <>
            <p className="pen-combine-this"><Icon name="recordings" size={15} />{titleOf(session, T)} · {fmt(here)}</p>
            <label className="pen-combine-search">
              <Icon name="search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.combineSearch} aria-label={T.combineSearch} />
            </label>
            <ul className="pen-combine-list">
              {!options.length && <li className="pen-combine-empty">{T.combineNone}</li>}
              {options.length > 0 && !shown.length && <li className="pen-combine-empty">{T.combineNoMatch}</li>}
              {shown.map(({ s, t, day }) => {
                const on = picked.includes(s.id)
                return (
                  <li key={s.id}>
                    <label className="pen-combine-row" data-on={on}>
                      <input type="checkbox" checked={on} onChange={() => setPicked((xs) => (on ? xs.filter((x) => x !== s.id) : [...xs, s.id]))} />
                      <span className="pen-combine-main">
                        <span className="pen-combine-title">{titleOf(s, T)}</span>
                        <span className="pen-combine-meta">{fmt(t)} · {dur(s.duration_sec)}</span>
                      </span>
                      {day && <span className="pen-catpill" data-tint="meet">{T.combineSameDay}</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="pen-combine-foot">
              <button type="button" className="pen-btn" onClick={onClose}>{T.cancel}</button>
              <button type="button" className="pen-btn pen-btn-primary" disabled={!picked.length} onClick={toOrder}>{T.combinePick(picked.length)}</button>
            </div>
          </>
        )}

        {(step === 'order' || step === 'working') && (
          <>
            <p className="pen-combine-sub">{T.combineOrderSub}</p>
            <ol className="pen-combine-order">
              {order.map((s, i) => (
                <li key={s.id} className="pen-combine-orow">
                  <span className="pen-combine-n">{i + 1}</span>
                  <span className="pen-combine-main">
                    <span className="pen-combine-title">{titleOf(s, T)}</span>
                    <span className="pen-combine-meta">{fmt(startMs(s))} · {dur(s.duration_sec)}</span>
                  </span>
                  <span className="pen-combine-moves">
                    <button type="button" className="pen-combine-mv" disabled={i === 0 || step === 'working'} onClick={() => move(i, -1)} aria-label={`${T.combineUp}: ${titleOf(s, T)}`}>↑</button>
                    <button type="button" className="pen-combine-mv" disabled={i === order.length - 1 || step === 'working'} onClick={() => move(i, 1)} aria-label={`${T.combineDown}: ${titleOf(s, T)}`}>↓</button>
                  </span>
                </li>
              ))}
            </ol>
            <p className="pen-combine-confirm" role="note">{T.combineConfirm}</p>
            {step === 'working' ? (
              <p className="pen-combine-working" role="status" aria-live="polite"><span className="pen-combine-spin" aria-hidden />{T.combineWorking}</p>
            ) : (
              <div className="pen-combine-foot">
                <button type="button" className="pen-btn" onClick={() => setStep('pick')}>{T.back}</button>
                <button type="button" className="pen-btn pen-btn-primary" onClick={() => void go()}>
                  <Icon name="link" size={15} />{T.combineGo(order.length)}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    host,
  )
}
