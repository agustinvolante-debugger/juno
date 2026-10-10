// "How to use your Juno Pen": under a minute, from plugging the pen in to asking WhatsApp.
//
// Like PenFilmScene, a pure function of time: the /pen/how-to page drives `t` from the clock,
// Remotion drives it from the frame number (video/), so the page and the MP4 are the same
// frames. Inline styles and SVG only, because no stylesheet exists inside the video renderer.
//
// Everything shown is the product as it is today: Connect pen (the folder picker on Chrome and
// Edge), Who's who for speaker names, People's "Detected on this call · Add all", the notes,
// to-dos and follow-up draft, and the WhatsApp assistant answering and setting a reminder.
//
//   0.0  the laptop from the side; the cap comes off, the pen goes in, it turns to face us
//   8.0  into the screen: Connect pen, the JUNO PEN folder
//  12.8  the import: who was on the call, everyone agreed, Import and transcribe
//  21.0  Who's who, then People      27.6  summary, to-dos, follow-up
//  37.8  the phone: WhatsApp          49.5  end card

import PenArt from '../PenArt'

export const HOWTO_SECONDS = 54
export type HowToFormat = 'landscape' | 'portrait'
export const HOWTO_SIZE: Record<HowToFormat, { w: number; h: number }> = {
  landscape: { w: 1280, h: 720 },
  portrait: { w: 720, h: 1280 },
}

const C = {
  paper: '#F2EFE5',
  side: '#E8E3D6',
  panel: '#FFFFFF',
  ink: '#16150F',
  soft: '#514E45',
  dim: '#646158',
  faint: '#8E8A80',
  line: '#DCD5C4',
  accent: '#0B6B44',
  accentWash: '#DCEDE3',
  amber: '#8A6516',
  amberWash: '#F7EFDC',
  bad: '#9E3229',
  waBg: '#EFE7DD',
  waMe: '#D9FDD3',
  waHead: '#F6F5F3',
}
const FONT = {
  display: "var(--font-display, 'Instrument Serif'), Georgia, serif",
  ui: "var(--font-ui, Inter), system-ui, -apple-system, sans-serif",
  mono: "var(--mono, var(--font-mono, 'IBM Plex Mono')), ui-monospace, Menlo, monospace",
  serif: "var(--serif, var(--font-serif, Literata)), Georgia, serif",
}

/* ------------------------------------------------------------------ time */

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const out = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const lerp = (a: number, b: number, x: number) => a + (b - a) * x
function enter(t: number, at: number, dur = 0.45, lift = 12) {
  const p = out(seg(t, at, at + dur))
  return { opacity: p, transform: `translateY(${(1 - p) * lift}px)` }
}
/** Text typed out from `at` at `cps` characters a second. */
const typed = (s: string, t: number, at: number, cps = 22) => s.slice(0, Math.max(0, Math.floor((t - at) * cps)))
/** Piecewise path through [time, x, y] keys, eased between each pair. */
function path(t: number, keys: [number, number, number][]): [number, number] {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]]
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1] = keys[i]
    const [t0, x0, y0] = keys[i - 1]
    if (t <= t1) {
      const p = inOut(seg(t, t0, t1))
      return [lerp(x0, x1, p), lerp(y0, y1, p)]
    }
  }
  const last = keys[keys.length - 1]
  return [last[1], last[2]]
}

/* ------------------------------------------------------------- the story */

// One story per landing-page audience (landing-audiences.ts keys). Same steps, same timing;
// only the call changes. Family is a parent-teacher conference, not the landing's doctor's
// visit: the import step ticks "contains no patient or medical information", and showing a
// medical recording there would contradict it.
export type HowToKitKey = 'sales' | 'students' | 'family' | 'founders'
type HowKit = {
  title: string
  meta: string
  /** The two people typed in at import, in order, with who they are (People panel). */
  people: [string, string][]
  /** Who's who: the speakers as the notes name them. */
  speakers: { name: string; share: number; you?: boolean }[]
  recent: [string, string, string][]
  summary: string[]
  todos: [string, string][]
  email: { to: string; subject: string; body: string }
  wa: { ask: string; answer: string; remind: string; done: string }
}

