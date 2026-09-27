export type Lang = 'en' | 'es' | 'pt'

/** A paragraph, or a bulleted list. */
export type Block = string | { list: string[] }
export type Section = { h: string; body: Block[] }
export type LegalDoc = { title: string; lede: string; sections: Section[] }
