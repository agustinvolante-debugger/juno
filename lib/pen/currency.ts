// Local money for the markets that pay in their own currency.
//
// Since 15 Oct every plan and the pen have real Stripe prices in CLP and BRL (lib/pen/prices.ts
// PRICES.local), not conversions, so the number on the page is the number on the card statement.
// The given-pen link is dollars only.

import { PRICES } from './prices'

export type Currency = 'usd' | 'clp' | 'brl'
export type Lang = 'en' | 'es' | 'pt'

/** `halfyear` is the old 6-month price, still read by the landing page; nothing sells it. */
export const LOCAL_PRICES: Record<Exclude<Currency, 'usd'>, { monthly: number; yearly: number; pen: number; halfyear: number }> = {
  clp: { ...PRICES.local.clp, halfyear: 49990 },
  brl: { ...PRICES.local.brl, halfyear: 269 },
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