const FILE = 'REC_0412.WAV'
const KITS: Record<HowToKitKey, HowKit> = {
  sales: {
    title: 'Showing at 412 Oak St with Mark and Sarah',
    meta: '38:12 · property showing',
    people: [['Mark Ellis', 'Buyer · 412 Oak St'], ['Sarah Ellis', 'Buyer · 412 Oak St']],
    speakers: [{ name: 'You', share: 46, you: true }, { name: 'Mark Ellis', share: 38 }, { name: 'Sarah Ellis', share: 16 }],
    recent: [
      ['Buyer consult: the Patels', '24:05 · consultation', 'MON, SEP 29'],
      ['Listing walkthrough, 88 Pine Ave', '41:30 · walkthrough', 'FRI, SEP 26'],
      ['Team meeting', '18:44 · team meeting', 'THU, SEP 25'],
    ],
    summary: [
      'Mark and Sarah loved the kitchen and the backyard; the second bathroom needs work.',
      'Pre-approved with Chase up to $520K. They want to close by Nov 15.',
      'Main worry: the HOA fee. Mark heard $280 a month.',
    ],
    todos: [
      ['Send Mark the HOA documents', 'Today'],
      ['Confirm the HOA fee with the listing agent', 'Tomorrow'],
      ['Call Chase about the Nov 15 closing', 'Fri, Oct 3'],
    ],
    email: {
      to: 'Mark Ellis, Sarah Ellis',
      subject: 'Great seeing you at 412 Oak St',
      body: 'Hi Mark and Sarah, thanks for coming out today! As promised, I’m attaching the HOA documents, and I’m confirming the monthly fee with the listing agent…',
    },
    wa: {
      ask: 'What did Mark say about the closing date?',
      answer: 'Mark wants to close by *Nov 15*. He’s pre-approved with Chase up to $520K, and asked you to confirm the HOA fee (he heard $280 a month).\n\nFrom: Showing at 412 Oak St, today',
      remind: 'Remind me tomorrow at 9 to call the lender',
      done: 'Done ✅  I’ll remind you *tomorrow at 9:00 AM*: call the lender about Mark’s Nov 15 closing.',
    },
  },
  students: {
    title: 'Corporate Finance, lecture 6',
    meta: '52:40 · lecture',
    people: [['Prof. Ruiz', 'Professor · Corporate Finance'], ['Ana Torres', 'Classmate · study group']],
    speakers: [{ name: 'Prof. Ruiz', share: 78 }, { name: 'Ana Torres', share: 14 }, { name: 'You', share: 8, you: true }],
    recent: [
      ['Study group: problem set 4', '1:02:10 · study group', 'MON, SEP 29'],
      ['Corporate Finance, lecture 5', '50:12 · lecture', 'FRI, SEP 26'],
      ['Office hours with Prof. Ruiz', '14:30 · office hours', 'THU, SEP 25'],
    ],
    summary: [
      'WACC: weight each source of capital by its market value, not its book value.',
      'The midterm will look like the second worked example. One page of formulas allowed.',
      'The exam moved to Oct 24. Said once, at the very end.',
    ],
    todos: [
      ['Make the one-page formula sheet', 'Today'],
      ['Redo the second worked example', 'This week'],
      ['Swap lecture 5 notes with Ana', 'Fri, Oct 3'],
    ],
    email: {
      to: 'Ana Torres',
      subject: 'Notes from lecture 6',
      body: 'Hi Ana, here are my notes from today. Heads up: the midterm moved to Oct 24, and we can bring one page of formulas. Want to go over the second example on Thursday?…',
    },
    wa: {
      ask: 'When is the midterm, and what can I bring?',
      answer: 'The midterm moved to *Oct 24*. Prof. Ruiz said it will look like the second worked example, and you can bring *one page* of formulas.\n\nFrom: Corporate Finance, lecture 6',
      remind: 'Remind me Sunday at 6 about the formula sheet',
      done: 'Done ✅  I’ll remind you *Sunday at 6:00 PM*: make the one-page formula sheet for the Oct 24 midterm.',
    },
  },
  family: {
    title: 'Parent-teacher conference with Ms. Brooks',
    meta: '24:18 · school meeting',
    people: [['Ms. Brooks', 'Lily’s teacher · 3rd grade'], ['Alex Rivera', 'Lily’s dad']],
    speakers: [{ name: 'Ms. Brooks', share: 52 }, { name: 'You', share: 34, you: true }, { name: 'Alex Rivera', share: 14 }],
    recent: [
      ['Call with the summer camp', '12:05 · phone call', 'MON, SEP 29'],
      ['Family meeting: holiday plans', '31:40 · family meeting', 'FRI, SEP 26'],
      ['Contractor walkthrough, kitchen', '22:15 · walkthrough', 'THU, SEP 25'],
    ],
    summary: [
      'Lily is reading above grade level; her math facts need practice at home.',
      'Ms. Brooks suggests ten minutes of flashcards a night and the library reading challenge.',
      'The field trip permission slip and $15 are due Friday.',
    ],
    todos: [
      ['Sign the field trip slip and send $15', 'Today'],
      ['Start ten minutes of flashcards a night', 'This week'],
      ['Sign Lily up for the reading challenge', 'Fri, Oct 3'],
    ],
    email: {
      to: 'Ms. Brooks',
      subject: 'Thank you for today',
      body: 'Hi Ms. Brooks, thank you for the time today. We’ll start the flashcards tonight, and the permission slip will be in Lily’s folder tomorrow…',
    },
    wa: {
      ask: 'What did Ms. Brooks say about math?',
      answer: 'Lily’s math facts need practice: Ms. Brooks suggested *ten minutes of flashcards a night*. Her reading is above grade level.\n\nFrom: Parent-teacher conference, today',
      remind: 'Remind me tomorrow at 7 to sign the slip',
      done: 'Done ✅  I’ll remind you *tomorrow at 7:00 AM*: sign Lily’s field trip slip and send $15.',
    },
  },
  founders: {
    title: 'Northbeam Ventures: partner follow-up',
    meta: '41:05 · investor call',
    people: [['Priya Shah', 'Partner · Northbeam Ventures'], ['Dan Kim', 'Associate · Northbeam Ventures']],
    speakers: [{ name: 'You', share: 52, you: true }, { name: 'Priya Shah', share: 36 }, { name: 'Dan Kim', share: 12 }],
    recent: [
      ['Weekly team sync', '45:10 · team meeting', 'MON, SEP 29'],
      ['Customer call: Acme', '28:44 · sales call', 'FRI, SEP 26'],
      ['Board prep with Leo', '33:02 · one-on-one', 'THU, SEP 25'],
    ],
    summary: [
      'Priya likes the retention story; market size is the open question for her partners.',
      'She wants month-6 retention by channel by Wednesday, for Monday’s partner meeting.',
      'She asked who else is in the round. Nobody answered.',
    ],
    todos: [
      ['Send Priya month-6 retention by channel', 'Today'],
      ['Answer who else is in the round', 'Tomorrow'],
      ['Prep the market-size slide for Monday', 'Fri, Oct 3'],
    ],
    email: {
      to: 'Priya Shah, Dan Kim',
      subject: 'Retention by channel, as promised',
      body: 'Hi Priya, thanks for the time today. Attached is month-6 retention by channel. On your question about the round: we’re talking to two other funds…',
    },
    wa: {
      ask: 'What does Priya need before Monday?',
      answer: 'Priya wants *month-6 retention by channel* by Wednesday, so she can take it to Monday’s partner meeting. Market size is her partners’ main question.\n\nFrom: Northbeam Ventures, today',
      remind: 'Remind me Wednesday at 9 to send Priya the numbers',
      done: 'Done ✅  I’ll remind you *Wednesday at 9:00 AM*: send Priya month-6 retention by channel.',
    },
  },
}

/* ---------------------------------------------------------------- pieces */

function Cursor({ x, y, down }: { x: number; y: number; down: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 30, pointerEvents: 'none' }}>
      {down > 0 && (
        <span style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%', border: `2px solid ${C.accent}`, opacity: 1 - down, transform: `scale(${0.4 + down * 0.9})` }} />
      )}
      <svg width="26" height="30" viewBox="0 0 26 30" style={{ position: 'absolute', left: -3, top: -2, transform: `scale(${1 - 0.12 * Math.sin(down * Math.PI)})`, transformOrigin: '3px 2px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.3))' }}>
        <path d="M3 2 L3 24 L9 18.5 L13 27 L17 25.2 L13 17 L21 17 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** 0 to 1 for the half second after a click at `at`; 0 otherwise. */
const click = (t: number, at: number) => (t >= at && t < at + 0.5 ? (t - at) / 0.5 : 0)

