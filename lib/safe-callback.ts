// Where a sign-in may send someone afterwards: a path on this site, or a full address on
// tryjunoapp.com / *.tryjunoapp.com (news., vc.) or localhost. Anything else falls back.
// Shared by the email-link API and the client sign-in pages, so no server imports here.
export function safeCallback(cb: unknown, fallback = '/pen'): string {
  if (typeof cb !== 'string' || !cb) return fallback
  if (cb.startsWith('/')) return cb.startsWith('//') ? fallback : cb
  try {
    const u = new URL(cb)
    const h = u.hostname
    if (u.protocol === 'https:' && (h === 'tryjunoapp.com' || h.endsWith('.tryjunoapp.com'))) return u.toString()
    if (h === 'localhost') return u.toString()
  } catch {}
  return fallback
}
