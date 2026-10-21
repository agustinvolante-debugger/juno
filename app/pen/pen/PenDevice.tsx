'use client'

// The Juno Pen drive in the app (21 Oct), for people who don't think in files and folders:
//   · PenCard: Home's "Your Juno Pen is connected · 3 new recordings · 1 h 20 m" with one big
//     Upload, or "click to connect" when the browser wants a click before it lets Juno in again;
//   · the picture guide the first time (four steps, then the folder picker);
//   · after an upload, freeing up space on the pen: asked once, then remembered;
//   · on phones and Safari, a short how-to for deleting from the pen by hand.
// usePenFlow ties these to usePenDrive and to PenApp's existing upload pipeline (it only hands
// PenApp the files; PenApp uploads them as it does any other file).

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../Icon'
import { useCopy } from '../LangContext'
import type { Lang } from '@/lib/pen/i18n'
import { PEN_DEVICE_COPY, penDur, type PenDeviceCopy } from './pen-device.copy'
import { canUsePenDrive, penMock } from './pen-drive'
import { fetchPenSettings, putPenSettings, type PenDrive } from './usePenDrive'

/* ------------------------------------------------------------------ dialog */

/** A centred dialog on a computer, a bottom sheet on a phone. Esc and the backdrop close it. */
function PenDialog({ title, onClose, children, closeLabel, wide }: { title: string; onClose: () => void; children: React.ReactNode; closeLabel: string; wide?: boolean }) {
  const [host, setHost] = useState<Element | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key !== 'Tab' || !panel.current) return
      const f = panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])')
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); back?.focus?.() }
  }, [])
  useEffect(() => { if (host) panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }) }, [host])
  if (!host) return null
  return createPortal(
    <div className="pdv-wrap" onClick={onClose}>
      <div ref={panel} className="pdv-dialog" data-wide={wide ? 'true' : undefined} role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pdv-x" onClick={onClose} aria-label={closeLabel}>
          <Icon name="close" size={18} />
        </button>
        <h2 id={id} className="pdv-title">{title}</h2>
        {children}
      </div>
    </div>,
    host,
  )
}

/* ----------------------------------------------------------- picture guide */

