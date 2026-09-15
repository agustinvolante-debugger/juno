// Pure form constants — no Supabase, no server imports.
//
// The signup page is a client component, and importing these from signup.ts pulled the
// service-role Supabase client into the browser bundle, where it throws "supabaseKey is
// required" at module scope and the page never renders. Same trap as lib/pen/categories.ts.
// Keep this file dependency-free.

export const ROLES = [
  'Real estate agent',
  'Healthcare',
  'Sales',
  'Consulting',
  'Founder / exec',
  'Legal',
  'Student or researcher',
  'Something else',
] as const

export type Role = (typeof ROLES)[number]