function Check({ on, size = 20 }: { on: number; size?: number }) {
  return (
    <span style={{ flex: 'none', width: size, height: size, borderRadius: '50%', border: `1.5px solid ${on ? C.accent : C.line}`, background: on ? C.accent : 'transparent', display: 'grid', placeItems: 'center' }}>
      <svg viewBox="0 0 20 20" width={size * 0.64} height={size * 0.64} aria-hidden>
        <path d="M5.2 10.4 8.4 13.6 14.8 6.8" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14" strokeDashoffset={14 * (1 - on)} />
      </svg>
    </span>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: C.dim, ...style }}>{children}</div>
}

function Avatar({ name, size = 26, tone = C.accent }: { name: string; size?: number; tone?: string }) {
  return (
    <span style={{ flex: 'none', width: size, height: size, borderRadius: '50%', background: tone, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FONT.ui, fontWeight: 600, fontSize: size * 0.42 }}>
      {name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
    </span>
  )
}

/* ------------------------------------------------------------ the laptop */

/** Window-space size of the app, as drawn on the laptop's screen and full frame. */
const WIN = { w: 1120, h: 630 }
/** How far the screen leans back from upright. */
const TILT = 12

/** The laptop's measurements for a given screen width, shared by the drawing and the scene. */
function lapGeo(lapW: number) {
  const sh = (lapW * WIN.h) / WIN.w // the screen itself
  const SW = lapW + 28 // with its bezel
  const SH = sh + 32
  const r = (TILT * Math.PI) / 180
  const yh = (SH / 2) * Math.cos(r) // the hinge, below and in front of the screen's centre
  const zh = (SH / 2) * Math.sin(r)
  const D = lapW * 0.62 // depth of the base
  const T = 22 // its thickness
  const BW = SW + 30
  // The USB-C port, on the base's right side, towards the front.
  // Set in the upper part of the side, as on a MacBook.
  const port = { x: BW / 2, y: yh + T * 0.42, z: zh + D - D * 0.18 - 7 }
  return { sh, SW, SH, yh, zh, D, T, BW, port }
}

/** One flat face of the laptop, centred at (x, y, z) and turned by `turn`. */
function Face({ w, h, x, y, z, turn = '', style, children }: { w: number; h: number; x: number; y: number; z: number; turn?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: `translate3d(${x - w / 2}px, ${y - h / 2}px, ${z}px) ${turn}`, backfaceVisibility: 'hidden', ...style }}>
      {children}
    </div>
  )
}

/**
 * The laptop in 3D, built around the centre of its screen (which is where it turns). `gy` turns
 * it left and right (about -44 shows its right side, 0 faces us), `gx` tips it towards us.
 * `pen` is drawn in the plane of the port, so it turns with the laptop once it is plugged in.
 */
function Laptop3D({ t, lapW, gx, gy, pen, k }: { t: number; lapW: number; gx: number; gy: number; pen: React.ReactNode; k: HowToKitKey }) {
  const { sh, SW, SH, yh, zh, D, T, BW, port } = lapGeo(lapW)
  const s = lapW / WIN.w
  const connected = seg(t, 3.9, 4.3)
  const toast = seg(t, 5.0, 5.4)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `rotateX(${gx}deg) rotateY(${gy}deg)` }}>
      {/* Shadow on the table */}
      <Face w={BW * 1.25} h={D * 1.4} x={0} y={yh + T + 1} z={zh + D / 2} turn="rotateX(90deg)" style={{ background: 'radial-gradient(closest-side, rgba(22,21,15,.22), rgba(22,21,15,.08) 60%, transparent)', backfaceVisibility: 'visible' }} />
      {/* Base: top, front, both sides */}
      <Face w={BW} h={D} x={0} y={yh} z={zh + D / 2} turn="rotateX(90deg)" style={{ borderRadius: 10, background: 'linear-gradient(180deg, #C9CCD0, #DADCDF 40%, #D2D5D8)' }}>
        <div style={{ position: 'absolute', left: '9%', right: '9%', top: '8%', height: '44%', borderRadius: 6, background: 'repeating-linear-gradient(90deg, #2A2C30 0 22px, #3A3D42 22px 25px), #2A2C30', opacity: 0.85 }} />
        <div style={{ position: 'absolute', left: '33%', right: '33%', top: '60%', bottom: '8%', borderRadius: 8, background: '#C3C6CA', boxShadow: 'inset 0 0 0 1px #B4B8BD' }} />
      </Face>
      <Face w={BW} h={T} x={0} y={yh + T / 2} z={zh + D} style={{ borderRadius: '0 0 8px 8px', background: 'linear-gradient(#B8BCC1, #9DA2A8)' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 110, marginLeft: -55, height: 6, borderRadius: '0 0 7px 7px', background: '#A7ABB0' }} />
      </Face>
      <Face w={D} h={T} x={BW / 2} y={yh + T / 2} z={zh + D / 2} turn="rotateY(90deg)" style={{ borderRadius: 4, background: 'linear-gradient(#AEB2B7, #8E9399)' }}>
        {/* USB-C port; glows once the pen is in */}
        <div style={{ position: 'absolute', left: D * 0.18, top: T * 0.42 - 3.5, width: 15, height: 7, borderRadius: 3.5, background: '#1E2023', boxShadow: connected ? `0 0 ${12 * connected}px ${C.accent}` : 'none' }} />
      </Face>
      <Face w={D} h={T} x={-BW / 2} y={yh + T / 2} z={zh + D / 2} turn="rotateY(-90deg)" style={{ borderRadius: 4, background: 'linear-gradient(#AEB2B7, #8E9399)' }} />
      {/* Lid, from behind */}
      <Face w={SW} h={SH} x={0} y={0} z={0} turn={`rotateX(${TILT}deg) rotateY(180deg)`} style={{ borderRadius: '16px 16px 4px 4px', background: 'linear-gradient(135deg, #D5D8DB, #A9AEB4)' }} />
      {/* Screen */}
      <Face w={SW} h={SH} x={0} y={0} z={0} turn={`rotateX(${TILT}deg)`} style={{ boxSizing: 'border-box', padding: 14, paddingBottom: 18, borderRadius: '16px 16px 4px 4px', background: '#1C1D20' }}>
        <div style={{ position: 'relative', width: lapW, height: sh, overflow: 'hidden', borderRadius: 4, background: C.paper }}>
          <div style={{ width: WIN.w, height: WIN.h, transform: `scale(${s})`, transformOrigin: '0 0' }}>{HOME_SCREENS[k]}</div>
          {/* The system's "drive connected" notice */}
          <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,.96)', boxShadow: '0 6px 16px -6px rgba(0,0,0,.35)', fontFamily: FONT.ui, fontSize: 11, color: C.ink, opacity: toast, transform: `translateX(${(1 - out(toast)) * 30}px)` }}>
            <DriveIcon size={22} />
            <span style={{ lineHeight: 1.25 }}>
              <strong style={{ display: 'block' }}>JUNO PEN</strong>
              <span style={{ color: C.dim }}>connected</span>
            </span>
          </div>
        </div>
      </Face>
      {/* The pen, in the plane of the port */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `translateZ(${port.z}px)` }}>{pen}</div>
    </div>
  )
}

function DriveIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="3" y="7" width="22" height="14" rx="3" fill="#E9EBEE" stroke="#9AA0A6" />
      <rect x="6" y="15" width="10" height="2" rx="1" fill="#9AA0A6" />
      <circle cx="21" cy="16" r="1.4" fill={C.accent} />
    </svg>
  )
}

/** The pen, flipped so its USB-C plug points left, in two parts: the body (with the plug) and
 *  the cap. `capOff` 0 to 1 pulls the cap away; the body is positioned by its plug's tip. */
function PenPlug({ width, capOff, x, y, opacity = 1 }: { width: number; capOff: number; x: number; y: number; opacity?: number }) {
  const h = (width * 120) / 800
  // In the 800-unit open drawing, the body and plug run from 0 to 345, the cap from 346 on.
  const bodyW = (width * 345) / 800
  const capW = width - bodyW
  // The open drawing leaves an 84-unit gap; closing it puts the cap back over the plug.
  const gap = (84 * width) / 800
  return (
    <div style={{ position: 'absolute', left: x, top: y - h / 2, width: 0, height: h, opacity }}>
      {/* Body, with the plug's tip at the origin */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: bodyW, height: h, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -(width - bodyW), top: 0, width, height: h, transform: 'scaleX(-1)' }}>
          <PenArt id="howto-body" variant="open" shadow={false} />
        </div>
      </div>
      {/* Cap, pulled off to the left and down, then gone */}
      <div style={{ position: 'absolute', left: -capW + gap - out(seg(capOff, 0, 0.45)) * (gap + 24), top: inOut(seg(capOff, 0.35, 1)) * 70, width: capW, height: h, overflow: 'hidden', opacity: 1 - seg(capOff, 0.6, 1), transform: `rotate(${-seg(capOff, 0.35, 1) * 10}deg)` }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width, height: h, transform: 'scaleX(-1)' }}>
          <PenArt id="howto-cap" variant="open" shadow={false} />
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- the app window */

function SideItem({ icon, label, n, on }: { icon: string; label: string; n?: number; on?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: on ? C.panel : 'transparent', border: `1px solid ${on ? C.line : 'transparent'}`, fontSize: 14, fontWeight: 600, color: on ? C.accent : C.soft }}>
      <span style={{ width: 18, textAlign: 'center', fontSize: 14 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {n != null && <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.dim, fontWeight: 400 }}>{n}</span>}
    </div>
  )
}

/** Window-space positions the cursor aims at. */
const AT = {
  connect: [125, 132] as [number, number],
  folder: [524, 224] as [number, number],
  select: [786, 455] as [number, number],
  who: [520, 322] as [number, number],
  consent: [708, 321] as [number, number],
  importBtn: [376, 401] as [number, number],
  row: [520, 212] as [number, number],
  nameB: [460, 299] as [number, number],
  save: [597, 299] as [number, number],
  addAll: [1036, 366] as [number, number],
  todo: [742, 245] as [number, number],
  email: [1023, 449] as [number, number],
}

