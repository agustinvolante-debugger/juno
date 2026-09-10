// Pure category helpers — no Supabase, no Anthropic SDK, no server-only imports. The client
// component needs `COMMON_TYPES`, `slugType` and `isViewing`, and importing them from
// `store.ts` or `extract.ts` would drag the service-role Supabase client and the Anthropic
// SDK into the browser bundle. Keep this file dependency-free.

/**
 * Free-form, not an enum. The old three-option select was a guess about what people record,
 * and the two real users already needed a fourth thing ("coffee"). A category is now whatever
 * the categoriser decides or the user types.
 */
export type MeetingType = string

/** Lowercase, hyphenated, trimmed. Grouping and filtering key off this; display keeps the label. */
export function slugType(t: string | null | undefined): string {
  return (t ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Offered in the picker and given to the categoriser as examples. Deliberately not a
 * whitelist — the categoriser may return something else, and the user may type anything.
 */
export const COMMON_TYPES = [
  'Property viewing', 'Client meeting', 'Coffee', 'Interview', 'Team meeting',
  'One-on-one', 'Sales call', 'Discovery call', 'Clinical / admin', 'Site visit',
  'Board meeting', 'Lecture or talk', 'Phone call', 'Personal note',
] as const

/**
 * Does this category mean "someone was shown a property"? Matched on meaning rather than an
 * exact string, because the category is free text and the realtor's own wording varies.
 */
export function isViewing(category: string | null | undefined): boolean {
  return /(viewing|showing|walk-?through|open house|property)/i.test(category ?? '')
}

/**
 * Rows written before categories were free-form hold one of three enum values. Rather than
 * migrate the table, translate them on the way out — the slug still matches, so old and new
 * recordings group together, and nobody sees the word "generic" in their sidebar.
 */
const LEGACY: Record<string, string> = {
  showing: 'Property viewing',
  clinical: 'Clinical / admin',
  generic: 'General meeting',
}

/** The label to show a human for a stored category value. */
export function displayType(t: string | null | undefined): string {
  const raw = (t ?? '').trim()
  if (!raw) return ''
  return LEGACY[raw.toLowerCase()] ?? raw
}
