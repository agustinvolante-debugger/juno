import { authedEmail } from '@/lib/news/auth'
import { getProfile, type AgentProfile } from '@/lib/pen/profile'
import ProfileForm from './ProfileForm'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const email = (await authedEmail())!
  let profile: AgentProfile = {}
  let loadError: string | null = null
  try {
    profile = await getProfile(email)
  } catch (e) {
    loadError = (e as Error).message
  }
  return <ProfileForm initial={profile} loadError={loadError} />
}
