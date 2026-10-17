import { ogCard, OG_SIZE } from '@/lib/blog/og'

export const alt = 'The Juno Blog'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return ogCard({ title: 'Notes from the team building Juno Pen', meta: 'tryjunoapp.com/blog' })
}
