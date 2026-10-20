'use client'

// One provider on Settings → Connections: its mark, its name, one honest line about what works
// today, and (when there is more to do) a fold with that provider's settings. The fold opens by
// itself when the address points at it (#notion) or a status came back for it (?p=notion).

import { useEffect, useId, useState } from 'react'
import Icon from '../../Icon'

export type ConnState = 'on' | 'off' | 'warn' | 'soon' | 'links'

export default function ConnItem({
  id,
  marks,
  name,
  status,
  state = 'off',
  badge,
  action,
  open: openProp = false,
  fixed = false,
  toggleLabel,
  openLabel,
  children,
}: {
  id: string
  marks: React.ReactNode
  name: string
  status: React.ReactNode
  state?: ConnState
  /** A short word beside the name ("In use", "Test"). */
  badge?: string | null
  /** The row's one action while the fold is closed (Connect, Link). Hidden once it's open. */
  action?: React.ReactNode
  open?: boolean
  /** Always open, no fold control (Google: the account list is the point of the row). */
  fixed?: boolean
  /** "Show settings" / "Hide settings" for the fold button, already translated. */
  toggleLabel?: { show: string; hide: string }
  /** A button that opens the fold (for a connect flow that lives inside it, like Link WhatsApp). */
  openLabel?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(fixed || openProp)
  const bodyId = useId()
  useEffect(() => {
    if (fixed) return
    const hit = () => { if (window.location.hash === `#${id}`) setOpen(true) }
    hit()
    window.addEventListener('hashchange', hit)
    return () => window.removeEventListener('hashchange', hit)
  }, [id, fixed])

  const foldable = Boolean(children) && !fixed
  return (
    <li className="pen-conn-item" id={id} data-open={open} data-state={state}>
      <div className="pen-conn-row">
        <span className="pen-conn-marks" aria-hidden="true">{marks}</span>
        <div className="pen-conn-text">
          <h3 className="pen-conn-name">
            {name}
            {badge && <em className="pen-conn-badge">{badge}</em>}
          </h3>
          <p className="pen-conn-status">{status}</p>
        </div>
        <span className="pen-conn-act">
          {!open && action}
          {!open && !action && openLabel && foldable && (
            <button type="button" className="pen-btn" onClick={() => setOpen(true)} aria-controls={bodyId}>{openLabel}</button>
          )}
          {foldable && (
            <button
              type="button"
              className="pen-conn-fold"
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={`${open ? toggleLabel?.hide ?? 'Hide' : toggleLabel?.show ?? 'Show'}: ${name}`}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon name="chevron" size={18} />
            </button>
          )}
        </span>
      </div>
      {children && (
        <div className="pen-conn-body" id={bodyId} hidden={!open}>
          {children}
        </div>
      )}
    </li>
  )
}

/** A provider's mark in a small white tile, like an app icon. */
export function MarkTile({ children }: { children: React.ReactNode }) {
  return <span className="pen-conn-tile">{children}</span>
}