// Four small drawings, one stroke weight, the one blue for "this is the thing to click".
function StepArt({ i }: { i: number }) {
  const common = { viewBox: '0 0 120 76', className: 'pdv-art', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (i === 0) return (
    <svg {...common}>
      <rect x="22" y="10" width="62" height="40" rx="3" />
      <path d="M14 56h78l-6 8H20Z" />
      <path d="M92 59h8" />
      <rect x="100" y="54" width="16" height="10" rx="5" className="pdv-art-hi" />
      <path d="M45 30l6 6 10-11" className="pdv-art-ok" />
    </svg>
  )
  if (i === 1) return (
    <svg {...common}>
      <rect x="18" y="24" width="84" height="26" rx="13" className="pdv-art-fill" />
      <rect x="31" y="33" width="14" height="8" rx="4" stroke="#fff" />
      <path d="M52 37h36" stroke="#fff" strokeWidth="3" />
      <path d="M84 44l0 20 5-5 4 8 4-2-4-8h7Z" className="pdv-art-cursor" />
    </svg>
  )
  if (i === 2) return (
    <svg {...common}>
      <rect x="8" y="8" width="104" height="60" rx="5" />
      <path d="M40 8v60" />
      <rect x="12" y="24" width="24" height="10" rx="3" className="pdv-art-fill" />
      <text x="24" y="31.6" textAnchor="middle" className="pdv-art-text">JUNO</text>
      <path d="M14 44h18M14 52h14M48 20h22M48 30h30M48 40h26" className="pdv-art-dim" />
      <rect x="84" y="54" width="22" height="9" rx="4.5" className="pdv-art-fill" />
    </svg>
  )
  return (
    <svg {...common}>
      <rect x="14" y="10" width="92" height="56" rx="6" />
      <path d="M26 24h44M26 32h56" className="pdv-art-dim" />
      <rect x="28" y="46" width="30" height="11" rx="5.5" />
      <rect x="64" y="46" width="30" height="11" rx="5.5" className="pdv-art-fill" />
      <path d="M88 52l0 16 4-4 3 6 3-1.5-3-6h5.6Z" className="pdv-art-cursor" />
    </svg>
  )
}

function PenGuide({ T, wrong, busy, onConnect, onFiles, onClose }: { T: PenDeviceCopy; wrong: boolean; busy: boolean; onConnect: () => void; onFiles: () => void; onClose: () => void }) {
  return (
    <PenDialog title={T.guideTitle} onClose={onClose} closeLabel={T.close} wide>
      <p className="pdv-lede">{T.guideLede}</p>
      <ol className="pdv-steps">
        {T.steps.map((s, i) => (
          <li key={i} className="pdv-step">
            <span className="pdv-step-art"><StepArt i={i} /></span>
            <span className="pdv-step-n" aria-hidden="true">{i + 1}</span>
            <span className="pdv-step-t">{s}</span>
          </li>
        ))}
      </ol>
      {wrong && <p className="pdv-err" role="alert">{T.guideWrong}</p>}
      <div className="pdv-acts">
        <button type="button" className="pen-btn pen-btn-accent pdv-big" onClick={onConnect} disabled={busy} data-autofocus>
          <Icon name="usb" size={20} />{T.guideGo}
        </button>
        <button type="button" className="pdv-link" onClick={onFiles}>{T.guideFiles}</button>
      </div>
      <p className="pdv-fine">{T.guideWhy}</p>
    </PenDialog>
  )
}

/* ---------------------------------------------------------------- the card */

export function PenCard({ flow, compact }: { flow: PenFlow; compact?: boolean }) {
  const T = useCopy(PEN_DEVICE_COPY)
  const { drive } = flow
  if (drive.state === 'prompt') {
    return (
      <section className="pdv-card" data-state="prompt" data-compact={compact ? 'true' : undefined} aria-label={T.promptTitle}>
        <span className="pdv-mark" aria-hidden="true"><Icon name="usb" size={24} /></span>
        <div className="pdv-card-text">
          <h2 className="pdv-card-title">{T.promptTitle}</h2>
          <p className="pdv-card-sub">{T.promptBody}</p>
        </div>
        <button type="button" className="pen-btn pen-btn-accent pdv-big" onClick={() => void flow.connect()}>{T.promptBtn}</button>
      </section>
    )
  }
  if (drive.state !== 'connected') return null
  const n = drive.newFiles.length
  const sec = drive.newFiles.reduce((s, r) => s + (r.sec ?? 0), 0)
  return (
    <section className="pdv-card" data-state="on" data-compact={compact ? 'true' : undefined} aria-live="polite" aria-label={T.connected}>
      <span className="pdv-mark" aria-hidden="true"><Icon name="usb" size={24} /></span>
      <div className="pdv-card-text">
        <h2 className="pdv-card-title">{T.connected}</h2>
        <p className="pdv-card-sub" data-new={n > 0 ? 'true' : undefined}>
          {!drive.known ? T.looking : n ? T.newRecs(n, penDur(T, sec)) : T.allIn}
        </p>
        {drive.clock === 'failed' ? (
          <p className="pdv-clock" data-bad="true">{T.clockFailed}</p>
        ) : drive.recordOnly ? (
          <p className="pdv-clock">{T.recordOnly}</p>
        ) : drive.clock ? (
          <p className="pdv-clock"><Icon name="check" size={15} /><strong>{T.clockSet}.</strong> {T.clockNote}</p>
        ) : null}
        {drive.preset && !drive.recordOnly && (
          <p className="pdv-clock">{T.presetPre}<strong>{drive.preset.event}</strong>{T.presetPost(presetWhen(drive.preset.start))}</p>
        )}
      </div>
      {n > 0 && (
        <button type="button" className="pen-btn pen-btn-accent pdv-big" onClick={flow.uploadNew}>
          {T.upload(n)}
        </button>
      )}
    </section>
  )
}

/** 'today' once the event has started or starts today here, else 'tomorrow' (it's set up from 18:00 the day before). */
function presetWhen(start: string): 'today' | 'tomorrow' {
  const s = new Date(start)
  const now = new Date()
  return s.getTime() <= now.getTime() || s.toDateString() === now.toDateString() ? 'today' : 'tomorrow'
}

/* ------------------------------------------------- phones and Safari: by hand */

export function PenSpaceHelp() {
  const T = useCopy(PEN_DEVICE_COPY)
  return (
    <details className="pdv-help">
      <summary>{T.spaceTitle}</summary>
      <ul>
        <li>{T.spaceMac}</li>
        <li>{T.spaceIphone}</li>
      </ul>
      <p>{T.spaceSafe}</p>
    </details>
  )
}

/* ------------------------------------------------------------- the flow */

export type PenFlow = ReturnType<typeof usePenFlow>

/**
 * `onUpload(files)`: PenApp's pipeline (the import tray, consent, background uploads).
 * `onPickFiles()`: the ordinary file picker, for "Or choose files instead" and browsers
 * without the folder picker.
 */
export function usePenFlow(drive: PenDrive, { onUpload, onPickFiles, locked, lang }: { onUpload: (files: File[]) => void; onPickFiles: () => void; locked?: boolean; lang: Lang }) {
  // PenApp calls this above its LangProvider, so the language comes in as an argument.
  const T = PEN_DEVICE_COPY[lang]
  const [guide, setGuide] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<string[] | null>(null)
  const [always, setAlways] = useState(true)
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(t)
  }, [toast])

  // The recordings this flow handed to the upload, by name + size + date. Only these can ever come
  // off the pen: a name alone isn't enough (if the pen's clock resets, two recordings can share
  // a name), so a file is removed only when it went up from the pen in this tab AND Juno lists
  // it as safe AND it's still the same file on the pen.
  const handed = useRef(new Map<string, string>())
  const sig = (f: { size: number; lastModified: number }) => `${f.size}:${f.lastModified}`

  const uploadNew = useCallback(() => {
    if (locked || !drive.newFiles.length) return
    for (const r of drive.newFiles) handed.current.set(r.name, sig(r.file))
    onUpload(drive.newFiles.map((r) => r.file))
  }, [drive.newFiles, locked, onUpload])

  /** "Connect pen", wherever it is: the guide, a permission click, or the new recordings. */
  const connect = useCallback(async () => {
    if (locked) return
    if (!canUsePenDrive()) return onPickFiles()
    if (drive.state === 'connected') return drive.newFiles.length ? uploadNew() : undefined
    if (drive.state === 'prompt' && (await drive.reconnect())) return
    setWrong(false)
    setGuide(true)
  }, [drive, locked, onPickFiles, uploadNew])

  const pick = useCallback(async () => {
    setBusy(true)
    setWrong(false)
    const r = await drive.connectFirst()
    setBusy(false)
    if (r === 'ok') setGuide(false)
    else if (r === 'wrong') setWrong(true)
  }, [drive])

  const remove = useCallback(async (names: string[]) => {
    const n = await drive.removeFromPen(names)
    setToast(n ? { text: T.removed(n) } : { text: T.removeFailed, bad: true })
  }, [T, drive])

  /**
   * After an upload batch (`done`: the files that went up): what's safely in Juno may come off
   * the pen, asked once. See `handed` for the three conditions.
   */
  const afterUpload = useCallback(async (done: File[]) => {
    if (drive.state !== 'connected' || !done.length) return
    const went = new Map(done.map((f) => [f.name, sig(f)]))
    const r = await drive.refreshFiles()
    if (!r?.st) return
    const safeNames = new Set(r.st.safe)
    const safe = r.list
      .filter((f) => safeNames.has(f.name) && handed.current.get(f.name) === sig(f.file) && went.get(f.name) === sig(f.file))
      .map((f) => f.name)
    for (const n of safe) handed.current.delete(n)
    if (!safe.length) return
    const s = drive.settings ?? (await fetchPenSettings())
    if (!s) return
    drive.setSettings(s)
    if (s.autoClear === true) await remove(safe)
    else if (s.autoClear === null) { setAlways(true); setAsk(safe) }
  }, [drive, remove])

  const answer = useCallback(async (yes: boolean) => {
    const names = ask ?? []
    setAsk(null)
    if (always && drive.settings) {
      drive.setSettings({ ...drive.settings, autoClear: yes })
      // The user's own choices, never a temporary event set-up (drive.settings may be one).
      void putPenSettings({ autoClear: yes })
    }
    if (yes) await remove(names)
  }, [always, ask, drive, remove])

  // Localhost screenshots (?penmock=…): run the after-upload step without uploading anything.
  useEffect(() => {
    if (!penMock()) return
    const w = window as unknown as { __penmock?: unknown }
    // Pretends the pen's new recordings were just uploaded from here.
    w.__penmock = {
      afterUpload: () => {
        const just = drive.recordings.slice(-3)
        for (const r of just) handed.current.set(r.name, sig(r.file))
        void afterUpload(just.map((r) => r.file))
      },
      guide: () => setGuide(true),
    }
  }, [afterUpload, drive.recordings])

  const layer = (
    <>
      {guide && <PenGuide T={T} wrong={wrong} busy={busy} onConnect={() => void pick()} onFiles={() => { setGuide(false); onPickFiles() }} onClose={() => setGuide(false)} />}
      {ask && (
        <PenDialog title={T.freeTitle} onClose={() => setAsk(null)} closeLabel={T.close}>
          <p className="pdv-lede"><strong>{T.freeBody(ask.length)}</strong> {T.freeKeep}</p>
          <label className="pdv-check">
            <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
            <span>{T.freeAlways}</span>
          </label>
          <div className="pdv-acts pdv-acts-row">
            <button type="button" className="pen-btn pen-btn-accent pdv-big" onClick={() => void answer(true)} data-autofocus>{T.freeRemove}</button>
            <button type="button" className="pen-btn pdv-big" onClick={() => void answer(false)}>{T.freeKeepBtn}</button>
          </div>
        </PenDialog>
      )}
      <PenToast toast={toast} onClose={() => setToast(null)} label={T.close} />
    </>
  )

  return { drive, connect, uploadNew, afterUpload, layer }
}

function PenToast({ toast, onClose, label }: { toast: { text: string; bad?: boolean } | null; onClose: () => void; label: string }) {
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => setHost(document.querySelector('.pen-root') ?? document.body), [])
  if (!host) return null
  // The live region stays mounted so the message is announced when it arrives.
  return createPortal(
    <div className="pdv-toast-host" role="status" aria-live="polite">
      {toast && (
        <div className="pdv-toast" data-bad={toast.bad ? 'true' : undefined}>
          <Icon name={toast.bad ? 'alert' : 'check'} size={18} />
          <span>{toast.text}</span>
          <button type="button" className="pdv-toast-x" onClick={onClose} aria-label={label}><Icon name="close" size={16} /></button>
        </div>
      )}
    </div>,
    host,
  )
}
