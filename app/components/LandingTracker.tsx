'use client'

import { useEffect } from 'react'

export default function LandingTracker() {
  useEffect(() => {
    fetch('/api/report-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'landing' }),
    }).catch(() => {})
  }, [])

  return null
}
