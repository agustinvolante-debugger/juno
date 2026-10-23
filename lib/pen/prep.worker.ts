// Web Worker: a long WAV → Ogg/Opus off the main thread (the work is in stream-encode.ts).
// Driven by streamPrepare (stream-prep-client.ts). Messages out:
//   { type: 'started' }                  posted on receipt, so the page knows the worker runs
//   { type: 'progress', done, total }    bytes of audio data read so far
//   { type: 'done', blob, durationSec, from, packets, clipped }
//   { type: 'error', message, noEncoder? }
// In: { file, fault?, hidden? } to start — `fault` is a test hook only (PrepFault), never sent by
// the app; then { type: 'visibility', hidden } whenever the page is hidden or shown, so the
// encoder's stuck check counts only visible time (a worker has no document of its own).

import { prepWavToOgg, NoEncoderError, type PrepFault } from './stream-encode'

type In = { file: File; fault?: PrepFault; hidden?: boolean } | { type: 'visibility'; hidden: boolean }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<In>) => void) | null
  postMessage: (m: unknown) => void
}

let hidden = false

scope.onmessage = async (e) => {
  const m = e.data
  if ('type' in m && m.type === 'visibility') {
    hidden = Boolean(m.hidden)
    return
  }
  const job = m as { file: File; fault?: PrepFault; hidden?: boolean }
  hidden = Boolean(job.hidden)
  scope.postMessage({ type: 'started' })
  try {
    const r = await prepWavToOgg(job.file, (done, total) => scope.postMessage({ type: 'progress', done, total }), { fault: job.fault, hidden: () => hidden })
    scope.postMessage({ type: 'done', ...r })
  } catch (err) {
    scope.postMessage({ type: 'error', message: (err as Error)?.message || String(err), noEncoder: err instanceof NoEncoderError })
  }
}
