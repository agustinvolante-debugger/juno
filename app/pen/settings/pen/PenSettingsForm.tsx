'use client'

// Settings → Pen. Every choice saves on its own (no Save button to forget), and the line under
// the card says where it went: onto the pen now (Chrome / Edge, pen plugged in), or next time.

import { useEffect, useRef, useState } from 'react'
import Icon from '../../Icon'
import { useCopy, useLang } from '../../LangContext'
import { LOCALE } from '@/lib/pen/i18n'
import { PEN_DEFAULTS, type PenQuality, type PenSensitivity, type PenSettings } from '@/lib/pen/pen-device'
import { PEN_DEVICE_COPY } from '../../pen/pen-device.copy'
import { canUsePenDrive } from '../../pen/pen-drive'
import { fetchPenSettingsState, lastClockSet, putPenSettingsState, usePenDrive } from '../../pen/usePenDrive'

const QUALITIES: PenQuality[] = ['high', 'standard']
const SENS: PenSensitivity[] = ['soft', 'normal', 'loud']
// Split length in minutes (21 Oct: 60/120/180/240, default 60). A saved value outside the four
// (the server accepts 10..240, e.g. an old 30 or 90) is shown as its own chip, selected, rather
// than silently snapped: the pen is still using it until the person picks one of these.
const SPLITS = [60, 120, 180, 240]
const splitOptions = (current: number) => (SPLITS.includes(current) ? SPLITS : [...SPLITS, current].sort((a, b) => a - b))
const CLEAR: { k: 'ask' | 'always' | 'never'; v: boolean | null }[] = [
  { k: 'ask', v: null },
  { k: 'always', v: true },
  { k: 'never', v: false },
]

type Status = { kind: 'saving' | 'pen' | 'later' | 'failed'; } | null

