export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'
import LandingTracker from '@/app/components/LandingTracker'

export default async function ForCEOs() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  const raw = readFileSync(join(process.cwd(), 'juno_landing_ceo.html'), 'utf-8')
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const styleMatch = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  const html = (styleMatch ? `<style>${styleMatch[1]}</style>` : '') + (bodyMatch ? bodyMatch[1] : raw)

  return (
    <>
      <LandingTracker slug="landing-ceo" />
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
