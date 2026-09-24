// Who runs Juno Pen. Owner-only pages (Customers, Recording activity) check against this list.
export const OWNER_EMAILS = [
  'agustinvolantesilva@gmail.com',
  'avolantesilva@gmail.com',
  'chrisdyas9@gmail.com', // Chris Dyas, co-founder
]

export function isOwner(email: string | null | undefined): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase())
}
