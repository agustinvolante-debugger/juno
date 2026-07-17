'use client'
import { useEffect } from 'react'

// Registers the Daily Brief service worker on every visit (push alerts + offline cache).
// Registration is idempotent; the browser fetches /news-sw.js and updates in the background.
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/news-sw.js').catch(() => { /* private mode etc. */ })
  }, [])
  return null
}
