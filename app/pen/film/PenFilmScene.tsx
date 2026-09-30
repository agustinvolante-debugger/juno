// The Juno Pen film: fifteen seconds from a click to a finished to-do.
//
// A pure function of time. The landing page drives `t` from requestAnimationFrame
// (PenFilm.tsx); Remotion drives it from the frame number (video/), so the page and the MP4s
// used for ads are the same frames from the same code. That is also why everything here is
// inline styles and SVG: no page stylesheet exists inside the video renderer.
//
// It follows the chosen audience (landing-audiences.ts): a house viewing for sales, a lecture
// for students, a doctor's visit for families, an investor call for founders. Everything shown
// is something the product does today.
//
//   0.0  the pen, clicked                     5.0  it moves aside, the phone slides in
//   1.5  the waveform, the words as captions  6.0  recording in, briefing back, a question,
//   12.0 Today: the first to-do gets ticked         its answer, a reminder, "Done"
//   13.2 end card

import PenArt from '../PenArt'
import type { Kit, Plus } from '../landing-audiences'

export const FILM_SECONDS = 15
export type FilmFormat = 'landscape' | 'portrait'
/** The scene is laid out at this size and scaled to fit wherever it is shown. */
export const FILM_SIZE: Record<FilmFormat, { w: number; h: number }> = {
  landscape: { w: 1280, h: 720 },
  portrait: { w: 720, h: 1280 },
}

const C = {
  paper: '#F2EFE5',
  panel: '#FFFFFF',
  ink: '#16150F',
  soft: '#514E45',
  dim: '#646158',
  line: '#DCD5C4',
  accent: '#0B6B44',
  accentWash: '#DCEDE3',
  bad: '#9E3229',
  waBg: '#EFE7DD',
  waMe: '#D9FDD3',
  waHead: '#F6F5F3',
}
const FONT = {
  display: "var(--font-display, 'Instrument Serif'), Georgia, serif",
  ui: "var(--font-ui, Inter), system-ui, -apple-system, sans-serif",
  mono: "var(--mono, 'IBM Plex Mono'), ui-monospace, Menlo, monospace",
  serif: "var(--serif, Literata), Georgia, serif",
}

/* ------------------------------------------------------------------ time */

const clamp = (x: number) => Math.max(0, Math.min(1, x))
/** Progress 0 to 1 between two times. */
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
/** The page's one easing curve (0.16, 1, 0.3, 1), close enough as an exponential out. */
const out = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const lerp = (a: number, b: number, x: number) => a + (b - a) * x
/** Fades and lifts something in from `at`, over `dur` seconds. */
function enter(t: number, at: number, dur = 0.45, lift = 12) {
  const p = out(seg(t, at, at + dur))
  return { opacity: p, transform: `translateY(${(1 - p) * lift}px)` }
}

/* ------------------------------------------------------------- pieces */

/** WhatsApp's *bold* and line breaks. */
function WaText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} style={{ display: 'block', minHeight: line ? undefined : '0.6em' }}>
          {line.split(/(\*[^*]+\*)/g).map((part, j) =>
            /^\*[^*]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : <span key={j}>{part}</span>,
          )}
        </span>
      ))}
    </>
  )
}

/** A pseudo-random but fixed bar pattern, so every frame of every render matches. */
const BARS = Array.from({ length: 44 }, (_, i) => {
  const s = Math.sin(i * 12.9898) * 43758.5453
  return 0.3 + (s - Math.floor(s)) * 0.7
})

function Waveform({ t, width, height }: { t: number; width: number; height: number }) {
  const grow = seg(t, 1.4, 2.2)
  const live = t < 5
  const gap = 4
  const bw = (width - gap * (BARS.length - 1)) / BARS.length
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, width, height }}>
      {BARS.map((b, i) => {
        // Speech-like movement while recording, settling once it stops.
        const wobble = live ? 0.55 + 0.45 * Math.abs(Math.sin(t * 5.3 + i * 0.7)) : 0.5
        const reveal = clamp(grow * BARS.length - i) // bars appear left to right
        return (
          <span
            key={i}
            style={{
              width: bw,
              height: Math.max(3, height * b * wobble * reveal),
              borderRadius: bw,
              background: C.accent,
              opacity: 0.35 + 0.65 * reveal,
            }}
          />
        )
      })}
    </div>
  )
}

