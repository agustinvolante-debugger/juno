import type { Metadata, Viewport } from 'next'
import './pen-theme.css'

export const metadata: Metadata = {
  title: 'Pen',
  description: 'Plug in the pen, get the showing written up.',
  applicationName: 'Pen',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Pen' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fbfaf8',
}

export default function PenLayout({ children }: { children: React.ReactNode }) {
  return <div className="pen-root">{children}</div>
}
