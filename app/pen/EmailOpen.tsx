'use client'

// "Open in Gmail / Outlook / your mail app" for a drafted email.
//
// No account connection: the draft is handed to the user's own mail client with the address,
// subject and body filled in, and they press Send there. Free, needs no Google or Microsoft
// review, and works for every provider (Yahoo, iCloud, Apple Mail through the mailto link).
// Sending from inside Juno Pen is a later step that needs OAuth; this is the no-cost version.

import { useEffect, useMemo, useState } from 'react'
import { getJson } from '@/lib/pen/http'
import type { PenPerson } from '@/lib/pen/people'

type Client = 'gmail' | 'outlook' | 'other'
const PREF_KEY = 'pen.mailClient'

/**
 * The draft is one editable block with "To:" and "Subject:" lines at the top (so a single
 * Copy carries everything). Split it back into parts each time it changes, so edits to the
 * subject or body are what gets sent.
 */
export function splitDraft(draft: string): { to: string; subject: string; body: string } {
  const lines = draft.replace(/\r\n/g, '\n').split('\n')
  let to = ''
  let subject = ''
  let i = 0
  for (; i < Math.min(lines.length, 4); i++) {
    const m = /^(to|subject)\s*:\s*(.*)$/i.exec(lines[i])
    if (!m) break
    if (m[1].toLowerCase() === 'to') to = m[2].trim()
    else subject = m[2].trim()
  }
  const body = lines.slice(i).join('\n').replace(/^\n+/, '')
  return { to: /^\[.*\]$/.test(to) ? '' : to, subject: /^\[.*\]$/.test(subject) ? '' : subject, body }
}

const enc = encodeURIComponent

function composeUrl(client: Client, to: string, subject: string, body: string): string {
  if (client === 'gmail') return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`
  // Microsoft 365 / work and school accounts. Personal Outlook.com users can use "Other",
  // which opens whatever mail app their device has set up.
  if (client === 'outlook') return `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`
  // Addresses keep their @: some mail apps do not decode %40 in the address part.
  return `mailto:${to.split(/[,;\s]+/).filter(Boolean).map((a) => enc(a).replace(/%40/g, '@')).join(',')}?subject=${enc(subject)}&body=${enc(body)}`
}

/** Some mail apps drop anything past roughly two thousand characters of mailto link. */
const MAILTO_SAFE = 1900

const LABEL: Record<Client, string> = { gmail: 'Open in Gmail', outlook: 'Open in Outlook', other: 'Other mail app' }

export default function EmailOpen({
  draft,
  sessionId,
  onCopy,
}: {
  draft: string
  sessionId: string
  /** Copies the body, for when a link would cut it short. Returns whether it worked. */
  onCopy: (text: string) => Promise<boolean>
}) {
  const parts = useMemo(() => splitDraft(draft), [draft])
  const [people, setPeople] = useState<PenPerson[]>([])
  const [to, setTo] = useState('')
  const [touched, setTouched] = useState(false)
  const [pref, setPref] = useState<Client>('gmail')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem(PREF_KEY) as Client | null
      if (v === 'gmail' || v === 'outlook' || v === 'other') setPref(v)
    } catch {
      /* private window: the default is fine */
    }
  }, [])

  // Who is on this recording, so the address can be filled from the name in the draft.
  useEffect(() => {
    let alive = true
    getJson<{ people: PenPerson[] }>(`/api/pen/people?session=${sessionId}`)
      .then((j) => alive && setPeople(j.people.filter((p) => p.email)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [sessionId])

  // Suggest the address of whoever the draft is written to, until the user types their own.
  useEffect(() => {
    if (touched) return
    const name = parts.to.toLowerCase()
    const hit =
      people.find((p) => name && (name.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(name.split(/[\s,]/)[0]))) ??
      (people.length === 1 ? people[0] : undefined)
    setTo(hit?.email ?? (/@/.test(parts.to) ? parts.to : ''))
  }, [parts.to, people, touched])

  async function open(client: Client) {
    setNote(null)
    try {
      localStorage.setItem(PREF_KEY, client)
    } catch {
      /* not remembered, still works */
    }
    // Remembered for next time, but the buttons do not reorder under the pointer now.
    let body = parts.body
    const url = composeUrl(client, to.trim(), parts.subject, body)
    if (client === 'other' && url.length > MAILTO_SAFE) {
      // Too long for some mail apps to accept whole. Put the full text on the clipboard and
      // open with a pointer to it, rather than silently sending half an email.
      const copied = await onCopy(parts.body)
      body = copied ? '[The full email is on your clipboard. Paste it here.]' : parts.body.slice(0, 1200)
      setNote(copied ? 'This one is long, so the full text is also on your clipboard. Paste it into the email.' : null)
      window.location.href = composeUrl(client, to.trim(), parts.subject, body)
      return
    }
    if (client === 'other') window.location.href = url
    else window.open(url, '_blank', 'noopener')
  }

  const order: Client[] = [pref, ...(['gmail', 'outlook', 'other'] as Client[]).filter((c) => c !== pref)]

  return (
    <div className="pen-mailopen">
      <label className="pen-mailopen-to">
        <span className="pen-label">To</span>
        <input
          type="email"
          multiple
          list={`mail-to-${sessionId}`}
          value={to}
          onChange={(e) => {
            setTouched(true)
            setTo(e.target.value)
          }}
          placeholder={parts.to ? `${parts.to}'s email` : 'name@example.com'}
          aria-label="Recipient email"
        />
        <datalist id={`mail-to-${sessionId}`}>
          {people.map((p) => (
            <option key={p.id} value={p.email ?? ''}>{p.name}</option>
          ))}
        </datalist>
      </label>
      <div className="pen-mailopen-btns">
        {order.map((c, i) => (
          <button key={c} type="button" className={i === 0 ? 'pen-btn pen-btn-accent' : 'pen-btn'} onClick={() => open(c)}>
            {LABEL[c]}
          </button>
        ))}
      </div>
      <p className="pen-mailopen-hint">
        {note ?? 'Opens your own email with this filled in. Nothing is sent until you press Send there.'}
      </p>
    </div>
  )
}
