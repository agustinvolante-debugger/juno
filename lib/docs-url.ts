// The help center (Mintlify, docs.tryjunoapp.com). NEXT_PUBLIC_DOCS_URL points it at the local
// Mintlify preview (`npx mint dev --port 3333`) while the docs aren't live yet.
export const DOCS_URL = (process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.tryjunoapp.com').replace(/\/+$/, '')

// Mintlify serves each translation under its language code: English (the default) at the root,
// Spanish under /es, Brazilian Portuguese under /pt-BR (the folder names in juno-docs).
const DOCS_PATH: Record<'en' | 'es' | 'pt', string> = { en: '', es: '/es', pt: '/pt-BR' }

/** The help center's home in the visitor's language; anything unknown gets English. */
export function docsUrl(lang?: string | null): string {
  const path = lang === 'es' || lang === 'pt' ? DOCS_PATH[lang] : DOCS_PATH.en
  return `${DOCS_URL}${path}`
}
