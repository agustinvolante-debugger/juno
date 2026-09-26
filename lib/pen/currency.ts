// Local money for the markets that pay in their own currency.
//
// Only software-only (own recorder) plans have local prices; the pen plans are sold in the
// US in dollars. Each local price is a real Stripe price in that currency (not a conversion),
// so the number on the page is the number on the card statement.

export type Currency = 'usd' | 'clp' | 'brl'
export type Lang = 'en' | 'es' | 'pt'

export const LOCAL_PRICES: Record<Exclude<Currency, 'usd'>, { monthly: number; halfyear: number }> = {
  clp: { monthly: 11990, halfyear: 49990 },
  brl: { monthly: 59.9, halfyear: 269 },
}

export function money(amount: number, currency: Currency): string {
  if (currency === 'clp') return `$${Math.round(amount).toLocaleString('es-CL')}`
  if (currency === 'brl') return `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`
  return `$${amount}`
}

export function parseCurrency(v: unknown): Currency {
  return v === 'clp' || v === 'brl' ? v : 'usd'
}
export function parseLang(v: unknown): Lang {
  return v === 'es' || v === 'pt' ? v : 'en'
}

/** Stripe Checkout's own language for the payment page. */
export function stripeLocale(lang: Lang): string | undefined {
  return lang === 'es' ? 'es-419' : lang === 'pt' ? 'pt-BR' : undefined
}