function AppWindow({ t, k }: { t: number; k: HowKit }) {
  // Which screen: home with the import (before 21), the recording (after).
  const onRecording = t >= 21.0
  return (
    <div style={{ position: 'relative', width: WIN.w, height: WIN.h, background: C.paper, borderRadius: 14, overflow: 'hidden', fontFamily: FONT.ui, color: C.ink, border: `1px solid ${C.line}` }}>
      {/* Title bar */}
      <div style={{ height: 30, display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', background: '#ECE8DD', borderBottom: `1px solid ${C.line}` }}>
        {['#E96E5F', '#E7B94F', '#69B865'].map((c) => (
          <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: C.dim, fontFamily: FONT.mono }}>tryjunoapp.com</span>
      </div>
      <div style={{ display: 'flex', height: WIN.h - 30 }}>
        {/* Sidebar */}
        <div style={{ width: 236, flex: 'none', padding: 14, background: C.side, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <span style={{ width: 30, height: 30, borderRadius: 7, background: C.ink, color: C.paper, display: 'grid', placeItems: 'center', fontFamily: FONT.display, fontSize: 21 }}>j</span>
            <span style={{ fontFamily: FONT.display, fontSize: 22 }}>Juno Pen</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 11, background: C.accent, color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: t > 9.8 && t < 10.4 ? `0 0 0 4px ${C.accentWash}` : 'none' }}>
            <span style={{ fontSize: 15 }}>⌁</span> Connect pen
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 11, border: `1.5px dashed ${C.line}`, background: '#F3F0E8' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>+ Add audio files</div>
            <div style={{ fontSize: 11.5, color: C.dim }}>or drag them here</div>
          </div>
          <div style={{ height: 6 }} />
          <SideItem icon="⌂" label="Home" n={onRecording ? 4 : 3} on={!onRecording} />
          <SideItem icon="≡" label="All recordings" n={t >= IMP.landed ? 4 : 3} on={onRecording} />
          <SideItem icon="▭" label="Meetings" n={t >= IMP.landed ? 3 : 2} />
          <div style={{ flex: 1 }} />
          <div style={{ padding: 12, borderRadius: 12, background: C.accentWash, fontFamily: FONT.display, fontStyle: 'italic', fontSize: 17, color: '#08482E', lineHeight: 1.2 }}>
            “Small moments.
            <br />
            Bigger progress.”
          </div>
        </div>
        {/* Main */}
        <div style={{ flex: 1, position: 'relative', padding: '18px 24px', overflow: 'hidden' }}>
          <div style={{ height: 38, borderRadius: 12, background: C.panel, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 14px', fontFamily: FONT.serif, fontSize: 14, color: C.faint, marginBottom: 18 }}>
            ⌕&nbsp;&nbsp;Ask anything… type @ for a person or recording
          </div>
          {onRecording ? <RecordingView t={t} k={k} /> : <HomeView t={t} k={k} />}
        </div>
      </div>
      {/* The browser's folder picker, over everything */}
      <FolderPicker t={t - 0.8} />
    </div>
  )
}

/** The app's home screen as the laptop shows it before anything happens: built once, since
 *  the 3D laptop redraws every frame and this never changes. */
const HOME_SCREENS = Object.fromEntries((Object.keys(KITS) as HowToKitKey[]).map((key) => [key, <AppWindow key={key} t={0} k={KITS[key]} />])) as Record<HowToKitKey, React.ReactNode>

// The import, as the app does it after Connect pen: the file from the pen, who was on the call,
// the consent box (in Florida and other states every party must agree), then Import and transcribe.
const IMP = { open: 12.8, mark: 14.1, sarah: 15.2, consent: 16.8, go: 17.7, landed: 19.8 }

function ImportPanel({ t, k }: { t: number; k: HowKit }) {
  const [one, two] = [k.people[0][0], k.people[1][0]]
  const markTyped = typed(one, t, IMP.mark, 12)
  const sarahTyped = typed(two, t, IMP.sarah, 12)
  const chips = [t >= IMP.mark + 0.9 && one, t >= IMP.sarah + 1.0 && two].filter(Boolean) as string[]
  const typing = t < IMP.mark + 0.9 ? markTyped : t >= IMP.sarah && t < IMP.sarah + 1.0 ? sarahTyped : ''
  const focused = t >= 14.0 && t < 16.4
  const consent = t >= IMP.consent
  const prog = seg(t, IMP.go + 0.1, IMP.landed - 0.2)
  const phase = prog < 0.4 ? 'Uploading' : prog < 0.75 ? 'Transcribing' : 'Writing notes'
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, marginBottom: 16, ...enter(t, IMP.open, 0.5) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT.display, fontSize: 22 }}>1 on “JUNO PEN”</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.dim, textDecoration: 'underline' }}>clear</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', marginTop: 10, borderTop: `1px solid #EEE9DD` }}>
        <span style={{ width: 17, height: 17, borderRadius: 4, background: C.accent, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>✓</span>
        <span style={{ flex: 1, fontSize: 14.5 }}>{FILE}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.dim }}>36.4 MB</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 12.5, color: C.faint }}>10/1/2026</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
        <div>
          <Label>Who was on this call (optional)</Label>
          <div style={{ marginTop: 7, minHeight: 40, boxSizing: 'border-box', borderRadius: 10, border: `1.5px solid ${focused ? C.accent : C.line}`, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '5px 8px' }}>
            {chips.map((n) => (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 4px', borderRadius: 999, background: C.accentWash, color: '#08482E', fontSize: 13, fontWeight: 600 }}>
                <Avatar name={n} size={20} /> {n}
              </span>
            ))}
            <span style={{ fontSize: 14, color: typing ? C.ink : C.faint, display: 'inline-flex', alignItems: 'center' }}>
              {typing || (chips.length ? '' : 'Add a person…')}
              {focused && Math.floor(t * 2.5) % 2 === 0 && <span style={{ width: 1.5, height: 16, background: C.ink, marginLeft: 1 }} />}
            </span>
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: C.faint }}>Leave it empty and the notes will suggest who they heard.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: 10, background: '#FAF3E3', border: '1px solid #EFE2C4', alignSelf: 'start', marginTop: 18 }}>
          <span style={{ flex: 'none', marginTop: 1, width: 17, height: 17, borderRadius: 4, border: `1.5px solid ${consent ? C.accent : '#C9B98F'}`, background: consent ? C.accent : '#fff', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>{consent ? '✓' : ''}</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.4, color: C.amber }}>Everyone recorded agreed to it, and this recording contains no patient or medical information.</span>
        </div>
      </div>
      {t < IMP.go + 0.1 ? (
        <div style={{ display: 'inline-block', marginTop: 16, padding: '10px 16px', borderRadius: 10, background: consent ? C.accent : '#8DB7A2', color: '#fff', fontSize: 14, fontWeight: 600 }}>Import 1 and transcribe</div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT.mono, fontSize: 12.5, color: C.soft }}>
            <span>{FILE}</span>
            <span>{phase}</span>
          </div>
          <div style={{ marginTop: 7, height: 4, borderRadius: 2, background: C.line }}>
            <div style={{ height: 4, borderRadius: 2, background: C.accent, width: `${prog * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function HomeView({ t, k }: { t: number; k: HowKit }) {
  const landed = t >= IMP.landed
  const rows = k.recent
  return (
    <div>
      <div style={{ fontFamily: FONT.display, fontSize: 28, marginBottom: 14 }}>{landed ? 4 : 3} recordings, and what came out of them</div>
      {t >= IMP.open && !landed && <ImportPanel t={t} k={k} />}
      <Label style={{ marginBottom: 8 }}>Recent recordings</Label>
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        {landed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: `1px solid ${C.line}`, background: '#F4FAF6', ...enter(t, IMP.landed, 0.5, 10) }}>
            <span style={{ width: 36, height: 36, borderRadius: 9, background: C.accentWash, color: C.accent, display: 'grid', placeItems: 'center', fontSize: 16 }}>♪</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{k.title}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.dim, marginTop: 3 }}>{k.meta} · with {k.people.map((p) => p[0]).join(', ')}</div>
            </div>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 6, background: C.accentWash, color: '#08482E' }}>NOTED</span>
          </div>
        )}
        {rows.map(([title, meta, day], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < rows.length - 1 ? `1px solid ${C.line}` : 'none' }}>
            <span style={{ width: 36, height: 36, borderRadius: 9, background: '#F0ECE2', color: C.dim, display: 'grid', placeItems: 'center', fontSize: 16 }}>♪</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11.5, color: C.dim, marginTop: 3 }}>{meta}</div>
            </div>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>{day}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FolderPicker({ t }: { t: number }) {
  const open = out(seg(t, 9.5, 9.9)) * (1 - seg(t, 11.7, 12.0))
  if (open <= 0) return null
  const picked = t >= 10.9
  return (
    <div style={{ position: 'absolute', inset: 0, background: `rgba(22,21,15,${0.22 * open})`, display: 'grid', placeItems: 'center', zIndex: 10 }}>
      <div style={{ width: 560, borderRadius: 14, background: '#FBFAF7', boxShadow: '0 30px 60px -20px rgba(0,0,0,.45)', overflow: 'hidden', opacity: open, transform: `scale(${0.96 + 0.04 * open})`, fontFamily: FONT.ui }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 14 }}>Choose the pen’s folder</div>
        <div style={{ display: 'flex', minHeight: 230 }}>
          <div style={{ width: 160, padding: 12, borderRight: `1px solid ${C.line}`, background: '#F3F1EC', fontSize: 13, color: C.soft, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label>Locations</Label>
            <span>Desktop</span>
            <span>Documents</span>
            <span>Downloads</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, background: C.accentWash, color: '#08482E', fontWeight: 600 }}>
              <DriveIcon size={18} /> JUNO PEN
            </span>
          </div>
          <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: picked ? C.accent : 'transparent', color: picked ? '#fff' : C.ink, fontWeight: 600 }}>
              <span>📁</span> RECORD
            </div>
            <div style={{ padding: '8px 10px', color: C.faint }}>📁 SYSTEM</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', borderTop: `1px solid ${C.line}` }}>
          <span style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}>Cancel</span>
          <span style={{ padding: '8px 18px', borderRadius: 8, background: picked ? C.accent : '#BFD8CB', color: '#fff', fontSize: 13, fontWeight: 600 }}>Select</span>
        </div>
      </div>
    </div>
  )
}

function RecordingView({ t, k }: { t: number; k: HowKit }) {
  // 21.0 Who's who, matched to the names given at import · 22.0 People · 24.3 Add all · 27.6 notes
  const added = t >= 24.6
  const notes = t >= 27.6
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.dim, letterSpacing: '.06em' }}>WED, OCT 1 · {k.meta}</div>
      <div style={{ fontFamily: FONT.display, fontSize: 30, margin: '4px 0 14px' }}>{k.title}</div>

      {!notes ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Who's who */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, alignSelf: 'start', ...enter(t, 21.0, 0.5) }}>
            <Label style={{ marginBottom: 12 }}>Who’s who</Label>
            {k.speakers.map((x, i) => ({ sp: `Speaker ${'ABC'[i]}`, name: x.name, share: x.share, you: !!x.you, note: x.you ? '' : 'matched by voice' })).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i ? `1px solid #EEE9DD` : 'none', ...enter(t, 21.3 + i * 0.25, 0.4, 6) }}>
                <span style={{ width: 82, fontFamily: FONT.mono, fontSize: 11.5, color: C.dim }}>{r.sp}</span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={r.name} size={24} tone={r.you ? C.ink : C.accent} />
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{r.name}</span>
                  {r.note && <span style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.faint }}>{r.note}</span>}
                </span>
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>{r.share}%</span>
              </div>
            ))}
          </div>
          {/* People */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, alignSelf: 'start', ...enter(t, 22.0, 0.5) }}>
            <Label style={{ marginBottom: 12 }}>People</Label>
            {!added ? (
              <>
                <div style={{ fontSize: 13, color: C.dim, marginBottom: 10 }}>Detected on this call · not saved yet</div>
                {k.people.map(([n]) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                    <Avatar name={n} size={26} tone="#B9B3A3" />
                    <span style={{ flex: 1, fontSize: 14.5 }}>{n}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <span style={{ padding: '8px 16px', borderRadius: 9, background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>Add all</span>
                </div>
              </>
            ) : (
              <>
                {k.people.map(([n, about], i) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', ...enter(t, 24.6 + i * 0.15, 0.4, 8) }}>
                    <Avatar name={n} size={30} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{n}</span>
                      <span style={{ display: 'block', fontFamily: FONT.serif, fontSize: 12.5, color: C.dim }}>{about}</span>
                    </span>
                    <span style={{ color: C.accent, fontSize: 15 }}>✓</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, fontSize: 12.5, color: C.dim, ...enter(t, 25.2, 0.4, 6) }}>
                  Now ask about them anywhere with <strong style={{ color: C.accent }}>@{k.people[0][0].replace(/^(Prof\.|Ms\.|Mr\.|Dr\.) /, '').split(' ')[0]}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <NotesView t={t - 3} k={k} />
      )}
    </div>
  )
}

function NotesView({ t, k }: { t: number; k: HowKit }) {
  const ticked = out(seg(t, 30.6, 30.95))
  const emailIn = out(seg(t, 32.3, 32.8))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16 }}>
      <div style={{ alignSelf: 'start', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, ...enter(t, 24.6, 0.5) }}>
        <Label style={{ marginBottom: 10 }}>Summary</Label>
        {k.summary.map((s, i) => {
          const at = 25.1 + i * 1.25
          return (
            <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 9, fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.5, minHeight: t >= at ? undefined : 0 }}>
              {t >= at && <span style={{ color: C.accent }}>•</span>}
              <span>{typed(s, t, at, 75)}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, ...enter(t, 28.6, 0.5) }}>
          <Label style={{ marginBottom: 10 }}>To-dos</Label>
          {k.todos.map(([what, when], i) => {
            const on = i === 0 ? ticked : 0
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', ...enter(t, 28.9 + i * 0.3, 0.4, 8) }}>
                <Check on={on} />
                <span>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: on ? C.faint : C.ink, textDecoration: on > 0.6 ? 'line-through' : 'none' }}>{what}</span>
                  <span style={{ display: 'block', fontFamily: FONT.serif, fontSize: 12.5, color: i === 0 ? C.amber : C.dim }}>{when}</span>
                </span>
              </div>
            )
          })}
        </div>
        <div style={{ background: C.panel, border: `1px solid ${emailIn ? C.accent : C.line}`, borderRadius: 14, padding: 16, ...enter(t, 31.4, 0.5) }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: emailIn ? 10 : 0 }}>
            <Label style={{ flex: 1 }}>Follow-up email · ready</Label>
            <span style={{ padding: '6px 12px', borderRadius: 8, background: C.accent, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>{emailIn ? 'Open in Gmail' : 'Open draft'}</span>
          </div>
          {emailIn > 0 && (
            <div style={{ opacity: emailIn }}>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 4 }}>To: {k.email.to}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{k.email.subject}</div>
              <div style={{ fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.5, color: C.soft }}>{typed(k.email.body, t, 32.7, 70)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the phone */

function WaText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} style={{ display: 'block', minHeight: line ? undefined : '0.6em' }}>
          {line.split(/(\*[^*]+\*)/g).map((part, j) => (/^\*[^*]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : <span key={j}>{part}</span>))}
        </span>
      ))}
    </>
  )
}

