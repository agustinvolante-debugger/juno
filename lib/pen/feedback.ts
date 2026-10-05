// The in-app feedback pop-up (Chris, 5 Oct), once per account after the 3rd finished recording.
//
// Three questions: the Sean Ellis test ("how disappointed would you be if you could no longer
// use it?" — 40% "very" is the usual sign of product–market fit), the one thing to fix or add,
// and who they'd tell and what they'd say it's for (the customer's own words for the product).

import { supabaseAdmin } from '@/lib/supabase'
import { userLang } from './user-lang'
import { markOnboarding } from './profile'
import { notifyReferralNote } from './notify-owner'

export const DISAPPOINTED = ['very', 'somewhat', 'not'] as const
export type Disappointed = (typeof DISAPPOINTED)[number]

export type Feedback = { id: string; email: string; disappointed: Disappointed; fix: string | null; tell: string | null; lang: string | null; created_at: string }

const LABEL: Record<Disappointed, string> = { very: 'Very disappointed', somewhat: 'Somewhat disappointed', not: 'Not disappointed' }

export async function saveFeedback(email: string, f: { disappointed: Disappointed; fix?: string; tell?: string }): Promise<void> {
  const fix = f.fix?.trim().slice(0, 2000) || null
  const tell = f.tell?.trim().slice(0, 2000) || null
  const { error } = await supabaseAdmin.from('pen_feedback').insert({ email: email.toLowerCase(), disappointed: f.disappointed, fix, tell, lang: await userLang(email) })
  if (error) throw new Error(error.message)
  await markOnboarding(email, 'feedback').catch(() => {})
  await notifyReferralNote(`Feedback: ${LABEL[f.disappointed]} — ${email}`, [
    ['From', email],
    ['If Juno went away', LABEL[f.disappointed]],
    ['Fix or add', fix ?? '—'],
    ['Who they’d tell, and why', tell ?? '—'],
  ]).catch(() => {})
}

export async function listFeedback(): Promise<{ rows: Feedback[]; veryPct: number | null }> {
  const { data, error } = await supabaseAdmin.from('pen_feedback').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Feedback[]
  return { rows, veryPct: rows.length ? Math.round((rows.filter((r) => r.disappointed === 'very').length / rows.length) * 100) : null }
}
