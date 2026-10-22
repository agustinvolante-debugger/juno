import { notFound } from 'next/navigation'
import Harness from './Harness'

// Dev-only harness for the streaming WAV prep worker (lib/pen/prep.worker.ts). Uploads nothing:
// pick a file (or let puppeteer set it), and window.__runPrep() returns timing, memory, progress
// count, output size and a decode check. Driven by .pentest/prep-browser.mjs.
// Read at request time, so the env flag below decides on every request.
export const dynamic = 'force-dynamic'

// Production: 404 unless PEN_PREP_HARNESS=1 is set on the server, which is only ever done for a
// local `next build && next start` test of the real production bundle. Never set on Vercel.
export default function PrepHarnessPage() {
  if (process.env.NODE_ENV === 'production' && process.env.PEN_PREP_HARNESS !== '1') notFound()
  return <Harness />
}
