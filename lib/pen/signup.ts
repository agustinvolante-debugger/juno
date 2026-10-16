// Landing-page sign-ups.
//
// Unauthenticated by definition — these are people who have not signed in and may never.
// That shapes everything here: validate hard, never trust a field, and keep the required set
// as small as the job allows.

import { supabaseAdmin } from '@/lib/supabase'

export type Signup = {
  name: string
  email: string
  phone?: string | null
  role?: string | null
  ship_line1?: string | null
  ship_line2?: string | null
  ship_city?: string | null
  ship_state?: string | null
  ship_postcode?: string | null
  ship_country?: string | null
  note?: string | null
  source?: string | null
}

/** Deliberately permissive — the job is to reject typos, not to police valid addresses. */
const EMAIL_RE = /^[^\s@,;:<>()[\]\\]+@[^\s@.,;:<>()[\]\\]+\.[a-z]{2,}$/i

export { ROLES } from './signup-fields'

/** Form errors in the language the visitor signed up in. */
const ERR = {
  en: { name: 'Please give us a name to put on it.', email: 'That email address doesn’t look right.', phone: 'We need a phone number (your WhatsApp), with the country code.', line1: 'We need a street address to send the recorder.', city: 'We need a city to send the recorder.', postcode: 'We need a ZIP or postcode to send the recorder.' },
  es: { name: 'Necesitamos un nombre.', email: 'Ese correo no parece correcto.', phone: 'Necesitamos un teléfono (tu WhatsApp), con el código de país.', line1: 'Necesitamos una dirección para enviar el lápiz.', city: 'Necesitamos una ciudad para enviar el lápiz.', postcode: 'Necesitamos un código postal para enviar el lápiz.' },
  pt: { name: 'Precisamos de um nome.', email: 'Esse e-mail não parece correto.', phone: 'Precisamos de um telefone (seu WhatsApp), com o código do país.', line1: 'Precisamos de um endereço para enviar a caneta.', city: 'Precisamos de uma cidade para enviar a caneta.', postcode: 'Precisamos de um CEP para enviar a caneta.' },
} as const

/** A phone someone could be reached on: 7 to 15 digits (E.164's ceiling), punctuation allowed. */
export function cleanPhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, 40)
  const digits = t.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15 || /[^\d\s()+.\-]/.test(t)) return null
  return t
}

export function validate(b: Record<string, unknown>, opts: { needsAddress?: boolean; needsPhone?: boolean; lang?: 'en' | 'es' | 'pt' } = {}): { ok: true; value: Signup } | { ok: false; error: string } {
  const needsAddress = opts.needsAddress ?? true
  // Since 15 Oct every signup gives a phone: WhatsApp is how most people send recordings, and
  // it's how we reach them. Only the "notify me" waitlist can do without.
  const needsPhone = opts.needsPhone ?? true
  const E = ERR[opts.lang ?? 'en']
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  const name = str(b.name, 120)
  if (name.length < 2) return { ok: false, error: E.name }

  const email = str(b.email, 200)
  if (!EMAIL_RE.test(email)) return { ok: false, error: E.email }

  const phone = cleanPhone(b.phone)
  if (needsPhone && !phone) return { ok: false, error: E.phone }

  // Pen plans post a recorder; software-only plans (own recorder) have nothing to ship.
  const line1 = str(b.ship_line1, 200)
  const city = str(b.ship_city, 120)
  const postcode = str(b.ship_postcode, 32)
  if (needsAddress) {
    if (!line1) return { ok: false, error: E.line1 }
    if (!city) return { ok: false, error: E.city }
    if (!postcode) return { ok: false, error: E.postcode }
  }


  return {
    ok: true,
    value: {
      name,
      email,
      phone: phone ?? (str(b.phone, 40) || null),
      role: str(b.role, 60) || null,
      ship_line1: line1 || null,
      ship_line2: str(b.ship_line2, 200) || null,
      ship_city: city || null,
      ship_state: str(b.ship_state, 80) || null,
      ship_postcode: postcode || null,
      ship_country: str(b.ship_country, 80) || null,
      note: str(b.note, 1000) || null,
      source: str(b.source, 60) || null,
    },
  }
}

/** Upsert on email: someone filling the form twice is correcting themselves, not duplicating. */
export async function saveSignup(s: Signup): Promise<{ created: boolean }> {
  const { data: existing } = await supabaseAdmin
    .from('pen_signups')
    .select('id')
    .ilike('email', s.email)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('pen_signups')
      .update({ ...s, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    return { created: false }
  }

  const { error } = await supabaseAdmin.from('pen_signups').insert(s)
  if (error) throw new Error(error.message)
  return { created: true }
}

/**
 * What Stripe collected at checkout, written back onto the signup row: the shipping address for a
 * bought pen (Stripe's is the one the pen goes to, so it replaces the form's), and the name and
 * phone when the row has none (the direct checkout route, or a row from before 15 Oct).
 */
export async function saveCheckoutDetails(email: string, d: {
  name?: string | null
  phone?: string | null
  shipping?: { name?: string | null; address?: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null } | null } | null
}): Promise<void> {
  const a = d.shipping?.address
  const ship = a?.line1
    ? { ship_line1: a.line1, ship_line2: a.line2 || null, ship_city: a.city || null, ship_state: a.state || null, ship_postcode: a.postal_code || null, ship_country: a.country || null }
    : {}
  const { data: existing } = await supabaseAdmin.from('pen_signups').select('id,name,phone').ilike('email', email).maybeSingle()
  const now = new Date().toISOString()
  if (existing?.id) {
    const patch = {
      ...ship,
      ...(!existing.phone && d.phone ? { phone: d.phone } : {}),
      ...(!existing.name && d.name ? { name: d.name } : {}),
    }
    if (!Object.keys(patch).length) return
    const { error } = await supabaseAdmin.from('pen_signups').update({ ...patch, updated_at: now }).eq('id', existing.id)
    if (error) throw new Error(error.message)
    return
  }
  const name = d.name || d.shipping?.name || email.split('@')[0]
  const { error } = await supabaseAdmin.from('pen_signups').insert({ email, name, phone: d.phone ?? null, source: 'stripe', ...ship })
  if (error) throw new Error(error.message)
}
