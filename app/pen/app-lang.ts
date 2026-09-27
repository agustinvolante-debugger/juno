import { headers, cookies } from 'next/headers'
import { getProfileRaw } from '@/lib/pen/profile'
import { parseLang, type Lang } from '@/lib/pen/currency'
import { marketFor } from './landing-copy'

/**
 * The signed-in app's language, on the server: Profile "App language" first, then the landing
 * page's remembered choice, then the visitor's country. Never throws; English if all else fails.
 */
export async function appLangFor(email: string, profile?: { appLanguage?: string } | null): Promise<Lang> {
  const [h, c] = await Promise.all([headers(), cookies()])
  const p = profile === undefined ? await getProfileRaw(email).catch(() => null) : profile
  return parseLang(p?.appLanguage ?? c.get('juno_lang')?.value ?? marketFor(h.get('x-vercel-ip-country'), null).lang)
}
