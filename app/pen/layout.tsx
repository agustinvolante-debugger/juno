import type { Metadata, Viewport } from 'next'
import './pen-theme.css'

export const metadata: Metadata = {
  title: 'Pen',
  description: 'Plug in the recorder, get the meeting written up.',
  applicationName: 'Pen',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Pen' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The paper ground, so the iOS status bar and the browser chrome match the page instead of
  // sitting as a pale band above it. Was #fbfaf8, left over from the lighter palette.
  themeColor: '#F2EFE5',
  // Pen is a committed light design. Saying so stops the phone's dark setting from recolouring
  // form controls and scrollbars underneath it.
  colorScheme: 'light',
}

export default function PenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pen-root">
      {/* React hoists these into <head>. Instrument Serif for note titles, Literata for
          reading prose, IBM Plex Mono for meta, Inter for controls — all with real fallbacks in pen-theme.css. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600&family=IBM+Plex+Mono:wght@400;500&display=swap"
      />
      {children}
    </div>
  )
}