/** A row of real radio buttons drawn as pills. */
function Choice<V extends string | number>({ name, value, options, onChange, legend, hint }: {
  name: string
  value: V | null
  options: { v: V; label: string; sub?: string }[]
  onChange: (v: V) => void
  legend: string
  hint?: string
}) {
  return (
    <fieldset className="psx-row">
      <legend className="psx-label">{legend}</legend>
      {hint && <p className="psx-hint">{hint}</p>}
      <div className="psx-opts" data-tiles={options.some((o) => o.sub) ? 'true' : undefined}>
        {options.map((o) => (
          <label key={String(o.v)} className="psx-opt" data-on={value === o.v}>
            <input type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)} />
            <span className="psx-opt-label">{o.label}</span>
            {o.sub && <span className="psx-opt-sub">{o.sub}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function PenSettingsForm() {
  const T = useCopy(PEN_DEVICE_COPY)
  const lang = useLang()
  const drive = usePenDrive({ files: false })
  const [s, setS] = useState<PenSettings | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [supported, setSupported] = useState(false)
  const [clockAt, setClockAt] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const seq = useRef(0)

  useEffect(() => {
    setSupported(canUsePenDrive())
    setClockAt(lastClockSet())
    // The form edits the user's own choices (saved); the pen gets `settings`, which is a
    // temporary event set-up over them while one is on (lib/pen/event-prep.ts).
    void fetchPenSettingsState().then((v) => {
      if (!v) setLoadErr(true)
      setS(v?.saved ?? PEN_DEFAULTS)
      if (v) drive.setSettingsState(v)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // A connection made while this page is open sets the clock: show the new time.
  useEffect(() => { if (typeof drive.clock === 'number') setClockAt(drive.clock) }, [drive.clock])

  function change(patch: Partial<PenSettings>) {
    if (!s) return
    const next = { ...s, ...patch }
    setS(next)
    setStatus({ kind: 'saving' })
    window.clearTimeout(timer.current)
    // Waits for the slider to settle before saving.
    timer.current = window.setTimeout(async () => {
      const n = ++seq.current
      const r = await putPenSettingsState(next)
      if (n !== seq.current) return
      if (!r) return setStatus({ kind: 'failed' })
      setLoadErr(false)
      drive.setSettingsState({ settings: r.effective, saved: r.saved, preset: r.preset })
      const onPen = await drive.applySettings(r.effective)
      if (n === seq.current) setStatus({ kind: onPen ? 'pen' : 'later' })
    }, 450)
  }

  const fmtWhen = (ms: number) => new Date(ms).toLocaleString(LOCALE[lang], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const pen = !supported ? null : drive.state === 'connected' ? (
    <p className="psx-pen" data-on="true"><Icon name="usb" size={18} />{T.penHere}</p>
  ) : drive.state === 'prompt' ? (
    <div className="psx-pen">
      <Icon name="usb" size={18} />
      <span>{T.penAsk}</span>
      <button type="button" className="pen-btn pen-btn-accent psx-pen-btn" onClick={() => void drive.reconnect()}>{T.promptBtn}</button>
    </div>
  ) : drive.state === 'unplugged' ? (
    <p className="psx-pen"><Icon name="usb" size={18} />{T.penAway}</p>
  ) : drive.state === 'none' ? (
    <p className="psx-pen"><Icon name="usb" size={18} />{T.penNone}</p>
  ) : null

  const statusText = !status ? '' : status.kind === 'saving' ? T.saving : status.kind === 'failed' ? T.saveFailed
    : status.kind === 'pen' ? T.savedPen : supported ? T.savedLaterHere : T.savedLater

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card psx">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">{T.setTitle}</h2>
          <p className="pen-set-lede">{T.setLede}</p>
        </div>
        {pen}
        {drive.preset && <p className="psx-pen" role="note"><Icon name="usb" size={18} />{T.presetNote(drive.preset.event)}</p>}
        {loadErr && <div className="pen-su-err" role="alert">{T.loadFailed}</div>}

        {!s ? (
          <div className="psx-loading" aria-busy="true" />
        ) : (
          <div className="psx-rows">
            <div className="psx-row">
              <span className="psx-label">{T.clockLabel}</span>
              <p className="psx-hint">
                {T.clockAuto}{clockAt ? ` ${T.clockLast(fmtWhen(clockAt))}` : ''}
              </p>
            </div>

            <Choice
              name="quality" legend={T.qualityLabel} value={s.quality}
              options={QUALITIES.map((q) => ({ v: q, label: T.quality[q], sub: T.qualityHint[q] }))}
              onChange={(quality) => change({ quality })}
            />

            <Choice
              name="sens" legend={T.sensLabel} value={s.sensitivity}
              options={SENS.map((k) => ({ v: k, label: T.sens[k] }))}
              onChange={(sensitivity) => change({ sensitivity })}
            />

            <div className="psx-row">
              <div className="psx-switch-row">
                <label htmlFor="psx-voice" className="psx-switch-text">
                  <span className="psx-label">{T.voiceLabel}</span>
                  <span className="psx-hint">{T.voiceHint}</span>
                </label>
                <button
                  type="button" role="switch" id="psx-voice" aria-checked={s.voiceActivated} aria-label={T.voiceLabel}
                  className="pen-switch" data-on={s.voiceActivated} onClick={() => change({ voiceActivated: !s.voiceActivated })}
                >
                  <span className="pen-switch-knob" />
                </button>
              </div>
              {s.voiceActivated && (
                <div className="psx-slider">
                  <label htmlFor="psx-level" className="psx-sublabel">{T.voiceLevel}</label>
                  <input
                    id="psx-level" type="range" min={1} max={7} step={1} value={s.voiceLevel}
                    aria-valuetext={`${s.voiceLevel} / 7`}
                    onChange={(e) => change({ voiceLevel: Number(e.target.value) })}
                  />
                  <div className="psx-slider-ends" aria-hidden="true"><span>{T.voiceLess}</span><span>{T.voiceMore}</span></div>
                </div>
              )}
            </div>

            <Choice
              name="split" legend={T.splitLabel} hint={T.splitHint} value={s.splitMin}
              options={splitOptions(s.splitMin).map((m) => ({ v: m, label: T.min(m) }))}
              onChange={(splitMin) => change({ splitMin })}
            />

            <Choice
              name="clear" legend={T.clearLabel} value={CLEAR.find((c) => c.v === s.autoClear)?.k ?? 'ask'}
              options={CLEAR.map((c) => ({ v: c.k, label: T.clear[c.k] }))}
              onChange={(k) => change({ autoClear: CLEAR.find((c) => c.k === k)!.v })}
            />
          </div>
        )}

        <p className="psx-status" role="status" aria-live="polite" data-kind={status?.kind}>
          {status && status.kind !== 'saving' && status.kind !== 'failed' && <Icon name="check" size={16} />}
          {statusText}
        </p>
        {!supported && <p className="pen-set-fine psx-only">{T.onlyChrome}</p>}
      </div>
    </div>
  )
}
