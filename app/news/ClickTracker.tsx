'use client'
import { useEffect } from 'react'

// Records article clicks to the server-side For-You profile (so it follows you across devices).
export default function ClickTracker() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement)?.closest?.('a[data-s]') as HTMLAnchorElement | null
      if (!a) return
      const body = JSON.stringify({ source: a.dataset.s, section: a.dataset.k, title: a.textContent || '' })
      fetch('/api/news/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
