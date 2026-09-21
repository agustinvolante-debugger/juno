'use client'

// Upload diagnostics. Exists because "it doesn't work on Safari" can mean six different
// things, and guessing which one costs more than a page that just answers.
//
// Runs the REAL prepare pipeline on a chosen file and reports exactly where it stops.
// Nothing is uploaded and nothing leaves the device.

import { useEffect, useState } from 'react'
import { prepareAudio, fmtMB, fmtDur, SOFT_SIZE_LIMIT } from '@/lib/pen/encode'
import '../pen-theme.css'

type Cap = { label: string; value: string; ok: boolean | null; note?: string }

export default function CheckPage() {
  const [caps, setCaps] = useState<Cap[]>([])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])

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
        <h1 className="pen-display text-[30px] leading-tight">Upload check</h1>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--soft)' }}>
          Pick the file that won&rsquo;t upload. This runs the same preparation the app does and
          shows exactly where it stops. Nothing is uploaded and nothing leaves your device.
        </p>

        <div className="pen-panel mt-7 p-5">
          <label className="pen-btn pen-btn-primary inline-block cursor-pointer">
            {busy ? 'Working…' : 'Choose the file'}
            <input
              type="file"
              className="hidden"
              accept="audio/*,.wav,.wave,.m4a,.mp3,.mp4,.mov"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && run(e.target.files[0])}
            />
          </label>

          {log.length > 0 && (
            <pre
              className="pen-mono mt-5 whitespace-pre-wrap text-[13.5px] leading-[1.7]"
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
                <span className="text-[14px]">{c.label}</span>
                <span
                  className="pen-mono text-[13px]"
                  style={{ color: c.ok === false ? 'var(--bad)' : c.ok ? 'var(--good)' : 'var(--dim)' }}
                >
                  {c.value}
                </span>
              </div>
              {c.note && (
                <p className="mt-1 text-[13.5px] leading-snug" style={{ color: 'var(--faint)' }}>
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
