import type { Metadata } from 'next'
import HowToPlayer from './HowToPlayer'

// How to use the pen, as a short animation. Not linked from anywhere yet and kept out of
// search: the MP4s rendered from the same scene (video/) are what gets sent to new customers.
export const metadata: Metadata = {
  title: 'How to use your Juno Pen',
  robots: { index: false, follow: false },
}

export default function HowToPage() {
  return (
    <main className="howto-page">
      <p className="howto-eyebrow">Juno Pen</p>
      <h1 className="howto-h1">How to use your Juno Pen</h1>
      <HowToPlayer review />
    </main>
  )
}
