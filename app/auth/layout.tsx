import { Instrument_Serif, Inter } from 'next/font/google'
import './auth.css'

// The sign-in pages, in the same type and paper as Juno Pen (see app/pen/layout.tsx).
const display = Instrument_Serif({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-display' })
const ui = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-ui' })

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={`auth-root ${display.variable} ${ui.variable}`}>{children}</div>
}
