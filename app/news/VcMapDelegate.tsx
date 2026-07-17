'use client'
import { useEffect } from 'react'

// One delegated listener for every "◆ map" button in the funding section: sends the
// headline to /api/vc/enrich-request, which queues the company for the nightly VC
// Constellation enrichment (staged writes, reviewed at vc.tryjunoapp.com/review.html).
export default function VcMapDelegate() {
  useEffect(() => {
    async function onClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('button.db-vcmap') as HTMLButtonElement | null
      if (!btn || btn.disabled) return
      e.preventDefault()
      const headline = btn.dataset.t || ''
      btn.disabled = true
      const prev = btn.textContent
      btn.textContent = '…'
      try {
        const res = await fetch('/api/vc/enrich-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headline }),
        })
        const j = await res.json().catch(() => ({}))
        if (res.ok && j.company) {
          btn.textContent = '✓ ' + j.company
          btn.title = j.queued
            ? `${j.company} queued for tonight's Constellation enrichment`
            : `${j.company} is already ${j.already}`
        } else {
          btn.textContent = prev
          btn.disabled = false
          btn.title = j.error || 'could not queue — try again'
          if (res.status === 422) { btn.textContent = '— no company'; btn.disabled = true }
        }
      } catch {
        btn.textContent = prev
        btn.disabled = false
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
