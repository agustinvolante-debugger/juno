'use client'

import Link, { useLinkStatus } from 'next/link'
import Icon from '../Icon'

// Settings' way back to Home (21 Oct). Home is a dynamic page that takes a few seconds to render
// on the server, and a plain <Link> gave no sign it had been clicked: the settings page just sat
// there, so people clicked again (and again), which restarted the navigation each time. Two fixes:
//  · prefetch: the whole Home payload is fetched while you're in Settings, so one click is instant
//    (production only; the dev server never prefetches).
//  · a pending state: the arrow turns into a spinner the moment you click, so it reads as working.
// `href` is "/" on tryjunoapp.com (where /pen 308s to /, and a redirected prefetch is wasted) and
// "/pen" everywhere else. The layout decides; see app/pen/settings/layout.tsx.
function Pending() {
  const { pending } = useLinkStatus()
  return pending ? <span className="pen-back-spin" aria-hidden="true" /> : <Icon name="back" size={17} />
}

export default function BackHome({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} prefetch className="pen-back pen-back-home">
      <Pending />
      {label}
    </Link>
  )
}
