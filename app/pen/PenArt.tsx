/**
 * The Juno Pen, drawn.
 *
 * An illustration rather than a photograph, until a real one is shot. Drawn to the device's
 * actual shape, not traced from the seller's listing image (which cannot be used): a slim
 * glossy gunmetal barrel about fourteen times longer than it is wide, a chrome clicker, a
 * long flat chrome clip, a thin chrome ring where the pen opens, and a long tapered chrome
 * tip. No invented details: the real pen has no visible light, grille or engraving, so this
 * one does not either.
 *
 * `variant="open"` separates the pen at the ring to show the built-in USB-C plug.
 * `id` keeps gradient ids unique when the pen appears more than once on a page.
 */
export default function PenArt({
  id = 'pen',
  className,
  variant = 'closed',
  title,
}: {
  id?: string
  className?: string
  variant?: 'closed' | 'open'
  title?: string
}) {
  const g = (n: string) => `${id}-${n}`
  const open = variant === 'open'
  // The lower half slides right when open, leaving the USB-C plug visible in the gap.
  const shift = open ? 84 : 0
  const label = title ?? (open ? 'The Juno Pen opened, showing its built-in USB-C plug' : 'The Juno Pen recorder')

  return (
    <svg className={className} viewBox={`0 0 ${open ? 800 : 716} 120`} role="img" aria-label={label}>
      <defs>
        {/* Glossy gunmetal: a bright streak along the top, a deep core, and a second reflected
            streak low on the barrel, which is what makes a lacquered cylinder read as glossy. */}
        <linearGradient id={g('barrel')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5E6268" />
          <stop offset="0.12" stopColor="#B9BDC2" />
          <stop offset="0.22" stopColor="#3A3D42" />
          <stop offset="0.5" stopColor="#101113" />
          <stop offset="0.7" stopColor="#1B1C1F" />
          <stop offset="0.82" stopColor="#6C7076" />
          <stop offset="0.9" stopColor="#2A2C30" />
          <stop offset="1" stopColor="#141517" />
        </linearGradient>
        <linearGradient id={g('chrome')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.22" stopColor="#D4D7DB" />
          <stop offset="0.48" stopColor="#6E7379" />
          <stop offset="0.68" stopColor="#EEF0F2" />
          <stop offset="1" stopColor="#8E949A" />
        </linearGradient>
        <linearGradient id={g('clip')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#E2E4E7" />
          <stop offset="1" stopColor="#8F959B" />
        </linearGradient>
        {/* Flat steel: nearly even from top to bottom, so the shell reads as a flat face. */}
        <linearGradient id={g('usb')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EEF0F2" />
          <stop offset="0.6" stopColor="#D2D6DA" />
          <stop offset="1" stopColor="#B4BAC0" />
        </linearGradient>
        <filter id={g('soft')} x="-10%" y="-100%" width="120%" height="300%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Contact shadow */}
      <ellipse cx={open ? 400 : 360} cy="96" rx={open ? 350 : 320} ry="7" fill="#16150F" opacity="0.18" filter={`url(#${g('soft')})`} />

      {/* ---- upper half: clicker, cap, clip ---- */}
      {/* Clicker button */}
      <rect x="14" y="51" width="18" height="18" rx="4" fill={`url(#${g('chrome')})`} />
      <rect x="28" y="47" width="10" height="26" rx="2.5" fill={`url(#${g('chrome')})`} />
      {/* Upper barrel */}
      <path d="M44 42 H304 V78 H44 Q36 78 36 70 V50 Q36 42 44 42 Z" fill={`url(#${g('barrel')})`} />
      {/* Clip: a head where it meets the cap, then a long flat blade along the barrel */}
      <rect x="52" y="35" width="30" height="11" rx="3" fill={`url(#${g('clip')})`} />
      <path d="M72 36.5 H268 Q280 36.5 282 42 Q280 47 268 47 H72 Z" fill={`url(#${g('clip')})`} />
      <path d="M78 38.6 H262" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M78 45.4 H266" stroke="#6E7379" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />

      {/* Chrome ring where the pen opens */}
      <rect x="302" y="41" width="10" height="38" rx="2" fill={`url(#${g('chrome')})`} />

      {open && (
        <>
          {/* The built-in USB-C plug, exposed. A flat metal shell, not a rounded pin: flat
              shading, only slightly rounded corners, and at its end the oval opening with the dark
              slot inside, which is the detail that makes a USB-C plug read as one. */}
          {/* To scale with the barrel (about 11 mm): the plug is 6.6 mm long and 2.6 mm thick,
              seen here edge-on, so a short, thin tab rather than a long bar. */}
          <rect x="312" y="52" width="9" height="16" rx="2" fill="#1A1B1E" />
          <rect x="319" y="55.6" width="25" height="8.8" rx="1.6" fill={`url(#${g('usb')})`} />
          <path d="M320.8 56.6 H341.8" stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M320.8 63.5 H341.8" stroke="#8A9096" strokeOpacity="0.6" strokeWidth="0.7" strokeLinecap="round" />
          {/* The mouth of the plug at its end */}
          <rect x="342.4" y="57.2" width="1.8" height="5.6" rx="0.9" fill="#232528" />
        </>
      )}

      {/* ---- lower half: barrel, collar, tapered tip ---- */}
      <g transform={`translate(${shift} 0)`}>
        {open && <rect x="312" y="41" width="8" height="38" rx="2" fill={`url(#${g('chrome')})`} />}
        <rect x="312" y="42" width="248" height="36" fill={`url(#${g('barrel')})`} />
        {/* Collar */}
        <rect x="558" y="43" width="16" height="34" rx="2" fill={`url(#${g('chrome')})`} />
        <path d="M563 43 V77" stroke="#6E7379" strokeOpacity="0.5" strokeWidth="1" />
        {/* Long tapered tip */}
        <path d="M574 44.5 L676 57 Q680 60 676 63 L574 75.5 Z" fill={`url(#${g('chrome')})`} />
        <path d="M578 48.5 L670 58.4" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
        {/* Refill point */}
        <path d="M676 58.2 L698 59.6 Q700 60 698 60.4 L676 61.8 Z" fill="#3A3D42" />
        <circle cx="699.5" cy="60" r="1.5" fill="#1A1B1E" />
      </g>

      {/* A single long specular line down the whole barrel, the glossy lacquer highlight */}
      <path d={`M286 45.2 H300 M${316 + shift} 45.2 H${554 + shift}`} stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
