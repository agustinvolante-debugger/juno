'use client'

// Upload diagnostics. Exists because "it doesn't work on Safari" can mean six different
// things, and guessing which one costs more than a page that just answers.
//
// Runs the REAL prepare pipeline on a chosen file and reports exactly where it stops.
// Nothing is uploaded and nothing leaves the device.

import { useEffect, useState } from 'react'
import { prepareAudio, fmtMB, fmtDur, SOFT_SIZE_LIMIT } from '@/lib/pen/encode'
import { ACCEPT_DESKTOP, acceptFor, isIOS } from '@/lib/pen/file-accept'
import '../pen-theme.css'

type Cap = { label: string; value: string; ok: boolean | null; note?: string }

/**
 * The three ways to ask for a file, so the answer comes back as evidence rather than a guess.
 *
 * On iOS, Safari passes `accept` to the Files provider, which matches on UTIs rather than the
 * extensions listed. A USB drive reports the pen's .WAV files with whatever type it feels
 * like — often none — and they come back greyed out, or the picker closes having chosen
 * nothing. If "Anything at all" works here and the other two don't, that is the whole bug and
 * the fix is already shipped. If NONE of them work, the problem is somewhere else entirely
 * and we stop looking at `accept`.
 */
const PICKERS: { key: string; label: string; accept?: string; why: string }[] = [
  { key: 'none', label: 'Anything at all', accept: undefined, why: 'No filter. What the app now uses on a phone.' },
  { key: 'audio', label: 'Audio only', accept: 'audio/*', why: 'The usual filter. Can hide files a USB drive reports no type for.' },
  { key: 'list', label: 'Audio + extensions', accept: ACCEPT_DESKTOP, why: 'What the app used to send to every device.' },
]

