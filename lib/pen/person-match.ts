// "Chris" the way a person means it (20 Oct): the pure half of lib/pen/person-resolve.ts, for tests
// (.pentest/search-unit.mts). Given what the user called someone and every name/address Juno knows
// (contacts, speakers, names heard, people emailed, calendar guests, email senders), which of them
// are that person, and every way to search for them: full names, first and last names, nicknames,
// addresses.
//
// Founder's case (19 Oct): "from chrisdyas9" missed the invite from "Christian Dyas"
// <chris@tryjunoapp.com>. Here "Chris" matches "Christian" (a name starting with it, and the
// nickname table), chrisdyas9@gmail.com (an address starting with it) and, through the shared
// last name, both cards for the same man.

import { foldName } from './speakers'

/** Name families: any member finds the others. EN / ES / PT, the common ones. */
const FAMILIES: string[][] = [
  ['chris', 'christian', 'christopher', 'cristian', 'cristobal', 'kris', 'cris', 'christina', 'christine', 'cristina'],
  ['alex', 'alexander', 'alejandro', 'alexandra', 'alejandra', 'alessandro', 'sasha', 'ale', 'alexandre'],
  ['bob', 'bobby', 'rob', 'robbie', 'robert', 'roberto', 'beto'],
  ['mike', 'michael', 'miguel', 'mick', 'mikey'],
  ['bill', 'billy', 'will', 'william', 'guillermo', 'memo', 'guilherme', 'gui'],
  ['jim', 'jimmy', 'james', 'jaime', 'jamie'],
  ['tom', 'tommy', 'thomas', 'tomas'],
  ['dan', 'danny', 'daniel', 'dani', 'daniela'],
  ['dave', 'david'],
  ['nick', 'nicholas', 'nicolas', 'nico', 'nicola'],
  ['matt', 'matthew', 'mateo', 'matias', 'mati', 'mateus'],
  ['joe', 'joey', 'joseph', 'jose', 'pepe', 'josé'],
  ['frank', 'francis', 'francisco', 'pancho', 'paco', 'fran', 'chico', 'francisca'],
  ['nacho', 'ignacio'],
  ['lucho', 'luis', 'lucho'],
  ['kike', 'enrique', 'henry', 'henrique', 'quique'],
  ['pato', 'patricio', 'patricia', 'pat', 'patrick'],
  ['cata', 'catalina', 'catarina'],
  ['vale', 'valentina', 'valentin'],
  ['sofi', 'sofia', 'sophia', 'sophie'],
  ['ben', 'benny', 'benjamin', 'benja'],
  ['sam', 'sammy', 'samuel', 'samantha'],
  ['tony', 'anthony', 'antonio', 'tono', 'toni'],
  ['andy', 'andrew', 'andres', 'andre', 'drew'],
  ['liz', 'beth', 'betty', 'elizabeth', 'isabel', 'isa', 'eli'],
  ['kate', 'katie', 'kathy', 'katherine', 'catherine', 'kat'],
  ['jen', 'jenny', 'jennifer'],
  ['gabi', 'gabo', 'gabriel', 'gabriela', 'gabe'],
  ['fer', 'fernando', 'fernanda', 'nando'],
  ['rafa', 'rafael'],
  ['manu', 'manuel', 'manolo', 'manuela'],
  ['edu', 'eduardo', 'ed', 'eddie', 'edward'],
  ['agus', 'agustin', 'augustine', 'august'],
  ['juampi', 'juan pablo', 'jp', 'juanpa'],
  ['seba', 'sebastian', 'sebas'],
  ['rodri', 'rodrigo'],
  ['santi', 'santiago'],
  ['max', 'maximilian', 'maximiliano', 'maxi'],
  ['steve', 'steven', 'stephen', 'esteban'],
  ['greg', 'gregory', 'gregorio'],
  ['charlie', 'charles', 'carlos', 'chuck', 'carlitos'],
  ['jon', 'jonathan', 'jonny', 'johnny', 'john', 'juan', 'joao'],
  ['pete', 'peter', 'pedro', 'pedrito'],
]

const fam = new Map<string, Set<string>>()
for (const f of FAMILIES) for (const n of f) fam.set(foldName(n), new Set([...(fam.get(foldName(n)) ?? []), ...f.map(foldName)]))

/** The name and every name in its family ("chris" → christian, christopher, cristian…). */
export function nameForms(word: string): string[] {
  const w = foldName(word)
  return [...new Set([w, ...(fam.get(w) ?? [])])]
}

const tokens = (s: string) => foldName(s).replace(/[^a-z0-9\s'-]/g, ' ').split(/[\s'-]+/).filter(Boolean)

/** One word of what the user said against one word of a name: same, the start of it (3+ letters), or the same family. */
export function wordHit(q: string, w: string): boolean {
  if (!q || !w) return false
  if (q === w) return true
  if (q.length >= 3 && w.startsWith(q)) return true
  return fam.get(q)?.has(w) === true || fam.get(w)?.has(q) === true
}

/** "Chris" ~ "Christian Dyas"; "Chris Dyas" ~ "Christian Dyas"; "Dyas" ~ "Chris Dyas". Every word said must hit a word of the name. */
export function nameHit(query: string, name: string): boolean {
  const q = tokens(query)
  const n = tokens(name)
  if (!q.length || !n.length) return false
  return q.every((x) => n.some((w) => wordHit(x, w)))
}

