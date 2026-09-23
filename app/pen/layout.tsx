import type { Metadata, Viewport } from 'next'
import { Instrument_Serif, Literata, IBM_Plex_Mono, Inter } from 'next/font/google'
import './pen-theme.css'

// Self-hosted at build time rather than fetched from Google at render.
//
// These four faces used to arrive through a <link rel="stylesheet"> to fonts.googleapis.com,
// which is two blocking round trips to a third party before a single word can be painted, and
// it is the first thing to fix when the page's own display type is the design. next/font
// downloads them at build, serves them from our origin, and emits size-adjusted fallback
// metrics so swapping in the real face does not shift the layout.
//
// Each exposes a CSS variable that pen-theme.css reads, so the token names in the stylesheet
// stay the vocabulary and this file is only the delivery.
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
})
const serif = Literata({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif',
})
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})
const ui = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui',
})

export const metadata: Metadata = {
  title: 'Juno Pen',
  description: 'Plug in the recorder, get the meeting written up.',
  applicationName: 'Juno Pen',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Juno Pen' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The paper ground, so the iOS status bar and the browser chrome match the page instead of
  // sitting as a pale band above it.
  themeColor: '#F2EFE5',
  // Pen is a committed light design. Saying so stops the phone's dark setting from recolouring
  // form controls and scrollbars underneath it.
  colorScheme: 'light',
}

export default function PenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`pen-root ${display.variable} ${serif.variable} ${mono.variable} ${ui.variable}`}>
      {children}
    </div>
  )
}
