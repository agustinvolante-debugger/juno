// Web Worker: a long WAV → Ogg/Opus off the main thread (the work is in stream-encode.ts).
// Driven by streamPrepare (stream-prep-client.ts). Messages out:
//   { type: 'started' }                  posted on receipt, so the page knows the worker runs
//   { type: 'progress', done, total }    bytes of audio data read so far
//   { type: 'done', blob, durationSec, from, packets }
//   { type: 'error', message, noEncoder? }

import { prepWavToOgg, NoEncoderError } from './stream-encode'

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ file: File }>) => void) | null
  postMessage: (m: unknown) => void
}

scope.onmessage = async (e) => {
  scope.postMessage({ type: 'started' })
  try {
    const r = await prepWavToOgg(e.data.file, (done, total) => scope.postMessage({ type: 'progress', done, total }))
    scope.postMessage({ type: 'done', ...r })
  } catch (err) {
    scope.postMessage({ type: 'error', message: (err as Error)?.message || String(err), noEncoder: err instanceof NoEncoderError })
  }
}