function Bubble({ me, children, style }: { me?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '8px 11px 7px', borderRadius: 10, borderTopRightRadius: me ? 3 : 10, borderTopLeftRadius: me ? 10 : 3, background: me ? C.waMe : C.panel, boxShadow: '0 1px 1px rgba(11,20,26,.13)', fontFamily: FONT.ui, fontSize: 15, lineHeight: 1.38, color: '#111B21', flex: 'none', ...style }}>
      {children}
    </div>
  )
}

function Phone({ t, width, k }: { t: number; width: number; k: HowKit }) {
  const { ask, answer, remind, done } = k.wa
  // The question is typed in the input, then sent; Juno answers; then the reminder.
  const plan: { at: number; me: boolean; text: string }[] = [
    { at: 38.4, me: true, text: ask },
    { at: 39.8, me: false, text: answer },
    { at: 43.2, me: true, text: remind },
    { at: 44.3, me: false, text: done },
  ]
  const typing = t >= 36.6 && t < 38.4 ? typed(ask, t, 36.6, ask.length / 1.6) : t >= 41.6 && t < 43.2 ? typed(remind, t, 41.6, remind.length / 1.4) : ''
  const thinking = (t >= 38.8 && t < 39.8) || (t >= 43.5 && t < 44.3)
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
            <span style={{ fontSize: 12.5, color: '#667781' }}>{thinking ? 'typing…' : 'online'}</span>
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8, padding: '12px 10px', overflow: 'hidden' }}>
          {plan
            .filter((b) => t >= b.at)
            .map((b, i) => (
              <Bubble key={i} me={b.me} style={enter(t, b.at, 0.35, 10)}>
                <WaText text={b.text.replace(/_([^_]+)_/g, '$1')} />
              </Bubble>
            ))}
          {thinking && (
            <Bubble style={{ display: 'flex', gap: 4, padding: '12px 14px' }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#8696A0', opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 6 + i)) }} />
              ))}
            </Bubble>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 18px', background: C.waHead }}>
          <span style={{ flex: 1, minHeight: 34, borderRadius: 17, background: '#fff', border: '1px solid #E4E1DC', display: 'flex', alignItems: 'center', padding: '6px 12px', fontFamily: FONT.ui, fontSize: 14, color: typing ? '#111B21' : '#8696A0', lineHeight: 1.3 }}>
            {typing || 'Message'}
          </span>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.accent, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 15 }}>{typing ? '➤' : '🎙'}</span>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- captions */

