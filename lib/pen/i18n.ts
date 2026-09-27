// The signed-in app's language: English, Spanish (Latin American, tú) or Portuguese (Brazil).
//
// Chosen in Profile ("App language"), falling back to the landing page's language and then
// the visitor's country (app/pen/app-lang.ts). Each component keeps its own copy as a small
// { en, es, pt } dictionary next to the markup, the way Tour.tsx and the signup page do; this
// file only holds what several of them share: dates, plurals and the category names.
//
// No server imports: bundled into the browser.

import type { Lang } from './currency'
import { displayType, type Bucket } from './categories'

export type { Lang }

/** The copy for one language, typed off the English so a missing string fails the build. */
export type Copy<T> = Record<Lang, T>

export const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es', pt: 'pt-BR' }

// For code that runs outside React (the fetch helpers' error wording). Set by LangProvider.
let current: Lang = 'en'
export function setClientLang(l: Lang) {
  current = l
}
export function clientLang(): Lang {
  return current
}

/** "Sep 27" / "27 sept" / "27 de set." */
export function shortDate(iso: string | number | Date, lang: Lang, timeZone?: string): string {
  return new Date(iso).toLocaleDateString(LOCALE[lang], { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) })
}

export function fmtDate(iso: string | number | Date, lang: Lang, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString(LOCALE[lang], opts)
}

/** today / yesterday / 3d ago / 2w ago, then the date. */
export function ago(iso: string, lang: Lang): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  const w = {
    en: ['today', 'yesterday', (n: number) => `${n}d ago`, (n: number) => `${n}w ago`],
    es: ['hoy', 'ayer', (n: number) => `hace ${n} d`, (n: number) => `hace ${n} sem`],
    pt: ['hoje', 'ontem', (n: number) => `há ${n} d`, (n: number) => `há ${n} sem`],
  }[lang] as [string, string, (n: number) => string, (n: number) => string]
  if (d <= 0) return w[0]
  if (d === 1) return w[1]
  if (d < 7) return w[2](d)
  if (d < 60) return w[3](Math.floor(d / 7))
  return shortDate(iso, lang)
}

/** `n` with the right noun: plural(3, ['recording', 'recordings']) → "3 recordings". */
export function plural(n: number, forms: [string, string]): string {
  return `${n} ${n === 1 ? forms[0] : forms[1]}`
}

// Categories are stored and sent to the AI in English (the categoriser's examples, the
// bucket regexes and old rows all key off the English words). Only the label on screen is
// translated; anything the user or the categoriser wrote in their own words shows as is.
const TYPE_LABELS: Record<string, [string, string]> = {
  'Property viewing': ['Visita a propiedad', 'Visita a imóvel'],
  'Client meeting': ['Reunión con cliente', 'Reunião com cliente'],
  Coffee: ['Café', 'Café'],
  Interview: ['Entrevista', 'Entrevista'],
  'Team meeting': ['Reunión de equipo', 'Reunião de equipe'],
  'One-on-one': ['Uno a uno', 'Individual'],
  'Sales call': ['Llamada de ventas', 'Ligação de vendas'],
  'Discovery call': ['Llamada de descubrimiento', 'Ligação de descoberta'],
  'Clinical / admin': ['Clínica / administración', 'Clínica / administrativo'],
  'Site visit': ['Visita a terreno', 'Visita técnica'],
  'Board meeting': ['Reunión de directorio', 'Reunião de conselho'],
  'Lecture or talk': ['Clase o charla', 'Aula ou palestra'],
  'Phone call': ['Llamada', 'Ligação'],
  'Personal note': ['Nota personal', 'Nota pessoal'],
  'General meeting': ['Reunión general', 'Reunião geral'],
  Uncategorised: ['Sin categoría', 'Sem categoria'],
}
const TYPE_BY_LOWER = new Map(Object.entries(TYPE_LABELS).map(([k, v]) => [k.toLowerCase(), v]))

/** The label to show for a stored category, in the app's language. */
export function typeLabel(t: string | null | undefined, lang: Lang): string {
  const shown = displayType(t)
  if (lang === 'en' || !shown) return shown
  const tr = TYPE_BY_LOWER.get(shown.toLowerCase())
  return tr ? tr[lang === 'es' ? 0 : 1] : shown
}

const BUCKET_LABELS: Record<Bucket, [string, string]> = {
  Meetings: ['Reuniones', 'Reuniões'],
  Property: ['Propiedades', 'Imóveis'],
  Personal: ['Personal', 'Pessoal'],
  Shopping: ['Compras', 'Compras'],
  Ideas: ['Ideas', 'Ideias'],
}
export function bucketLabel(b: Bucket, lang: Lang): string {
  return lang === 'en' ? b : BUCKET_LABELS[b][lang === 'es' ? 0 : 1]
}

/** What an unnamed transcript voice is called: "Speaker A", "Persona A", "Pessoa A". */
export const SPEAKER_WORD: Record<Lang, string> = { en: 'Speaker', es: 'Persona', pt: 'Pessoa' }

/** A language code's name in the app's language: es → "Spanish" / "español" / "espanhol". */
export function languageLabel(code: string | null | undefined, lang: Lang): string | null {
  if (!code) return null
  try {
    const n = new Intl.DisplayNames([LOCALE[lang]], { type: 'language' }).of(code)
    if (n && n !== code) return lang === 'en' ? n : n.charAt(0).toUpperCase() + n.slice(1)
  } catch {
    /* an old browser without DisplayNames: fall through */
  }
  return null
}
