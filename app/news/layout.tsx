import type { Metadata, Viewport } from 'next'
import './news-theme.css'

// Scoped to the /news route so the root marketing site keeps its own title. Fixes the stale
// "Juno keywords" tab/home-screen name and makes the app feel native when added to an iOS
// home screen (correct name, full-screen standalone, status-bar styling).
export const metadata: Metadata = {
  title: 'Daily Brief',
  description: 'Your personal news reader — global headlines, AI briefings, live markets, and video, in one place.',
  applicationName: 'Daily Brief',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Daily Brief' },
  icons: { apple: '/juno_logo.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF7F0' },
    { media: '(prefers-color-scheme: dark)', color: '#14110C' },
  ],
}

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="db-root">
      {/* React hoists these into <head>; Newsreader (headlines) + Spline Sans Mono (kickers/meta) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=Spline+Sans+Mono:wght@400;500;600&display=swap"
      />
      {children}
    </div>
  )
}
