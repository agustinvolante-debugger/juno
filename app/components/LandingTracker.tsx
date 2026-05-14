'use client'

import { useEffect } from 'react'

export default function LandingTracker({ slug = 'landing' }: { slug?: string }) {
  useEffect(() => {
    fetch('/api/report-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).catch(() => {})
  }, [slug])

  return null
}
