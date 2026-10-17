import { allEntries, formatDate } from '@/lib/blog'
import { ogCard, OG_SIZE } from '@/lib/blog/og'

export const alt = 'A post on the Juno Blog'
export const size = OG_SIZE
export const contentType = 'image/png'
// Matches BLOG_REVALIDATE (segment config has to be a literal).
export const revalidate = 120

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { entries } = await allEntries()
  const post = entries.find((e) => e.slug === slug)
  if (!post) return ogCard({ title: 'The Juno Blog' })
  return ogCard({ title: post.title, meta: `${post.author} · ${formatDate(post.date)}` })
}
