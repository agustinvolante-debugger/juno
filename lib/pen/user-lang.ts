// The language for things sent to a user with no request in hand (the briefing email from the
// webhook, WhatsApp replies): their Profile "App language", else English. Server only.

import { getProfileRaw } from './profile'
import { parseLang, type Lang } from './currency'

export async function userLang(email: string | null | undefined): Promise<Lang> {
  if (!email) return 'en'
  const p = await getProfileRaw(email).catch(() => null)
  return parseLang(p?.appLanguage)
}
