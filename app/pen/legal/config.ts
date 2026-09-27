// The facts only the founder can supply. Every page that mentions one writes it as a bracketed
// token ([ENTITY], [ADDRESS], ...), and LegalPage swaps in the value below. While a value is
// still its own token it renders highlighted, so a policy with a gap in it can't be mistaken
// for a finished one.
//
// DRAFT shows a banner on both pages. Turn it off once the values are filled and the text has
// been read by someone who knows the law in the markets we sell in.

export const LEGAL_FACTS = {
  ENTITY: 'Agustin Volante Silva',
  ADDRESS: '2138 Jones St, San Francisco, CA, USA',
  'GOVERNING LAW': 'the State of California, USA',
  'CONTACT EMAIL': 'avolantesilva@gmail.com',
} as const

export type LegalFact = keyof typeof LEGAL_FACTS

export const LEGAL_DRAFT = false

/** Shown under the title. Change it whenever the text changes. */
export const LEGAL_UPDATED = { en: '27 September 2026', es: '27 de septiembre de 2026', pt: '27 de setembro de 2026' } as const
