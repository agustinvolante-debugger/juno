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

export function validate(b: Record<string, unknown>): { ok: true; value: Signup } | { ok: false; error: string } {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  const name = str(b.name, 120)
  if (name.length < 2) return { ok: false, error: 'Please give us a name to put on it.' }

  const email = str(b.email, 200)
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'That email address doesn’t look right.' }

  // Every plan includes a recorder, so there is always something to post.
  const line1 = str(b.ship_line1, 200)
  const city = str(b.ship_city, 120)
  const postcode = str(b.ship_postcode, 32)
  if (!line1) return { ok: false, error: 'We need a street address to send the recorder.' }
  if (!city) return { ok: false, error: 'We need a city to send the recorder.' }
  if (!postcode) return { ok: false, error: 'We need a ZIP or postcode to send the recorder.' }


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
