// A small inline icon set.
//
// No icon package: this needs maybe fifteen glyphs, and a dependency for that is weight for
// nothing. Every icon is a 20x20 stroked path on currentColor so it inherits text colour and
// sits on the same optical weight as the label beside it.
//
// These exist because important things were blending into the background — a list of nav
// items or note sections set purely in type reads as one grey mass, and an icon is the
// cheapest way to make a row findable at a glance.

export type IconName =
  | 'home' | 'recordings' | 'meetings' | 'personal' | 'shopping' | 'ideas' | 'property'
  | 'archive' | 'search' | 'plus' | 'link' | 'play' | 'check' | 'checklist' | 'question'
  | 'quote' | 'people' | 'clock' | 'calendar' | 'tag' | 'sparkle' | 'alert' | 'chevron'
  | 'back' | 'mail' | 'trash' | 'settings' | 'person' | 'hourglass'

const P: Record<IconName, React.ReactNode> = {
  home:       <path d="M3.5 8.6 10 3.4l6.5 5.2V16a.9.9 0 0 1-.9.9h-3.4v-4.6H7.8v4.6H4.4a.9.9 0 0 1-.9-.9Z" />,
  recordings: <><path d="M10 3.3v9.1" /><path d="M6.6 6.1v3.5M13.4 6.1v3.5" /><path d="M4.2 15.9h11.6" /></>,
  meetings:   <><rect x="2.8" y="5" width="14.4" height="10" rx="2" /><path d="M6.4 3.2v2M13.6 3.2v2" /></>,
  personal:   <><circle cx="10" cy="7" r="2.9" /><path d="M4.4 16.6c.6-2.8 2.9-4.4 5.6-4.4s5 1.6 5.6 4.4" /></>,
  shopping:   <><path d="M3 4h2l1.6 8.4a1.4 1.4 0 0 0 1.4 1.1h6.3a1.4 1.4 0 0 0 1.4-1.1L17 7H6" /><circle cx="8.6" cy="16.4" r="1.1" /><circle cx="14.4" cy="16.4" r="1.1" /></>,
  ideas:      <><path d="M10 2.9a4.6 4.6 0 0 0-2.6 8.4v1.6h5.2v-1.6A4.6 4.6 0 0 0 10 2.9Z" /><path d="M8.2 15.6h3.6M8.8 17.6h2.4" /></>,
  property:   <><path d="M3.4 8.8 10 3.6l6.6 5.2v7.3H3.4Z" /><path d="M8.2 16.1v-4.3h3.6v4.3" /></>,
  archive:    <><rect x="2.9" y="4.2" width="14.2" height="3.4" rx="1" /><path d="M4.4 7.6v7.3a1.3 1.3 0 0 0 1.3 1.3h8.6a1.3 1.3 0 0 0 1.3-1.3V7.6" /><path d="M8.2 10.9h3.6" /></>,
  search:     <><circle cx="8.8" cy="8.8" r="5.3" /><path d="M12.7 12.7 17 17" /></>,
  plus:       <path d="M10 4.4v11.2M4.4 10h11.2" />,
  link:       <><path d="M8.3 11.7 11.7 8.3" /><path d="M7.2 8.9 5.6 10.5a2.6 2.6 0 0 0 3.7 3.7l1.6-1.6" /><path d="M12.8 11.1l1.6-1.6a2.6 2.6 0 0 0-3.7-3.7L9.1 7.4" /></>,
  play:       <path d="M7.3 5.2l7 4.8-7 4.8Z" />,
  check:      <path d="M4.6 10.4 8 13.8l7-7.6" />,
  checklist:  <><path d="M3.4 6.3l1.6 1.6 2.6-2.8" /><path d="M3.4 13.1l1.6 1.6 2.6-2.8" /><path d="M10.4 6.4h6.2M10.4 13.2h6.2" /></>,
  question:   <><circle cx="10" cy="10" r="7.1" /><path d="M8.1 7.9a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.7.6-.7 1.1v.5" /><path d="M10 14.1h.01" /></>,
  quote:      <><path d="M8.2 5.6c-2 .7-3.3 2.4-3.3 4.6v3.9h3.7v-4H6.9c0-1.4.5-2.3 1.9-2.9Z" /><path d="M16 5.6c-2 .7-3.3 2.4-3.3 4.6v3.9h3.7v-4h-1.7c0-1.4.5-2.3 1.9-2.9Z" /></>,
  people:     <><circle cx="7.6" cy="7.4" r="2.5" /><path d="M2.9 16.2c.5-2.4 2.5-3.8 4.7-3.8s4.2 1.4 4.7 3.8" /><path d="M13.2 5.3a2.5 2.5 0 0 1 0 4.9" /><path d="M14 12.6c1.6.4 2.8 1.6 3.2 3.6" /></>,
  clock:      <><circle cx="10" cy="10" r="7.1" /><path d="M10 5.8V10l3 1.8" /></>,
  calendar:   <><rect x="2.9" y="4.6" width="14.2" height="12.5" rx="1.8" /><path d="M6.6 2.9v3.1M13.4 2.9v3.1M2.9 8.6h14.2" /></>,
  tag:        <><path d="M10.4 2.9H16a1.1 1.1 0 0 1 1.1 1.1v5.6L9.4 17.3a1.1 1.1 0 0 1-1.6 0L2.7 12.2a1.1 1.1 0 0 1 0-1.6Z" /><circle cx="13.2" cy="6.8" r="1.1" /></>,
  sparkle:    <path d="M10 2.9l1.5 4.3 4.3 1.5-4.3 1.5L10 14.5 8.5 10.2 4.2 8.7l4.3-1.5Z" />,
  alert:      <><path d="M10 3.4 17.3 16H2.7Z" /><path d="M10 8v3.4M10 14h.01" /></>,
  chevron:    <path d="M7.6 5.4 12.2 10l-4.6 4.6" />,
  back:       <><path d="M16 10H4.4" /><path d="M8.6 5.6 4.2 10l4.4 4.4" /></>,
  mail:       <><rect x="2.6" y="4.8" width="14.8" height="10.4" rx="2" /><path d="M3.4 6.2 10 11l6.6-4.8" /></>,
  settings:   <><path d="M3.4 6h7.1M14.6 6h2M3.4 14h2M9.5 14h7.1" /><circle cx="12.5" cy="6" r="2" /><circle cx="7.5" cy="14" r="2" /></>,
  person:     <><circle cx="10" cy="6.9" r="3" /><path d="M4.2 16.8c.7-3 3-4.6 5.8-4.6s5.1 1.6 5.8 4.6" /></>,
  hourglass:  <><path d="M5.6 3.2h8.8M5.6 16.8h8.8" /><path d="M6.6 3.2c0 3.2 3.4 4.4 3.4 6.8s-3.4 3.6-3.4 6.8M13.4 3.2c0 3.2-3.4 4.4-3.4 6.8s3.4 3.6 3.4 6.8" /></>,
  trash:      <><path d="M3.8 6.1h12.4" /><path d="M8.1 6.1V4.6h3.8v1.5" /><path d="M5.4 6.1l.8 9.4a1.2 1.2 0 0 0 1.2 1.1h5.2a1.2 1.2 0 0 0 1.2-1.1l.8-9.4" /></>,
}

export default function Icon({
  name,
  size = 20,
  filled = false,
  className,
}: {
  name: IconName
  size?: number
  /** For glyphs that read better solid — play, check, sparkle. */
  filled?: boolean
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {P[name]}
    </svg>
  )
}
