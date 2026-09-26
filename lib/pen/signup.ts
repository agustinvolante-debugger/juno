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
  en: { name: 'Please give us a name to put on it.', email: 'That email address doesn’t look right.', line1: 'We need a street address to send the recorder.', city: 'We need a city to send the recorder.', postcode: 'We need a ZIP or postcode to send the recorder.' },
  es: { name: 'Necesitamos un nombre.', email: 'Ese correo no parece correcto.', line1: 'Necesitamos una dirección para enviar el lápiz.', city: 'Necesitamos una ciudad para enviar el lápiz.', postcode: 'Necesitamos un código postal para enviar el lápiz.' },
  pt: { name: 'Precisamos de um nome.', email: 'Esse e-mail não parece correto.', line1: 'Precisamos de um endereço para enviar a caneta.', city: 'Precisamos de uma cidade para enviar a caneta.', postcode: 'Precisamos de um CEP para enviar a caneta.' },
} as const

export function validate(b: Record<string, unknown>, opts: { needsAddress?: boolean; lang?: 'en' | 'es' | 'pt' } = {}): { ok: true; value: Signup } | { ok: false; error: string } {
  const needsAddress = opts.needsAddress ?? true
  const E = ERR[opts.lang ?? 'en']
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  const name = str(b.name, 120)
  if (name.length < 2) return { ok: false, error: E.name }

  const email = str(b.email, 200)
  if (!EMAIL_RE.test(email)) return { ok: false, error: E.email }

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
      phone: str(b.phone, 40) || null,
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
