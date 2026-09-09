/** Duration for the email header. Separate from encode.ts, which is a client module. */
export function fmtDurServer(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return ''
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
