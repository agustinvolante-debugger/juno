// Open Graph cards for the blog, drawn with next/og: the landing page's black tile, the Juno mark,
// and the title in Newsreader italic. Fonts are the OFL TTFs in lib/blog/fonts (next/og cannot
// read woff2), read from disk so a card never depends on a network fetch.

import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const OG_SIZE = { width: 1200, height: 630 }

async function assets() {
  const root = process.cwd()
  const [head, body, mark] = await Promise.all([
    readFile(join(root, 'lib/blog/fonts/Newsreader-Italic-500.ttf')),
    readFile(join(root, 'lib/blog/fonts/Lora-Regular.ttf')),
    readFile(join(root, 'public/juno_mark.png')),
  ])
  return { head, body, mark: `data:image/png;base64,${mark.toString('base64')}` }
}

export async function ogCard({ title, meta, section = 'Blog' }: { title: string; meta?: string; section?: string }) {
  const { head, body, mark } = await assets()
  const size = title.length > 70 ? 60 : title.length > 40 ? 72 : 88
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#000', color: '#f5f5f7', padding: '72px 80px', fontFamily: 'Lora' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={52} height={52} style={{ borderRadius: 12 }} alt="" />
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 32, color: '#fff' }}>
            <span style={{ fontFamily: 'Newsreader' }}>J</span>uno Pen
          </div>
          <div style={{ display: 'flex', width: 1, height: 30, background: '#424245', margin: '0 6px' }} />
          <div style={{ display: 'flex', fontSize: 30, color: '#a1a1a6' }}>{section}</div>
        </div>
        <div style={{ display: 'flex', fontFamily: 'Newsreader', fontSize: size, lineHeight: 1.06, letterSpacing: '-0.015em', color: '#fff', maxWidth: 1000 }}>
          {title}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, color: '#a1a1a6' }}>
          <span>{meta ?? 'tryjunoapp.com/blog'}</span>
          <span style={{ display: 'flex', width: 120, height: 6, borderRadius: 3, background: '#0066cc' }} />
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Newsreader', data: head, style: 'italic', weight: 500 },
        { name: 'Lora', data: body, style: 'normal', weight: 400 },
      ],
    },
  )
}
