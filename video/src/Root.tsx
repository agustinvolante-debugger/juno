// Every version of the film: 3 languages x 4 audiences x 2 shapes (16:9 for the web and
// YouTube, 9:16 for Reels, Stories and WhatsApp status). Same scene as the landing page.
import { AbsoluteFill, Composition, useCurrentFrame, useVideoConfig } from 'remotion'
import { loadFont as loadDisplay } from '@remotion/google-fonts/InstrumentSerif'
import { loadFont as loadUi } from '@remotion/google-fonts/Inter'
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono'
import { loadFont as loadSerif } from '@remotion/google-fonts/Literata'
import PenFilmScene, { FILM_SECONDS, FILM_SIZE, type FilmFormat } from '../../app/pen/film/PenFilmScene'
import { KITS, PLUS } from '../../app/pen/landing-audiences'

// Only the weights and scripts the film uses (Latin covers EN, ES and PT).
const subsets: ('latin' | 'latin-ext')[] = ['latin', 'latin-ext']
const display = loadDisplay('normal', { weights: ['400'], subsets }).fontFamily
const ui = loadUi('normal', { weights: ['400', '600', '700'], subsets }).fontFamily
const mono = loadMono('normal', { weights: ['400'], subsets }).fontFamily
const serif = loadSerif('normal', { weights: ['400'], subsets }).fontFamily

const FPS = 30
/** Rendered sizes. The scene is laid out at 1280x720 / 720x1280 and scaled up to these. */
const OUT: Record<FilmFormat, { w: number; h: number }> = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 },
}

type Props = { lang: 'en' | 'es' | 'pt'; aud: number; format: FilmFormat }

function Film({ lang, aud, format }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const base = FILM_SIZE[format]
  const scale = OUT[format].w / base.w
  const vars = { '--font-display': display, '--font-ui': ui, '--mono': mono, '--serif': serif } as React.CSSProperties
  return (
    <AbsoluteFill style={{ background: '#F2EFE5', ...vars }}>
      <div style={{ width: base.w, height: base.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <PenFilmScene t={frame / fps} kit={KITS[lang][aud]} plus={PLUS[lang]} format={format} />
      </div>
    </AbsoluteFill>
  )
}

export function Root() {
  const list: Props[] = []
  for (const lang of ['en', 'es', 'pt'] as const)
    for (let aud = 0; aud < KITS[lang].length; aud++) for (const format of ['landscape', 'portrait'] as const) list.push({ lang, aud, format })
  return (
    <>
      {list.map((p) => (
        <Composition
          key={`${p.lang}-${p.aud}-${p.format}`}
          id={`juno-${p.lang}-${KITS[p.lang][p.aud].key}-${p.format}`}
          component={Film}
          durationInFrames={FILM_SECONDS * FPS}
          fps={FPS}
          width={OUT[p.format].w}
          height={OUT[p.format].h}
          defaultProps={p}
        />
      ))}
    </>
  )
}
