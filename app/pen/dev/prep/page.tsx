import { notFound } from 'next/navigation'
import Harness from './Harness'

// Dev-only harness for the streaming WAV prep worker (lib/pen/prep.worker.ts). Uploads nothing:
// pick a file (or let puppeteer set it), and window.__runPrep() returns timing, memory, progress
// count, output size and a decode check. Driven by .pentest/prep-browser.mjs.
export default function PrepHarnessPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Harness />
}