function Bubble({ me, children, style }: { me?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        alignSelf: me ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        padding: '8px 11px 7px',
        borderRadius: 10,
        borderTopRightRadius: me ? 3 : 10,
        borderTopLeftRadius: me ? 10 : 3,
        background: me ? C.waMe : C.panel,
        boxShadow: '0 1px 1px rgba(11,20,26,.13)',
        fontFamily: FONT.ui,
        fontSize: 15,
        lineHeight: 1.38,
        color: '#111B21',
        flex: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function Phone({ t, kit, plus, width }: { t: number; kit: Kit; plus: Plus; width: number }) {
  const m = kit.wa.msgs
  // Which messages, and when. The draft and "send it" are left to the page's WhatsApp section:
  // fifteen seconds holds one question and one reminder, not the whole thread.
  const plan: { at: number; me: boolean; node: React.ReactNode }[] = [
    {
      at: 6.0,
      me: true,
      node: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 8, background: C.accent, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 18 }}>♪</span>
          <span>
            <strong style={{ display: 'block', fontSize: 14 }}>{kit.wa.file}</strong>
            <span style={{ fontSize: 12, color: '#667781' }}>{kit.wa.fileMeta}</span>
          </span>
        </span>
      ),
    },
    { at: 6.9, me: false, node: <WaText text={m[0][1]} /> },
    { at: 8.3, me: true, node: <WaText text={m[1][1]} /> },
    { at: 9.2, me: false, node: <WaText text={m[2][1]} /> },
    { at: 10.4, me: true, node: <WaText text={m[7][1]} /> },
    { at: 11.2, me: false, node: <WaText text={m[8][1]} /> },
  ]
  const h = width * 2.05
  return (
    <div style={{ width, height: h, borderRadius: 52, background: '#121212', padding: 11, boxShadow: '0 40px 80px -30px rgba(22,21,15,.55), 0 12px 26px -14px rgba(22,21,15,.35)' }}>
      <div style={{ position: 'relative', height: '100%', borderRadius: 42, overflow: 'hidden', background: C.waBg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', top: 10, left: '50%', width: 96, height: 27, marginLeft: -48, borderRadius: 16, background: '#121212', zIndex: 2 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 14px 11px', background: C.waHead, borderBottom: '1px solid #E4E1DC' }}>
          <span style={{ fontSize: 26, lineHeight: 1, color: C.accent }}>‹</span>
          <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: C.ink, color: C.paper, fontFamily: FONT.display, fontSize: 21 }}>j</span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, fontFamily: FONT.ui }}>
            <strong style={{ fontSize: 16, color: '#111B21' }}>Juno Pen</strong>
            <span style={{ fontSize: 12.5, color: '#667781' }}>{plus.wa.status}</span>
          </span>
        </div>
        {/* Bottom-anchored like a real chat: new messages push older ones up and off. */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8, padding: '12px 10px', overflow: 'hidden' }}>
          {plan
            .filter((b) => t >= b.at)
            .map((b, i) => (
              <Bubble key={i} me={b.me} style={enter(t, b.at, 0.35, 10)}>
                {b.node}
              </Bubble>
            ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 18px', background: C.waHead }}>
          <span style={{ flex: 1, height: 32, borderRadius: 16, background: '#fff', border: '1px solid #E4E1DC' }} />
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: C.accent }} />
        </div>
      </div>
    </div>
  )
}