export default function CheckPage() {
  const [caps, setCaps] = useState<Cap[]>([])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [picked, setPicked] = useState<Record<string, string>>({})

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    const out: Cap[] = [
      { label: 'Browser', value: navigator.userAgent, ok: null },
      {
        label: 'Web Audio (decode)',
        value: w.AudioContext || w.webkitAudioContext ? 'yes' : 'no',
        ok: Boolean(w.AudioContext || w.webkitAudioContext),
        note: 'Needed to read a WAV at all.',
      },
      {
        label: 'AudioEncoder (Opus)',
        value: w.AudioEncoder ? 'yes' : 'no',
        ok: Boolean(w.AudioEncoder),
        note: 'Without it a long WAV cannot be compressed and may be too big to store.',
      },
      {
        label: 'Folder picker',
        value: w.showDirectoryPicker ? 'yes' : 'no',
        ok: Boolean(w.showDirectoryPicker),
        note: 'Only used by "Connect pen" on a laptop.',
      },
      { label: 'Upload ceiling', value: fmtMB(SOFT_SIZE_LIMIT), ok: null },
      {
        label: 'Treated as iOS',
        value: isIOS(navigator.userAgent, navigator.maxTouchPoints, navigator.platform) ? 'yes' : 'no',
        ok: null,
        note: 'On iOS the app sends no file filter at all, because filtering hides the pen\u2019s files.',
      },
      {
        label: 'Filter the app sends here',
        value: acceptFor(navigator.userAgent, navigator.maxTouchPoints, navigator.platform) ?? '(none \u2014 every file selectable)',
        ok: null,
      },
    ]

    // isConfigSupported is the honest test — the constructor can exist while opus is refused.
    const AE = w.AudioEncoder as { isConfigSupported?: (c: unknown) => Promise<{ supported: boolean }> } | undefined
    if (AE?.isConfigSupported) {
      AE.isConfigSupported({ codec: 'opus', sampleRate: 16000, numberOfChannels: 1, bitrate: 24000 })
        .then((r) => setCaps((c) => c.map((x) => (x.label === 'AudioEncoder (Opus)' ? { ...x, value: r.supported ? 'yes' : 'present but opus refused', ok: r.supported } : x))))
        .catch(() => {})
    }
    setCaps(out)
  }, [])

  async function run(file: File) {
    setBusy(true)
    setLog([`File: ${file.name}`, `Type reported by the OS: ${file.type || '(none)'}`, `Size: ${fmtMB(file.size)}`, '', 'Preparing…'])
    try {
      const t0 = Date.now()
      const prep = await prepareAudio(file)
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      const tooBig = prep.blob.size > SOFT_SIZE_LIMIT
      setLog((l) => [
        ...l.slice(0, -1),
        `Prepared in ${secs}s`,
        `Length: ${fmtDur(prep.durationSec)}`,
        `Result: ${fmtMB(prep.blob.size)} as ${prep.mime}`,
        `What happened: ${prep.note}`,
        '',
        tooBig
          ? `✗ TOO BIG — ${fmtMB(prep.blob.size)} is over the ${fmtMB(SOFT_SIZE_LIMIT)} ceiling. This is where the upload fails.`
          : '✓ This file would upload fine.',
      ])
    } catch (e) {
      setLog((l) => [...l.slice(0, -1), '', `✗ FAILED WHILE PREPARING`, (e as Error).message])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pen-root">
      <main className="mx-auto max-w-[680px] px-5 py-12">
        <h1 className="pen-display text-[34px] leading-tight">Upload check</h1>
        <p className="mt-3 text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
          Two steps: whether the phone will let you <em>choose</em> a recording off the pen, and
          whether that recording would upload. Nothing is uploaded and nothing leaves your device.
        </p>

        <h2 className="pen-label mt-9">Step 1 — can you even choose the file?</h2>
        <p className="mt-2 text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
          Try all three. Plug in the pen, tap a button, and try to pick a recording off it.
          Some of these may show the file greyed out, or close without choosing anything —
          that is the result we need, so try each one even after a failure.
        </p>

        <div className="pen-panel mt-4 p-5">
          <div className="flex flex-col gap-3">
            {PICKERS.map((p) => (
              <div key={p.key}>
                <label className="pen-btn inline-block w-full cursor-pointer text-center">
                  {p.label}
                  <input
                    type="file"
                    className="hidden"
                    {...(p.accept ? { accept: p.accept } : {})}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      setPicked((s) => ({
                        ...s,
                        [p.key]: f ? `\u2713 chose ${f.name} — ${fmtMB(f.size)}, type "${f.type || '(none reported)'}"` : '\u2717 closed without choosing anything',
                      }))
                      if (f) void run(f)
                    }}
                  />
                </label>
                <p className="mt-1 text-[14px] leading-snug" style={{ color: 'var(--faint)' }}>{p.why}</p>
                {picked[p.key] && (
                  <p className="pen-mono mt-1 text-[13px] leading-snug"
                     style={{ color: picked[p.key].startsWith('\u2713') ? 'var(--good)' : 'var(--bad)' }}>
                    {picked[p.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <h2 className="pen-label mt-9">Step 2 — would it upload?</h2>
        <p className="mt-2 text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
          Runs automatically on whatever you managed to choose above.
        </p>

        <div className="pen-panel mt-4 p-5">
          {busy && <p className="text-[16.5px]" style={{ color: 'var(--soft)' }}>Working…</p>}
          {!busy && log.length === 0 && (
            <p className="text-[16.5px]" style={{ color: 'var(--dim)' }}>Nothing chosen yet.</p>
          )}

          {log.length > 0 && (
            <pre
              className="pen-mono mt-5 whitespace-pre-wrap text-[14.5px] leading-[1.7]"
              style={{ color: 'var(--soft)' }}
            >
              {log.join('\n')}
            </pre>
          )}
        </div>

        <h2 className="pen-label mt-9">This browser</h2>
        <div className="pen-panel mt-3 divide-y" style={{ borderColor: 'var(--line)' }}>
          {caps.map((c) => (
            <div key={c.label} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[14.5px]">{c.label}</span>
                <span
                  className="pen-mono text-[13px]"
                  style={{ color: c.ok === false ? 'var(--bad)' : c.ok ? 'var(--good)' : 'var(--dim)' }}
                >
                  {c.value}
                </span>
              </div>
              {c.note && (
                <p className="mt-1 text-[14.5px] leading-snug" style={{ color: 'var(--faint)' }}>
                  {c.note}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="pen-mono mt-6 text-[13px] leading-relaxed" style={{ color: 'var(--faint)' }}>
          Screenshot this page and send it over.
        </p>
      </main>
    </div>
  )
}