const STEPS: { at: number; until: number; n: string; text: string; sub?: string }[] = [
  { at: 0.4, until: 6.6, n: '1', text: 'Plug the pen into your computer', sub: 'Pull off the cap: the USB-C plug is underneath' },
  { at: 8.2, until: 12.6, n: '2', text: 'Click Connect pen, then select the recordings', sub: 'Open JUNO PEN and select them all' },
  { at: 12.9, until: 20.6, n: '3', text: 'Add who was there, and confirm everyone agreed', sub: 'In Florida and many states, everyone recorded must agree' },
  { at: 21.0, until: 27.2, n: '4', text: 'Check who’s who, and save the people', sub: 'Juno matches each voice to a name' },
  { at: 27.6, until: 37.6, n: '5', text: 'Your summary, to-dos and follow-up are ready', sub: 'Tick to-dos off as you go' },
  { at: 38.4, until: 49.2, n: '6', text: 'On the go? Ask on WhatsApp', sub: 'Questions about any call, and reminders' },
]

function Caption({ t, portrait }: { t: number; portrait: boolean }) {
  const s = STEPS.find((x) => t >= x.at - 0.05 && t < x.until + 0.4)
  if (!s) return null
  const o = out(seg(t, s.at, s.at + 0.4)) * (1 - seg(t, s.until, s.until + 0.4))
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: portrait ? 70 : 22, display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${(1 - o) * 8}px)`, zIndex: 40, padding: portrait ? '0 36px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: portrait ? '14px 20px' : '10px 18px 10px 12px', borderRadius: 16, background: 'rgba(255,255,255,.94)', border: `1px solid ${C.line}`, boxShadow: '0 12px 30px -16px rgba(22,21,15,.4)', maxWidth: portrait ? 648 : 900 }}>
        <span style={{ flex: 'none', width: portrait ? 40 : 34, height: portrait ? 40 : 34, borderRadius: '50%', background: C.accent, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FONT.mono, fontSize: portrait ? 18 : 16 }}>{s.n}</span>
        <span>
          <span style={{ display: 'block', fontFamily: FONT.ui, fontWeight: 700, fontSize: portrait ? 26 : 22, color: C.ink, lineHeight: 1.2 }}>{s.text}</span>
          {s.sub && <span style={{ display: 'block', fontFamily: FONT.serif, fontSize: portrait ? 18 : 15, color: C.dim, marginTop: 2 }}>{s.sub}</span>}
        </span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- scene */

export default function HowToScene({ t, format = 'landscape', kit = 'sales' }: { t: number; format?: HowToFormat; kit?: HowToKitKey }) {
  const k = KITS[kit] ?? KITS.sales
  const { w, h } = HOWTO_SIZE[format]
  const portrait = format === 'portrait'

  /* -- the app window's place, used by the zoom and by steps 2–5 -- */
  // Landscape: the window fills the frame. Portrait: it is wider than the frame, so a camera
  // follows the action (focus in window space).
  const winScale = portrait ? 1.12 : Math.min((w - 60) / WIN.w, (h - 110) / WIN.h)
  const FOCUS: [number, number, number][] = [
    [7.7, 330, 300],
    [9.2, 300, 220],
    [10.4, 560, 300],
    [12.6, 560, 280],
    [13.4, 500, 300],
    [15.9, 520, 310],
    [16.4, 690, 310],
    [17.1, 690, 310],
    [17.6, 430, 340],
    [19.9, 520, 240],
    [21.2, 520, 270],
    [22.8, 850, 290],
    [27.6, 450, 300],
    [31.4, 430, 300],
    [32.0, 800, 320],
    [36.5, 840, 420],
  ]
  const cam = (tt: number) => {
    const f = path(tt, FOCUS)
    return portrait ? [w / 2 - f[0] * winScale, 680 - f[1] * winScale] : [(w - WIN.w * winScale) / 2, 86]
  }
  const [camX, camY] = cam(t)

  /* -- 1. the laptop, from the side; the pen goes in; it turns to face us (0 – 8) -- */
  const lapW = portrait ? 380 : 460
  const geo = lapGeo(lapW)
  // Where the screen's centre sits in the frame: the laptop turns about it.
  const P = portrait ? { x: w / 2 + 30, y: 600 } : { x: w / 2 - 150, y: 262 }
  const turn = inOut(seg(t, 4.2, 5.8)) // side → three-quarter
  const zoom = inOut(seg(t, 6.2, 7.7)) // three-quarter → flat, into the screen
  const gy = lerp(lerp(-44, -14, turn), 0, zoom)
  const gx = lerp(lerp(-9, -10, turn), -TILT, zoom)
  const penW = portrait ? 270 : 330
  const capOff = seg(t, 1.3, 2.4)
  const arrive = inOut(seg(t, 0.2, 1.4))
  const capW = penW - (penW * 345) / 800
  // The plug's tip, along the port's axis (x) in the port's plane: far out, cap off, then in.
  const tipX = t < 2.6 ? geo.port.x + capW + 30 + (1 - arrive) * 260 : lerp(geo.port.x + capW + 30, geo.port.x - 6, inOut(seg(t, 2.5, 3.7))) + (t > 3.7 && t < 3.95 ? Math.sin(seg(t, 3.7, 3.95) * Math.PI) * -3 : 0)
  const tipY = geo.port.y
  const [endX, endY] = cam(7.7)
  const lapScale = lerp(1, (WIN.w * winScale) / lapW, zoom)
  const lapDx = lerp(0, endX + (WIN.w * winScale) / 2 - P.x, zoom)
  const lapDy = lerp(0, endY + (WIN.h * winScale) / 2 - (P.y - 2), zoom)
  const lapLayer = t < 8.1

  // To the phone: landscape shrinks the window to the left, portrait fades it out.
  const toPhone = inOut(seg(t, 37.8, 39.0))
  // Drawn at one size and scaled, so the chat text grows with the phone in the vertical cut.
  const phoneW = 330
  const phoneZ = portrait ? 1.4 : 1
  const phoneX = portrait ? (w - phoneW * phoneZ) / 2 : w - phoneW - 110
  const phoneY = portrait ? lerp(h + 40, 230, toPhone) : lerp(h + 40, 30, toPhone)
  const endIn = out(seg(t, 49.5, 50.2))

  // The cursor, in window space, with the clicks it makes.
  const cur = path(t, [
    [8.4, 600, 420],
    [9.7, AT.connect[0], AT.connect[1]],
    [11.0, AT.connect[0], AT.connect[1]],
    [11.6, AT.folder[0], AT.folder[1]],
    [11.8, AT.folder[0], AT.folder[1]],
    [12.2, AT.select[0], AT.select[1]],
    [13.2, AT.select[0], AT.select[1]],
    [13.9, AT.who[0], AT.who[1]],
    [16.2, AT.who[0], AT.who[1]],
    [16.7, AT.consent[0], AT.consent[1]],
    [17.1, AT.consent[0], AT.consent[1]],
    [17.6, AT.importBtn[0], AT.importBtn[1]],
    [19.9, AT.importBtn[0], AT.importBtn[1]],
    [20.5, AT.row[0], AT.row[1]],
    [21.6, AT.row[0], AT.row[1]],
    [24.2, AT.addAll[0], AT.addAll[1]],
    [28.0, AT.addAll[0], AT.addAll[1]],
    [33.0, AT.todo[0], AT.todo[1]],
    [34.0, AT.todo[0], AT.todo[1]],
    [35.1, AT.email[0], AT.email[1]],
  ])
  const down = Math.max(...[9.8, 11.65, 12.3, 14.0, 16.8, 17.7, 20.6, 24.3, 33.55, 35.2].map((c) => click(t, c)))

  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: C.paper, fontFamily: FONT.ui }}>
      <div style={{ position: 'absolute', left: w * 0.1, top: h * 0.1, width: w * 0.8, height: h * 0.6, background: `radial-gradient(closest-side, ${C.accentWash}, transparent)`, opacity: 0.8 }} />

      {/* ---- 1. laptop + pen ---- */}
      {lapLayer && (
        <div style={{ position: 'absolute', inset: 0, opacity: (1 - seg(t, 7.7, 8.1)) * out(seg(t, 0, 0.6)), transform: `translate(${lapDx}px, ${lapDy}px) scale(${lapScale})`, transformOrigin: `${P.x}px ${P.y}px` }}>
          <div style={{ position: 'absolute', inset: 0, perspective: 3200, perspectiveOrigin: `${P.x}px ${P.y}px` }}>
            <div style={{ position: 'absolute', left: P.x, top: P.y, width: 0, height: 0, transformStyle: 'preserve-3d' }}>
              <Laptop3D t={t} k={KITS[kit] ? kit : 'sales'} lapW={lapW} gx={gx} gy={gy} pen={<PenPlug width={penW} capOff={capOff} x={tipX} y={tipY} opacity={out(seg(t, 0.3, 0.9))} />} />
            </div>
          </div>
        </div>
      )}

      {/* ---- 2–5. the app ---- */}
      {t >= 7.7 && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, opacity: seg(t, 7.7, 8.1) * (portrait ? 1 - toPhone : 1) * (1 - endIn) }}>
          <div
            style={{
              position: 'absolute',
              left: portrait ? camX : lerp(camX, 40, toPhone),
              top: portrait ? camY : lerp(camY, 150, toPhone),
              width: WIN.w,
              height: WIN.h,
              transform: `scale(${portrait ? winScale : lerp(winScale, 0.62, toPhone)})`,
              transformOrigin: '0 0',
              boxShadow: '0 30px 70px -30px rgba(22,21,15,.45)',
              borderRadius: 14,
            }}
          >
            <AppWindow t={t} k={k} />
            {t >= 8.2 && t < 37.8 && <Cursor x={cur[0]} y={cur[1]} down={down} />}
          </div>
        </div>
      )}

      {/* ---- 6. the phone ---- */}
      {t >= 37.8 && (
        <div style={{ position: 'absolute', left: phoneX, top: phoneY, opacity: 1 - endIn, transform: `scale(${phoneZ})`, transformOrigin: '0 0' }}>
          <Phone t={t - 3} width={phoneW} k={k} />
        </div>
      )}

      <Caption t={t} portrait={portrait} />

      {/* ---- end card ---- */}
      {endIn > 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: `rgba(242,239,229,${0.98 * endIn})`, opacity: endIn, padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: FONT.display, fontSize: portrait ? 84 : 92, lineHeight: 1, color: C.ink, transform: `translateY(${(1 - endIn) * 16}px)` }}>That’s it.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, ...enter(t, 50.4, 0.5, 10) }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: C.ink, color: C.paper, display: 'grid', placeItems: 'center', fontFamily: FONT.display, fontSize: 26 }}>j</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 20, color: C.soft }}>tryjunoapp.com</span>
          </div>
        </div>
      )}
    </div>
  )
}