/** "Chris" ~ chrisdyas9@gmail.com, chris@x.com, c.dyas@x.com (for "Dyas"). The local part's pieces, or its start. */
export function emailHit(query: string, email: string): boolean {
  const e = email.toLowerCase().trim()
  const q = tokens(query)
  if (!q.length || !e.includes('@')) return false
  if (q.length === 1 && q[0] === e) return true
  const local = e.split('@')[0]
  const parts = local.split(/[._+\-\d]+/).filter(Boolean)
  return q.every((x) => x.length >= 3 && (local.startsWith(x) || parts.some((p) => wordHit(x, p))))
}

export type PersonCand = { name?: string | null; email?: string | null; source: string }

export type PersonVariants = {
  query: string
  /** Full names that are this person ("Christian Dyas", "Chris Dyas"). */
  names: string[]
  /** Their addresses. */
  emails: string[]
  /** Single words to search with: first names, last names, nickname forms of what was said. */
  words: string[]
  /** Which sources matched (for the tool result: "found as a contact and as an email sender"). */
  sources: string[]
}

const cleanName = (s: string | null | undefined) => (s ?? '').replace(/["<>]/g, ' ').replace(/\s+/g, ' ').trim()
/** "Christian (Chris) Dyas" → the name, plus "Chris" as a nickname. */
function nameAndNicks(name: string): { name: string; nicks: string[] } {
  const nicks = [...name.matchAll(/[(“"']([^)”"']{2,30})[)”"']/g)].map((m) => m[1].trim())
  return { name: cleanName(name.replace(/[(“"'][^)”"']{2,30}[)”"']/g, ' ')), nicks }
}

/**
 * Everyone in `cands` who is the person the user named, and every way to search for them. A card
 * that shares an address with a match is the same person; so is one with the same last name and a
 * first name in the same family ("Chris Dyas" and "Christian Dyas"). `mine` (the user's own
 * addresses) are never a match: "Agustin" must not find the user.
 */
export function personVariants(query: string, cands: PersonCand[], mine: string[] = []): PersonVariants {
  const q = query.trim()
  const own = new Set(mine.map((m) => m.toLowerCase()))
  const qIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)
  const list = cands
    .map((c) => {
      const nn = nameAndNicks(c.name ?? '')
      return { ...c, name: nn.name, nicks: nn.nicks, email: c.email?.trim().toLowerCase() || null }
    })
    .filter((c) => !(c.email && own.has(c.email)))
  const hit = (c: (typeof list)[number]) =>
    qIsEmail ? c.email === q.toLowerCase() : (c.name && nameHit(q, c.name)) || c.nicks.some((n) => nameHit(q, n)) || (c.email ? emailHit(q, c.email) : false)
  const matched = list.filter(hit)
  // The same person under another card: a shared address, or same last name + same first-name family.
  const emails = new Set(matched.map((c) => c.email).filter(Boolean) as string[])
  const lastFirst = matched.filter((c) => tokens(c.name).length >= 2).map((c) => ({ first: tokens(c.name)[0], last: tokens(c.name).at(-1)! }))
  for (const c of list) {
    if (matched.includes(c)) continue
    const t = tokens(c.name)
    const same = (c.email && emails.has(c.email)) || (t.length >= 2 && lastFirst.some((x) => x.last === t.at(-1) && wordHit(x.first, t[0])))
    if (same) {
      matched.push(c)
      if (c.email) emails.add(c.email)
    }
  }
  const names = [...new Set(matched.map((c) => c.name).filter((n) => n && tokens(n).length >= 2))]
  // What was said, then the words of the names found (first and last names), then nicknames, then the
  // name's family ("chris" → christian, christopher…), which matters most when nothing else matched.
  const words = new Set<string>()
  for (const w of tokens(q)) if (w.length >= 3) words.add(w)
  for (const c of matched) for (const w of tokens(c.name)) if (w.length >= 3) words.add(w)
  for (const c of matched) for (const n of c.nicks) for (const w of tokens(n)) if (w.length >= 3) words.add(w)
  for (const w of tokens(q)) for (const f of nameForms(w)) if (f.length >= 3 && !f.includes(' ')) words.add(f)
  if (qIsEmail) emails.add(q.toLowerCase())
  return {
    query: q,
    names: names.slice(0, 6),
    emails: [...emails].slice(0, 8),
    words: [...words].slice(0, 10),
    sources: [...new Set(matched.map((c) => c.source))],
  }
}

/** A calendar guest, an email header or a title is this person (any address, full name, or name word that matches what was said). */
export function isPerson(v: PersonVariants, who: { name?: string | null; email?: string | null; text?: string | null }): boolean {
  const e = who.email?.toLowerCase().trim()
  if (e && (v.emails.includes(e) || emailHit(v.query, e))) return true
  const n = cleanName(who.name)
  if (n && (nameHit(v.query, n) || v.names.some((x) => foldName(x) === foldName(n)))) return true
  if (who.text) {
    const t = tokens(who.text)
    if (tokens(v.query).every((x) => t.some((w) => wordHit(x, w)))) return true
  }
  return false
}
