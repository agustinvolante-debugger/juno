'use client'

import { useEffect, useState } from 'react'
import { streamPrepare } from '@/lib/pen/stream-prep-client'
import { durationWithoutDecoding } from '@/lib/pen/encode'

type Perf = Performance & { memory?: { usedJSHeapSize: number } }

export default function Harness() {
  const [log, setLog] = useState<string[]>([])
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__runPrep = async (index = 0, opts: { watchdogMs?: number; decode?: boolean; b64?: boolean; mode?: 'worker' | 'main-thread'; fault?: { encoderErrorAt?: number; hangAt?: number } } = {}) => {
      const input = document.getElementById('f') as HTMLInputElement
      const file = input.files?.[index]
      if (!file) throw new Error('no file')
      const heap = () => (performance as Perf).memory?.usedJSHeapSize ?? 0
      let peak = heap()
      const sampler = setInterval(() => { peak = Math.max(peak, heap()) }, 100)
      let events = 0
      let lastPct = -1
      let t100 = 0
      let t50 = 0
      const t0 = performance.now()
      try {
        const prep = await streamPrepare(file, (f) => { events++; lastPct = Math.floor(f * 100); if (f >= 1 && !t100) t100 = (performance.now() - t0) / 1000; if (f >= 0.5 && !t50) t50 = (performance.now() - t0) / 1000 }, { watchdogMs: opts.watchdogMs, mode: opts.mode, fault: opts.fault })
        const wall = (performance.now() - t0) / 1000
        const headerDur = await durationWithoutDecoding(file)
        let decodedDur = -1
        if (opts.decode !== false) {
          const ctx = new OfflineAudioContext(1, 1, 16000)
          const buf = await ctx.decodeAudioData(await prep.blob.arrayBuffer())
          decodedDur = buf.duration
        }
        peak = Math.max(peak, heap())
        let b64 = ''
        if (opts.b64) {
          const bytes = new Uint8Array(await prep.blob.arrayBuffer())
          let bin = ''
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
          b64 = btoa(bin)
        }
        const r = { ok: true, name: file.name, inMB: file.size / 1048576, wall, t50, t100, outMB: prep.blob.size / 1048576, durationSec: prep.durationSec, headerDur, decodedDur, events, lastPct, peakMainHeapMB: peak / 1048576, note: prep.note, ...prep.extra, ...(b64 ? { b64 } : {}) }
        setLog((l) => [...l, JSON.stringify(r)])
        return r
      } catch (e) {
        const r = { ok: false, name: file.name, error: (e as Error).message, trail: (e as { trail?: unknown }).trail, wall: (performance.now() - t0) / 1000, events }
        setLog((l) => [...l, JSON.stringify(r)])
        return r
      } finally {
        clearInterval(sampler)
      }
    }
    w.__ready = true
  }, [])
  return (
    <main style={{ padding: 24, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
      <h1>Pen prep harness (dev)</h1>
      <input id="f" type="file" multiple accept=".wav,.WAV,audio/*" />
      <button onClick={() => void (window as unknown as { __runPrep: () => Promise<unknown> }).__runPrep()}>Run</button>
      <pre>{log.join('\n')}</pre>
    </main>
  )
}