function TodayCard({ t, kit, plus, width }: { t: number; kit: Kit; plus: Plus; width: number }) {
  const [what, when] = kit.today.due[0]
  const [what2, when2] = kit.today.due[1]
  const tick = out(seg(t, 12.6, 12.95))
  return (
    <div style={{ width, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: '0 24px 50px -24px rgba(22,21,15,.45)', overflow: 'hidden', fontFamily: FONT.ui }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #E8E3D6' }}>
        <strong style={{ fontSize: 18, color: C.ink }}>{plus.today.title}</strong>
        <span style={{ padding: '3px 9px', borderRadius: 999, background: C.accentWash, color: '#08482E', fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>{plus.today.mine}</span>
      </div>
      <div style={{ padding: '12px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { w: what, n: when, on: tick },
          { w: what2, n: when2, on: 0 },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ flex: 'none', marginTop: 2, width: 22, height: 22, borderRadius: '50%', border: `1.5px solid ${r.on ? C.accent : C.line}`, background: r.on ? C.accent : 'transparent', display: 'grid', placeItems: 'center' }}>
              <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
                <path d="M5.2 10.4 8.4 13.6 14.8 6.8" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14" strokeDashoffset={14 * (1 - r.on)} />
              </svg>
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: r.on ? '#8E8A80' : C.ink, textDecoration: r.on > 0.6 ? 'line-through' : 'none' }}>{r.w}</span>
              <span style={{ display: 'block', fontFamily: FONT.serif, fontSize: 14, color: /overdue|atrasad/i.test(r.n) ? C.bad : C.dim }}>{r.n}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- scene */

export default function PenFilmScene({ t, kit, plus, format = 'landscape' }: { t: number; kit: Kit; plus: Plus; format?: FilmFormat }) {
  const { w, h } = FILM_SIZE[format]
  const portrait = format === 'portrait'
  const press = t > 1.0 && t < 1.35 ? Math.sin(seg(t, 1.0, 1.35) * Math.PI) : 0
  const aside = out(seg(t, 4.9, 5.9)) // pen and captions move out of the phone's way
  const phoneIn = out(seg(t, 5.0, 5.9))
  const todayIn = out(seg(t, 12.0, 12.6))
  const endIn = out(seg(t, 13.2, 13.9))

  // Where the pen sits: centred and large, then aside and smaller.
  const penW = portrait ? lerp(560, 420, aside) : lerp(760, 470, aside)
  const penX = portrait ? (w - penW) / 2 : lerp((w - penW) / 2, 70, aside)
  const penY = portrait ? lerp(360, 150, aside) : lerp(230, 150, aside)

  const phoneW = portrait ? 380 : 318
  const phoneX = portrait ? (w - phoneW) / 2 : w - phoneW - 150
  const phoneY = portrait ? lerp(h + 40, 450, phoneIn) : lerp(h + 40, 26, phoneIn)

  const turns = kit.seq.turns
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: C.paper, fontFamily: FONT.ui }}>
      {/* A soft emerald glow behind the pen, like the page's hero. */}
      <div style={{ position: 'absolute', left: penX - 80, top: penY - 160, width: penW + 160, height: 420, background: `radial-gradient(closest-side, ${C.accentWash}, transparent)`, opacity: 0.9 }} />

      {/* ---- the pen, the recording label and the waveform ---- */}
      <div style={{ position: 'absolute', left: penX, top: penY, width: penW, ...enter(t, 0, 0.7, 18), ...(portrait && t > 11.8 ? { opacity: 1 - out(seg(t, 11.8, 12.3)) } : {}) }}>
        <PenArt id={`film-${format}`} press={press} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, opacity: out(seg(t, 1.3, 1.7)) }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: FONT.mono, fontSize: 14, color: t < 5 ? C.bad : C.dim, flex: 'none' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: t < 5 ? C.bad : C.dim, opacity: t < 5 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3)) : 1 }} />
            {kit.seq.title}
          </span>
          <Waveform t={t} width={penW - 250} height={34} />
        </div>
      </div>

      {/* ---- what was said, as captions ---- */}
      <div
        style={{
          position: 'absolute',
          left: portrait ? 60 : penX,
          // Below the pen drawing (120/716 of its width) and its recording line.
          top: portrait ? lerp(560, 290, aside) + (penW * 120) / 716 - 70 : penY + (penW * 120) / 716 + 64,
          width: portrait ? w - 120 : penW,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          // Make way: for the phone in portrait (no room for both), for Today in landscape.
          opacity: portrait ? 1 - out(seg(t, 4.9, 5.5)) : 1 - out(seg(t, 11.8, 12.3)),
        }}
      >
        {turns.map(([who, said], i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', ...enter(t, 1.8 + i * 1.0, 0.5, 10) }}>
            <span style={{ flex: 'none', minWidth: 64, fontFamily: FONT.mono, fontSize: 13, color: C.dim, textTransform: 'uppercase', letterSpacing: '.06em' }}>{who}</span>
            <span style={{ fontFamily: FONT.serif, fontSize: portrait ? 30 : lerp(24, 20, aside), lineHeight: 1.4, color: C.ink }}>{said}</span>
          </div>
        ))}
        {/* The moment the recording becomes a note. */}
        <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'baseline', ...enter(t, 4.3, 0.5, 8) }}>
          <span style={{ flex: 'none', padding: '2px 8px', borderRadius: 6, background: '#F7EFDC', color: '#8A6516', fontFamily: FONT.mono, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>{plus.how.labels.missed}</span>
          <span style={{ fontFamily: FONT.ui, fontSize: portrait ? 21 : 17, color: C.soft }}>{kit.seq.missed}</span>
        </div>
      </div>

      {/* ---- the phone ---- */}
      <div style={{ position: 'absolute', left: phoneX, top: phoneY }}>
        <Phone t={t} kit={kit} plus={plus} width={phoneW} />
      </div>

      {/* ---- Today ---- */}
      <div
        style={{
          position: 'absolute',
          left: portrait ? 60 : 70,
          top: portrait ? lerp(h + 20, 170, todayIn) : lerp(h + 20, 470, todayIn),
          opacity: todayIn,
        }}
      >
        <TodayCard t={t} kit={kit} plus={plus} width={portrait ? w - 120 : 470} />
      </div>

      {/* ---- end card ---- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
          background: `rgba(242,239,229,${0.97 * endIn})`,
          opacity: endIn,
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontFamily: FONT.display, fontSize: portrait ? 76 : 84, lineHeight: 1.02, color: C.ink, textAlign: 'center', letterSpacing: '-0.01em', transform: `translateY(${(1 - endIn) * 16}px)` }}>
          {plus.hero.h1a}
          <br />
          <span style={{ color: C.accent }}>{plus.hero.h1b}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: C.ink, color: C.paper, display: 'grid', placeItems: 'center', fontFamily: FONT.display, fontSize: 26 }}>j</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 20, color: C.soft }}>tryjunoapp.com</span>
        </div>
      </div>
    </div>
  )
}
