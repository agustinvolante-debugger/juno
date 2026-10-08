// One stroke icon set for the Daily Brief chrome (1.6px stroke, 16px box, currentColor).
// Server-safe: no hooks, usable from server and client components.
type P = { size?: number; className?: string }
const base = (size = 16) => ({
  width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
})

export const StarIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M8 1.9l1.8 3.8 4.1.5-3 2.8.8 4.1L8 11.1 4.3 13.1l.8-4.1-3-2.8 4.1-.5z" /></svg>
)
export const ShareIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M8 10V2.2M5.2 4.8L8 2l2.8 2.8M3.5 8v5.2h9V8" /></svg>
)
export const MoreIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none"><circle cx="3.2" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.8" cy="8" r="1.3" /></svg>
)
export const SearchIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="7" cy="7" r="4.6" /><path d="M10.4 10.4L14 14" /></svg>
)
export const PlayIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none"><path d="M4.5 2.8v10.4L13 8z" /></svg>
)
export const StopIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none"><rect x="4" y="4" width="8" height="8" rx="1" /></svg>
)
export const ChevronIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 6l4 4 4-4" /></svg>
)
export const CheckIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
)
export const RefreshIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M13.2 6.2A5.4 5.4 0 0 0 3.4 5M2.8 9.8a5.4 5.4 0 0 0 9.8 1.2M3.2 2.4V5.2H6M12.8 13.6v-2.8H10" /></svg>
)
export const CloseIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 4l8 8M12 4l-8 8" /></svg>
)
export const ReturnIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M13 3.5v4.2a2 2 0 0 1-2 2H3.5M6 7L3.2 9.7 6 12.4" /></svg>
)
export const SlidersIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M2.5 4.5h6M12 4.5h1.5M2.5 11.5H4M7.5 11.5h6" /><circle cx="10.2" cy="4.5" r="1.7" /><circle cx="5.8" cy="11.5" r="1.7" /></svg>
)
export const GripIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none"><circle cx="6" cy="3.5" r="1.1" /><circle cx="10" cy="3.5" r="1.1" /><circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" /><circle cx="6" cy="12.5" r="1.1" /><circle cx="10" cy="12.5" r="1.1" /></svg>
)
