'use client'

import { useEffect, useState } from 'react'

/** +1 415 738 6102 from 14157386102. Good enough for US numbers, harmless for the rest. */
function pretty(n: string): string {
  const d = n.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return `+${d}`
}

export default function WhatsAppLink({
  initialPhone,
  number,
  ready,
  loadError,
}: {
  initialPhone: string | null
  number: string
  ready: boolean
  loadError: string | null
}) {
  const [phone, setPhone] = useState(initialPhone)
  const [link, setLink] = useState<{ code: string; waLink: string; qr: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(loadError)

  // On a phone the button goes straight to WhatsApp with the message typed. On a computer it
  // shows a QR to scan with the phone, since that is where WhatsApp (and the pen) lives.
  async function start() {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/pen/whatsapp/link', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Could not start linking')
      const phoneDevice = window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900
      if (phoneDevice) window.location.href = j.waLink
      setLink({ code: j.code, waLink: j.waLink, qr: j.qr })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Watches for the LINK message to land, so there is no "I sent it" step. Stops when the
  // code would have expired anyway.
  useEffect(() => {
    if (!link || phone) return
    const until = Date.now() + 30 * 60 * 1000
    const t = setInterval(async () => {
      if (Date.now() > until) return clearInterval(t)
      const j = await (await fetch('/api/pen/whatsapp/link')).json().catch(() => ({}))
      if (j.phone) {
        setPhone(j.phone)
        setLink(null)
      }
    }, 3000)
    return () => clearInterval(t)
  }, [link, phone])

  async function unlink() {
    setBusy(true)
    await fetch('/api/pen/whatsapp/link', { method: 'DELETE' }).catch(() => {})
    setPhone(null)
    setBusy(false)
  }

  return (
    <div className="pen-set-stack">
      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">Juno Pen on WhatsApp</h2>
          <p className="pen-set-lede">
            Plug the pen into your phone, send the recording to Juno Pen on WhatsApp, and the briefing comes back in the chat.
            You can also ask about any of your calls there.
          </p>
        </div>
        {err && <div className="pen-su-err">{err}</div>}

        {!ready ? (
          <p className="pen-set-fine">WhatsApp isn&rsquo;t switched on yet.</p>
        ) : phone ? (
          <>
            <div className="pen-set-ok" role="status">{`Linked to ${pretty(phone)}`}</div>
            <p className="pen-set-fine">{`Juno Pen's number is ${pretty(number)}. Save it as a contact so it's easy to find.`}</p>
            <div className="pen-set-actions">
              <a className="pen-btn pen-btn-accent" href={`https://wa.me/${number}`} target="_blank" rel="noreferrer">Open the chat</a>
              <button type="button" className="pen-btn" onClick={unlink} disabled={busy}>Unlink this phone</button>
            </div>
          </>
        ) : link ? (
          <div className="pen-wa-link">
            <div className="pen-wa-qr" aria-label="QR code that opens WhatsApp" dangerouslySetInnerHTML={{ __html: link.qr }} />
            <div className="pen-wa-steps">
              <p className="pen-set-fine">Scan with your phone&rsquo;s camera. WhatsApp opens with the message ready: just tap Send.</p>
              <p className="pen-set-fine">{`Or send LINK ${link.code} to ${pretty(number)} on WhatsApp. The code lasts 30 minutes.`}</p>
              <p className="pen-set-fine">This page updates by itself once you&rsquo;re linked.</p>
              <div className="pen-set-actions">
                <a className="pen-btn" href={link.waLink} target="_blank" rel="noreferrer">Open WhatsApp on this computer</a>
              </div>
            </div>
          </div>
        ) : (
          <div className="pen-set-actions">
            <button type="button" className="pen-btn pen-btn-accent" onClick={start} disabled={busy}>Link WhatsApp</button>
          </div>
        )}
      </div>

      <div className="pen-set-card">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2">How to send a recording</h2>
        </div>
        <ol className="pen-set-fine" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Plug the pen into your phone&rsquo;s USB-C port.</li>
          <li>In the Juno Pen chat, tap + (Android: the paperclip), then Document, and pick the recording from the pen.</li>
          <li>Tap &ldquo;Everyone agreed&rdquo; to confirm everyone on the call agreed to be recorded. The briefing comes back in the chat.</li>
        </ol>
        <p className="pen-set-fine">
          Files up to about 50 minutes fit. Longer ones: upload on the website. Recordings sent this way pass through Vonage and WhatsApp on their way to us.
        </p>
      </div>
    </div>
  )
}
