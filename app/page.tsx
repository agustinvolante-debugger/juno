import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  // Serve the landing page for unauthenticated visitors
  const html = readFileSync(join(process.cwd(), 'juno_landing.html'), 'utf-8')

  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  )
}
