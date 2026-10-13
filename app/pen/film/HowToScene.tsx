// "How to use your Juno Pen": under a minute, from plugging the pen in to asking WhatsApp.
//
// Like PenFilmScene, a pure function of time: the /pen/how-to page drives `t` from the clock,
// Remotion drives it from the frame number (video/), so the page and the MP4 are the same
// frames. Inline styles and SVG only, because no stylesheet exists inside the video renderer.
//
// Everything shown is the product as it is today, in the app's current look (Oct 13): a cool
// grey canvas, white glass cards, Inter, near-black ink and one blue action colour. Connect pen
// opens the computer's file picker on the JUNO PEN drive, where the recordings are selected;
// then who was there and consent, Who's who for speaker names, People's "Add all", the notes,
// to-dos and follow-up draft, and the WhatsApp assistant answering and setting a reminder.
//
// The laptop is drawn, not photographed, and deliberately generic: a thin silver laptop with a
// black bezel and a small camera notch. No brand marks and no operating-system chrome.
//
//   0.0  the laptop from the side; the cap comes off, the pen goes in, it turns to face us
//   8.0  into the screen: Connect pen, the file picker on JUNO PEN
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

/** The app's tokens (app/pen/app-skin.css), as literals: the video has no stylesheet. */
const C = {
  stage: '#f2f3f7',
  canvas: '#f5f5f7',
  panel: '#ffffff',
  ink: '#1d1d1f',
  soft: '#424245',
  dim: '#6e6e73',
  faint: '#86868b',
  line: '#d2d2d7',
  hair: '#e8e8ed',
  blue: '#0066cc',
  blueHi: '#0071e3',
  blueInk: '#0055aa',
  blueWash: '#e8f1fc',
  blueLine: '#a9cdf2',
  amber: '#935400',
  amberWash: '#fff3df',
  amberLine: '#f2d6a4',
  red: '#c0281c',
  redWash: '#fdeceb',
  green: '#1b6e36',
  greenWash: '#e7f5ec',
  waBg: '#EFE7DD',
  waMe: '#D9FDD3',
  waHead: '#F6F5F3',
  waGreen: '#1f9d55',
}
const FONT = {
  /** Only for the logo's "j", which is the brand mark itself. */
  mark: "var(--font-display, 'Instrument Serif'), Georgia, serif",
  ui: "var(--font-ui, Inter), Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
}
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

/** Floating glass, as the app's cards. */
const GLASS: React.CSSProperties = {
  background: 'linear-gradient(150deg, rgba(255,255,255,.97), rgba(255,255,255,.86))',
  border: '1px solid rgba(255,255,255,.95)',
  borderRadius: 16,
  boxShadow: 'inset 0 1px 0 #fff, 0 1px 2px rgba(29,29,31,.05), 0 10px 22px -12px rgba(29,29,31,.16), 0 24px 44px -26px rgba(29,29,31,.18)',
}
/** The blue pill with depth. */
const PRIMARY: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  borderRadius: 999, background: 'linear-gradient(180deg, #1b7be3, #0066cc)', color: '#fff', fontWeight: 600,
  border: '1px solid #0062c4',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.32), 0 1px 2px rgba(0,51,122,.2), 0 7px 14px -7px rgba(0,102,204,.55)',
}
/** A small glass pill: the secondary buttons. */
const SECONDARY: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  borderRadius: 999, background: 'linear-gradient(180deg, #fff, rgba(255,255,255,.8))', color: C.ink, fontWeight: 500,
  border: '1px solid rgba(29,29,31,.1)',
  boxShadow: 'inset 0 1px 0 #fff, 0 1px 2px rgba(29,29,31,.06), 0 3px 8px -3px rgba(29,29,31,.1)',
}
/** The app canvas: grey with a few very soft cool tints. */
const CANVAS_BG = `radial-gradient(700px 420px at 4% -6%, rgba(168,192,232,.32), transparent 62%), radial-gradient(640px 420px at 104% 4%, rgba(212,202,242,.3), transparent 60%), ${C.canvas}`

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
        <span style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%', border: `2px solid ${C.blueHi}`, opacity: 1 - down, transform: `scale(${0.4 + down * 0.9})` }} />
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
    <span style={{ flex: 'none', width: size, height: size, borderRadius: '50%', border: `1.5px solid ${on ? C.blue : '#c7c7cc'}`, background: on ? C.blue : '#fff', display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
      <svg viewBox="0 0 20 20" width={size * 0.64} height={size * 0.64} aria-hidden>
        <path d="M5.2 10.4 8.4 13.6 14.8 6.8" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14" strokeDashoffset={14 * (1 - on)} />
      </svg>
    </span>
  )
}

/** A square tick box (the file list and the consent box). */
function Box({ on }: { on: boolean }) {
  return (
    <span style={{ flex: 'none', width: 17, height: 17, borderRadius: 5, boxSizing: 'border-box', border: `1.5px solid ${on ? C.blue : '#c7c7cc'}`, background: on ? C.blue : '#fff', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, lineHeight: 1 }}>
      {on ? '✓' : ''}
    </span>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: C.dim, ...style }}>{children}</div>
}

function Avatar({ name, size = 26, you = false, muted = false }: { name: string; size?: number; you?: boolean; muted?: boolean }) {
  return (
    <span style={{ flex: 'none', width: size, height: size, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,.9)', background: you ? C.ink : muted ? '#e8e8ed' : C.blueWash, color: you ? '#fff' : muted ? C.dim : C.blueInk, display: 'grid', placeItems: 'center', fontFamily: FONT.ui, fontWeight: 600, fontSize: size * 0.4 }}>
      {name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
    </span>
  )
}

/** The Juno mark: a serif "j" on a black tile. */
function Mark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ flex: 'none', width: size, height: size, borderRadius: size * 0.24, background: '#111', color: '#f5f5f7', display: 'grid', placeItems: 'center', fontFamily: FONT.mark, fontSize: size * 0.72, lineHeight: 1 }}>j</span>
  )
}

/** The category pill on a recording row, in the app's tint groups. */
function catTint(label: string): [string, string] {
  const c = label.toLowerCase()
  if (/(lecture|class|lesson|coach|office hours|talk|study)/.test(c)) return ['#f3ebfc', '#6e2ba8']
  if (/(plan|strategy|brainstorm|board|prep|product)/.test(c)) return [C.greenWash, C.green]
  if (/(note|to-?do|admin|memo)/.test(c)) return [C.amberWash, '#8a4f00']
  return [C.blueWash, C.blueInk]
}
function CatPill({ label }: { label: string }) {
  const [bg, fg] = catTint(label)
  const text = label.charAt(0).toUpperCase() + label.slice(1)
  return <span style={{ flex: 'none', padding: '3px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 600, border: '1px solid rgba(255,255,255,.85)', whiteSpace: 'nowrap' }}>{text}</span>
}

/* ------------------------------------------------------------ the laptop */

/** Window-space size of the app, as drawn on the laptop's screen and full frame. */
const WIN = { w: 1120, h: 630 }
/** The screen's black bezel, in window units: thin, as on a current laptop. */
const BEZEL = 18
/** The base under the screen when the laptop faces us, in window units. */
const BASE_H = 16
/** How far the screen leans back from upright. */
const TILT = 12

/** The laptop's measurements for a given screen width, shared by the drawing and the scene. */
function lapGeo(lapW: number) {
  const sh = (lapW * WIN.h) / WIN.w // the screen itself
  const bz = (BEZEL * lapW) / WIN.w // the bezel, at this size
  const SW = lapW + bz * 2 // with its bezel
  const SH = sh + bz * 2
  const r = (TILT * Math.PI) / 180
  const yh = (SH / 2) * Math.cos(r) // the hinge, below and in front of the screen's centre
  const zh = (SH / 2) * Math.sin(r)
  const D = lapW * 0.64 // depth of the base
  const T = Math.max(9, lapW * 0.024) // its thickness: thin
  const BW = SW * 1.04
  // The USB-C port, on the base's right side, towards the front, in the middle of the edge.
  const port = { x: BW / 2, y: yh + T * 0.5, z: zh + D - D * 0.18 - 7 }
  return { sh, bz, SW, SH, yh, zh, D, T, BW, port }
}

/** One flat face of the laptop, centred at (x, y, z) and turned by `turn`. */
function Face({ w, h, x, y, z, turn = '', style, children }: { w: number; h: number; x: number; y: number; z: number; turn?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: `translate3d(${x - w / 2}px, ${y - h / 2}px, ${z}px) ${turn}`, backfaceVisibility: 'hidden', ...style }}>
      {children}
    </div>
  )
}

/** Aluminium, light "starlight" silver. */
const ALU = {
  lid: 'linear-gradient(140deg, #eef0f2 0%, #dfe1e5 45%, #c9ccd1 100%)',
  deck: 'linear-gradient(180deg, #e9eaed, #dcdee2 55%, #d3d5d9)',
  edge: 'linear-gradient(180deg, #e3e5e8 0%, #c4c7cc 55%, #a9adb3 100%)',
  side: 'linear-gradient(180deg, #d6d8dc, #aeb2b8)',
}

/**
 * The laptop in 3D, built around the centre of its screen (which is where it turns). `gy` turns
 * it left and right (about -44 shows its right side, 0 faces us), `gx` tips it towards us.
 * `pen` is drawn in the plane of the port, so it turns with the laptop once it is plugged in.
 */
function Laptop3D({ t, lapW, gx, gy, pen, k }: { t: number; lapW: number; gx: number; gy: number; pen: React.ReactNode; k: HowToKitKey }) {
  const { sh, bz, SW, SH, yh, zh, D, T, BW } = lapGeo(lapW)
  const s = lapW / WIN.w
  const connected = seg(t, 3.9, 4.3)
  const toast = seg(t, 5.0, 5.4)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `rotateX(${gx}deg) rotateY(${gy}deg)` }}>
      {/* Shadow on the table */}
      <Face w={BW * 1.3} h={D * 1.45} x={0} y={yh + T + 1} z={zh + D / 2} turn="rotateX(90deg)" style={{ background: 'radial-gradient(closest-side, rgba(29,29,31,.2), rgba(29,29,31,.07) 60%, transparent)', backfaceVisibility: 'visible' }} />
      {/* Base: top deck (keyboard, trackpad), front edge with its lip, both sides */}
      <Face w={BW} h={D} x={0} y={yh} z={zh + D / 2} turn="rotateX(90deg)" style={{ borderRadius: 12, background: ALU.deck, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.55)' }}>
        {/* Keyboard well: a dark key grid, generic */}
        <div style={{ position: 'absolute', left: '7%', right: '7%', top: '7%', height: '46%', borderRadius: 7, background: '#cfd1d5', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.18)', padding: '1.2%', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 5, background: 'repeating-linear-gradient(90deg, transparent 0 18px, #cfd1d5 18px 21px), repeating-linear-gradient(180deg, transparent 0 13px, #cfd1d5 13px 16px), #2b2c30' }} />
        </div>
        {/* Trackpad, wide */}
        <div style={{ position: 'absolute', left: '29%', right: '29%', top: '59%', bottom: '7%', borderRadius: 9, background: 'linear-gradient(180deg, #e2e4e7, #d7d9dd)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.07), inset 0 1px 2px rgba(0,0,0,.06)' }} />
      </Face>
      <Face w={BW} h={T} x={0} y={yh + T / 2} z={zh + D} style={{ borderRadius: `0 0 ${T}px ${T}px`, background: ALU.edge }}>
        {/* The lip: a shallow scoop in the middle of the front edge, for opening the lid */}
        <div style={{ position: 'absolute', left: '50%', top: 0, width: BW * 0.16, marginLeft: -BW * 0.08, height: T * 0.42, borderRadius: `0 0 ${T}px ${T}px`, background: 'linear-gradient(180deg, #a6aab0, #c2c5ca)' }} />
      </Face>
      <Face w={D} h={T} x={BW / 2} y={yh + T / 2} z={zh + D / 2} turn="rotateY(90deg)" style={{ borderRadius: T / 2, background: ALU.side }}>
        {/* USB-C port; glows once the pen is in */}
        <div style={{ position: 'absolute', left: D * 0.18, top: T / 2 - 3, width: 13, height: 6, borderRadius: 3, background: '#1E2023', boxShadow: connected ? `0 0 ${12 * connected}px ${C.blueHi}` : 'none' }} />
      </Face>
      <Face w={D} h={T} x={-BW / 2} y={yh + T / 2} z={zh + D / 2} turn="rotateY(-90deg)" style={{ borderRadius: T / 2, background: ALU.side }} />
      {/* Lid, from behind: plain aluminium */}
      <Face w={SW} h={SH} x={0} y={0} z={0} turn={`rotateX(${TILT}deg) rotateY(180deg)`} style={{ borderRadius: bz * 1.6, background: ALU.lid, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.6)' }} />
      {/* Screen: thin black bezel, a small camera notch, the app filling it */}
      <Face w={SW} h={SH} x={0} y={0} z={0} turn={`rotateX(${TILT}deg)`} style={{ boxSizing: 'border-box', padding: bz, borderRadius: bz * 1.6, background: '#0d0d0f', boxShadow: '0 0 0 1px #c9ccd1' }}>
        <div style={{ position: 'relative', width: lapW, height: sh, overflow: 'hidden', borderRadius: bz * 0.6, background: C.canvas }}>
          <div style={{ width: WIN.w, height: WIN.h, transform: `scale(${s})`, transformOrigin: '0 0' }}>{HOME_SCREENS[k]}</div>
          {/* The system's "drive connected" notice: a generic one */}
          <div style={{ position: 'absolute', right: 10, top: 10 + bz * 0.6, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 12, background: 'rgba(255,255,255,.97)', boxShadow: '0 6px 16px -6px rgba(0,0,0,.3)', fontFamily: FONT.ui, fontSize: 11, color: C.ink, opacity: toast, transform: `translateX(${(1 - out(toast)) * 30}px)` }}>
            <DriveIcon size={22} />
            <span style={{ lineHeight: 1.25 }}>
              <strong style={{ display: 'block' }}>JUNO PEN</strong>
              <span style={{ color: C.dim }}>connected</span>
            </span>
          </div>
        </div>
        <Notch w={lapW * 0.075} h={bz * 0.62} />
      </Face>
      {/* The pen, in the plane of the port */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformStyle: 'preserve-3d', transform: `translateZ(${port3(lapW)}px)` }}>{pen}</div>
    </div>
  )
}
const port3 = (lapW: number) => lapGeo(lapW).port.z

/** The camera notch: a small black tab hanging from the top bezel, with the lens in it. */
function Notch({ w, h }: { w: number; h: number }) {
  return (
    <div style={{ position: 'absolute', left: '50%', top: 0, width: w, marginLeft: -w / 2, height: h * 2.1, borderRadius: `0 0 ${h}px ${h}px`, background: '#0d0d0f', zIndex: 3 }}>
      <span style={{ position: 'absolute', left: '50%', top: h * 0.55, width: h * 0.7, height: h * 0.7, marginLeft: -h * 0.35, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #3a4a66, #121418 70%)' }} />
    </div>
  )
}

/**
 * The same laptop, flat and facing us, drawn around the app window in window space while the
 * steps play: the bezel and notch around it, the base's front edge and lip below it. It matches
 * the 3D laptop at the end of its zoom, so the cut between them doesn't jump.
 */
function LaptopFront() {
  const bw = WIN.w + BEZEL * 2
  const baseW = bw * 1.04
  return (
    <>
      <div style={{ position: 'absolute', left: -BEZEL, top: -BEZEL, width: bw, height: WIN.h + BEZEL * 2, borderRadius: BEZEL * 1.6, background: '#0d0d0f', boxShadow: '0 0 0 2px #c9ccd1, 0 40px 70px -34px rgba(29,29,31,.45)', zIndex: 0 }} />
      <div style={{ position: 'absolute', left: (WIN.w - baseW) / 2, top: WIN.h + BEZEL, width: baseW, height: BASE_H, borderRadius: `3px 3px ${BASE_H}px ${BASE_H}px`, background: ALU.edge, boxShadow: '0 14px 22px -12px rgba(29,29,31,.35)', zIndex: 0 }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: baseW * 0.16, marginLeft: -baseW * 0.08, height: BASE_H * 0.42, borderRadius: `0 0 ${BASE_H}px ${BASE_H}px`, background: 'linear-gradient(180deg, #a6aab0, #c2c5ca)' }} />
      </div>
    </>
  )
}

function DriveIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="3" y="7" width="22" height="14" rx="3.5" fill="#eef0f3" stroke="#a1a6ad" />
      <rect x="6" y="15" width="10" height="2" rx="1" fill="#a1a6ad" />
      <circle cx="21" cy="16" r="1.5" fill={C.blueHi} />
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

const ICON: Record<string, React.ReactNode> = {
  home: <path d="M3.5 8.6 10 3.4l6.5 5.2V16a.9.9 0 0 1-.9.9h-3.4v-4.6H7.8v4.6H4.4a.9.9 0 0 1-.9-.9Z" />,
  recordings: <><path d="M10 3.3v9.1" /><path d="M6.6 6.1v3.5M13.4 6.1v3.5" /><path d="M4.2 15.9h11.6" /></>,
  meetings: <><rect x="2.8" y="5" width="14.4" height="10" rx="2" /><path d="M6.4 3.2v2M13.6 3.2v2" /></>,
  link: <><path d="M8.3 11.7 11.7 8.3" /><path d="M7.2 8.9 5.6 10.5a2.6 2.6 0 0 0 3.7 3.7l1.6-1.6" /><path d="M12.8 11.1l1.6-1.6a2.6 2.6 0 0 0-3.7-3.7L9.1 7.4" /></>,
  search: <><circle cx="8.8" cy="8.8" r="5.3" /><path d="M12.7 12.7 17 17" /></>,
  sparkle: <path d="M10 2.9l1.5 4.3 4.3 1.5-4.3 1.5L10 14.5 8.5 10.2 4.2 8.7l4.3-1.5Z" />,
  mail: <><rect x="2.6" y="4.8" width="14.8" height="10.4" rx="2" /><path d="M3.4 6.2 10 11l6.6-4.8" /></>,
  check: <path d="M4.6 10.4 8 13.8l7-7.6" />,
  chevron: <path d="M7.6 5.4 12.2 10l-4.6 4.6" />,
  back: <><path d="M16 10H4.4" /><path d="M8.6 5.6 4.2 10l4.4 4.4" /></>,
  people: <><circle cx="7.6" cy="7.4" r="2.5" /><path d="M2.9 16.2c.5-2.4 2.5-3.8 4.7-3.8s4.2 1.4 4.7 3.8" /><path d="M13.2 5.3a2.5 2.5 0 0 1 0 4.9" /><path d="M14 12.6c1.6.4 2.8 1.6 3.2 3.6" /></>,
  folder: <path d="M2.9 6.1a1.3 1.3 0 0 1 1.3-1.3h3.6l1.7 1.9h6.3a1.3 1.3 0 0 1 1.3 1.3v7.2a1.3 1.3 0 0 1-1.3 1.3H4.2a1.3 1.3 0 0 1-1.3-1.3Z" />,
  wave: <path d="M2.8 10h1.6M6 7v6M8.8 4.6v10.8M11.6 7.4v5.2M14.4 5.8v8.4M17.2 10h0" />,
  plus: <path d="M10 4.4v11.2M4.4 10h11.2" />,
}
function I({ n, size = 16, color = 'currentColor' }: { n: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none' }}>
      {ICON[n]}
    </svg>
  )
}

function SideItem({ icon, label, n, on }: { icon: string; label: string; n?: number; on?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 11, background: on ? '#fff' : 'transparent', boxShadow: on ? 'inset 0 1px 0 #fff, 0 1px 2px rgba(29,29,31,.06), 0 6px 14px -6px rgba(29,29,31,.16)' : 'none', fontSize: 13.5, fontWeight: on ? 600 : 500, color: on ? C.blueInk : C.soft }}>
      <I n={icon} size={17} color={on ? C.blue : C.dim} />
      <span style={{ flex: 1 }}>{label}</span>
      {n != null && <span style={{ fontSize: 12, color: on ? C.blue : C.dim, fontWeight: 500, ...NUM }}>{n}</span>}
    </div>
  )
}

/** Window-space positions the cursor aims at (measured from the drawn layout). */
const AT = {
  connect: [118, 129] as [number, number],
  folder: [560, 251] as [number, number],
  select: [807, 455] as [number, number],
  who: [470, 307] as [number, number],
  consent: [702, 305] as [number, number],
  importBtn: [358, 381] as [number, number],
  row: [560, 376] as [number, number],
  addAll: [1044, 376] as [number, number],
  todo: [719, 259] as [number, number],
  email: [1038, 412] as [number, number],
}

const SIDE_W = 212
const MAIN_X = 12 + SIDE_W + 20

function AppWindow({ t, k }: { t: number; k: HowKit }) {
  // Which screen: home with the import (before 21), the recording (after).
  const onRecording = t >= 21.0
  const landed = t >= IMP.landed
  return (
    <div data-win="" style={{ position: 'relative', width: WIN.w, height: WIN.h, background: CANVAS_BG, overflow: 'hidden', fontFamily: FONT.ui, color: C.ink, letterSpacing: '-0.006em' }}>
      {/* A plain browser bar: the address, nothing else */}
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(233,234,238,.92)', borderBottom: '1px solid rgba(29,29,31,.07)' }}>
        <span style={{ marginTop: 6, width: 320, height: 20, borderRadius: 999, background: 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center', fontSize: 11, color: C.dim }}>tryjunoapp.com</span>
      </div>
      <div style={{ position: 'relative', height: WIN.h - 34 }}>
        {/* Sidebar: one floating glass card */}
        <div style={{ position: 'absolute', left: 12, top: 12, bottom: 12, width: SIDE_W, boxSizing: 'border-box', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, ...GLASS, borderRadius: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
            <Mark size={28} />
            <span>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 16, letterSpacing: '-0.03em' }}>Juno Pen</span>
              <span style={{ display: 'block', fontSize: 10, color: C.dim }}>Capture. Understand. Do.</span>
            </span>
          </div>
          <div data-at="connect" style={{ ...PRIMARY, height: 38, fontSize: 13.5, boxShadow: t > 9.8 && t < 10.4 ? `0 0 0 4px ${C.blueWash}, ${PRIMARY.boxShadow}` : PRIMARY.boxShadow }}>
            <I n="link" size={15} /> Connect pen
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 14, border: '1.5px dashed #c7c7cc', background: 'rgba(245,245,247,.85)' }}>
            <I n="plus" size={15} color={C.dim} />
            <span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>Add audio files</span>
              <span style={{ display: 'block', fontSize: 10.5, color: C.dim }}>or drag them here</span>
            </span>
          </div>
          <div style={{ ...SECONDARY, height: 32, fontSize: 12.5, justifyContent: 'flex-start', padding: '0 12px' }}>
            <I n="plus" size={13} color={C.dim} /> <span style={{ flex: 1 }}>More ways to import</span> <span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><I n="chevron" size={12} color={C.dim} /></span>
          </div>
          <div style={{ height: 2 }} />
          <SideItem icon="home" label="Home" n={landed ? 9 : 6} on={!onRecording} />
          <SideItem icon="recordings" label="All recordings" n={landed ? 4 : 3} on={onRecording} />
          <div style={{ borderTop: `1px solid ${C.hair}`, margin: '4px 0 0', padding: '8px 10px 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label style={{ fontSize: 10.5 }}>Categories</Label>
            <span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><I n="chevron" size={11} color={C.dim} /></span>
          </div>
          <SideItem icon="meetings" label="Meetings" n={landed ? 4 : 3} />
          <div style={{ borderTop: `1px solid ${C.hair}`, padding: '8px 10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label style={{ fontSize: 10.5 }}>Chats</Label>
            <span style={{ color: C.dim, fontSize: 14, lineHeight: 1 }}>+</span>
          </div>
          <div style={{ padding: '4px 10px', fontSize: 12.5, color: C.soft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>What’s still open this week?</div>
        </div>

        {/* Main */}
        <div style={{ position: 'absolute', left: MAIN_X, right: 20, top: 12, bottom: 0, overflow: 'hidden' }}>
          <div style={{ height: 38, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', marginBottom: 16, fontSize: 13, color: C.faint, ...GLASS, borderRadius: 999 }}>
            <I n="search" size={15} color={C.faint} />
            <span style={{ flex: 1 }}>Ask anything… type @ for a person or recording</span>
            <span style={{ fontSize: 11, color: C.dim }}>⌘K</span>
          </div>
          {onRecording ? <RecordingView t={t} k={k} /> : <HomeView t={t} k={k} />}
        </div>
      </div>
      {/* The computer's file picker, over everything */}
      <FilePicker t={t - 0.8} />
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
    <div style={{ ...GLASS, padding: '16px 20px 18px', marginBottom: 16, ...enter(t, IMP.open, 0.5) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>1 on JUNO PEN</span>
        <span style={{ fontSize: 12, color: C.dim, textDecoration: 'underline' }}>clear</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', marginTop: 8, borderTop: `1px solid ${C.hair}` }}>
        <Box on />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{FILE}</span>
        <span style={{ fontSize: 12, color: C.dim, ...NUM }}>36.4 MB</span>
        <span style={{ fontSize: 12, color: C.faint, ...NUM }}>10/1/2026</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
        <div>
          <Label>Who was on this call (optional)</Label>
          <div data-at="who" style={{ marginTop: 7, minHeight: 40, boxSizing: 'border-box', borderRadius: 12, background: '#fff', border: `1px solid ${focused ? C.blueHi : C.line}`, boxShadow: focused ? '0 0 0 4px rgba(0,113,227,.15)' : 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '5px 8px' }}>
            {chips.map((n) => (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 4px', borderRadius: 999, background: C.blueWash, color: C.blueInk, fontSize: 12.5, fontWeight: 600 }}>
                <Avatar name={n} size={20} /> {n}
              </span>
            ))}
            <span style={{ fontSize: 13.5, color: typing ? C.ink : C.faint, display: 'inline-flex', alignItems: 'center' }}>
              {typing || (chips.length ? '' : 'Add a person…')}
              {focused && Math.floor(t * 2.5) % 2 === 0 && <span style={{ width: 1.5, height: 16, background: C.ink, marginLeft: 1 }} />}
            </span>
          </div>
          <div style={{ marginTop: 5, fontSize: 11.5, color: C.dim }}>Leave it empty and the notes will suggest who they heard.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: 12, background: C.amberWash, border: `1px solid ${C.amberLine}`, alignSelf: 'start', marginTop: 18 }}>
          <span data-at="consent" style={{ marginTop: 1 }}><Box on={consent} /></span>
          <span style={{ fontSize: 12.5, lineHeight: 1.4, color: C.amber }}>Everyone recorded agreed to it, and this recording contains no patient or medical information.</span>
        </div>
      </div>
      {t < IMP.go + 0.1 ? (
        <div data-at="importBtn" style={{ ...PRIMARY, marginTop: 14, height: 36, padding: '0 18px', fontSize: 13.5, opacity: consent ? 1 : 0.5, boxShadow: consent ? PRIMARY.boxShadow : 'none' }}>Import 1 and transcribe</div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.soft }}>
            <span>{FILE}</span>
            <span>{phase}</span>
          </div>
          <div style={{ marginTop: 7, height: 5, borderRadius: 3, background: C.hair }}>
            <div style={{ height: 5, borderRadius: 3, background: 'linear-gradient(90deg, #1b7be3, #0066cc)', width: `${prog * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, n, tone, children }: { label: string; n: number; tone?: 'bad'; children: React.ReactNode }) {
  return (
    <div style={{ ...GLASS, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3, background: tone ? 'linear-gradient(150deg, rgba(255,241,240,.97), rgba(253,232,230,.86))' : GLASS.background }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.soft }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.05, color: tone ? C.red : C.ink, ...NUM }}>{n}</span>
      {children}
    </div>
  )
}

function HomeView({ t, k }: { t: number; k: HowKit }) {
  const landed = t >= IMP.landed
  const importing = t >= IMP.open && !landed
  const rows = k.recent
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.1 }}>Good morning</div>
      <div style={{ fontSize: 12, color: C.dim, margin: '5px 0 14px', ...NUM }}>
        {landed ? '4 recordings · 2.7 h captured · latest Oct 1' : '3 recordings · 2.1 h captured · latest Sep 29'}
      </div>
      {importing ? (
        <ImportPanel t={t} k={k} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16, ...(landed ? enter(t, IMP.landed, 0.5, 8) : {}) }}>
          <Stat label="Overdue" n={1} tone="bad"><span style={{ fontSize: 11, color: C.dim }}>Needs attention</span></Stat>
          <Stat label="Still to do" n={landed ? 9 : 6}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, height: 4, borderRadius: 2, background: C.hair }}><span style={{ display: 'block', height: 4, borderRadius: 2, width: landed ? '31%' : '40%', background: C.blue }} /></span>
              <span style={{ fontSize: 10.5, color: C.dim, ...NUM }}>{landed ? '4 of 13 done' : '4 of 10 done'}</span>
            </span>
          </Stat>
          <Stat label="Nearly missed" n={landed ? 4 : 3}><span style={{ fontSize: 11, color: C.dim }}>{landed ? '2 new this week' : '1 new this week'}</span></Stat>
          <Stat label="People" n={8}><span style={{ fontSize: 11, color: C.dim }}>In your recordings</span></Stat>
        </div>
      )}
      <div style={{ ...GLASS, padding: '12px 14px 6px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Recent recordings</span>
          <span style={{ ...SECONDARY, height: 26, padding: '0 12px', fontSize: 12, color: C.blueInk }}>+ New</span>
        </div>
        {landed && (
          <div style={enter(t, IMP.landed, 0.5, 10)}>
            <Label style={{ fontSize: 10.5, padding: '6px 4px 4px' }}>Wed, Oct 1</Label>
            <div data-at="row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 12, background: `rgba(232,241,252,${0.9 - 0.5 * seg(t, IMP.landed + 1.2, IMP.landed + 2.4)})` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.title}</div>
                <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2, ...NUM }}>{k.meta.split(' · ')[0]}</div>
              </div>
              <CatPill label={k.meta.split(' · ')[1] ?? ''} />
            </div>
          </div>
        )}
        {rows.map(([title, meta, day], i) => (
          <div key={i}>
            <Label style={{ fontSize: 10.5, padding: '8px 4px 4px' }}>{day.charAt(0) + day.slice(1).toLowerCase()}</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderBottom: i < rows.length - 1 ? `1px solid ${C.hair}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13.5 }}>{title}</div>
                <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2, ...NUM }}>{meta.split(' · ')[0]}</div>
              </div>
              <CatPill label={meta.split(' · ')[1] ?? ''} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The computer's own file picker, as Connect pen opens it, already on the JUNO PEN drive: the
 * recording is selected and opened. Generic on purpose, not any one operating system's.
 */
function FilePicker({ t }: { t: number }) {
  const open = out(seg(t, 9.5, 9.9)) * (1 - seg(t, 11.7, 12.0))
  if (open <= 0) return null
  const picked = t >= 10.9
  const files: [string, string, string, boolean][] = [
    [FILE, '36.4 MB', '10/1/2026 9:42', true],
    ['SYSTEM', '', '', false],
  ]
  return (
    <div style={{ position: 'absolute', inset: 0, background: `rgba(29,29,31,${0.22 * open})`, display: 'grid', placeItems: 'center', zIndex: 10 }}>
      <div style={{ width: 600, borderRadius: 16, background: '#fbfbfd', boxShadow: '0 30px 60px -20px rgba(0,0,0,.4), 0 0 0 1px rgba(29,29,31,.08)', overflow: 'hidden', opacity: open, transform: `scale(${0.96 + 0.04 * open})`, fontFamily: FONT.ui, color: C.ink }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.hair}` }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>Open</span>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.dim }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#eef0f3', color: C.ink, fontWeight: 600 }}><DriveIcon size={16} /> JUNO PEN</span>
          </span>
        </div>
        <div style={{ display: 'flex', minHeight: 230 }}>
          <div style={{ width: 150, padding: 12, borderRight: `1px solid ${C.hair}`, background: '#f3f4f6', fontSize: 12.5, color: C.soft, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label style={{ fontSize: 10 }}>Locations</Label>
            <span>Desktop</span>
            <span>Documents</span>
            <span>Downloads</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8, background: C.blueWash, color: C.blueInk, fontWeight: 600 }}>
              <DriveIcon size={16} /> JUNO PEN
            </span>
          </div>
          <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px', gap: 8, padding: '4px 10px 6px', fontSize: 10.5, color: C.dim, borderBottom: `1px solid ${C.hair}` }}>
              <span>Name</span><span>Size</span><span>Modified</span>
            </div>
            {files.map(([name, size, date, audio], i) => {
              const sel = audio && picked
              return (
                <div key={name} data-at={i === 0 ? 'folder' : undefined} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: sel ? C.blue : 'transparent', color: sel ? '#fff' : audio ? C.ink : C.faint }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: audio ? 600 : 400 }}>
                    {audio ? <I n="wave" size={15} color={sel ? '#fff' : C.blue} /> : <I n="folder" size={15} color={C.faint} />}
                    {name}
                  </span>
                  <span style={{ fontSize: 11.5, ...NUM }}>{size}</span>
                  <span style={{ fontSize: 11.5, ...NUM }}>{date}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '11px 16px', borderTop: `1px solid ${C.hair}` }}>
          <span style={{ flex: 1, fontSize: 12, color: C.dim }}>{picked ? '1 item selected' : 'Select recordings'}</span>
          <span style={{ ...SECONDARY, padding: '7px 16px', fontSize: 12.5 }}>Cancel</span>
          <span data-at="select" style={{ ...PRIMARY, padding: '7px 20px', fontSize: 12.5, opacity: picked ? 1 : 0.5, boxShadow: picked ? PRIMARY.boxShadow : 'none' }}>Open</span>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.dim, fontWeight: 500 }}>
        <I n="back" size={14} color={C.dim} /> All recordings
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.12, margin: '8px 0 6px' }}>{k.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.dim, marginBottom: 14, ...NUM }}>
        <span>Wed, Oct 1 · {k.meta.split(' · ')[0]}</span>
        <CatPill label={k.meta.split(' · ')[1] ?? ''} />
      </div>

      {!notes ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Who's who */}
          <div style={{ ...GLASS, padding: 16, alignSelf: 'start', ...enter(t, 21.0, 0.5) }}>
            <Label style={{ marginBottom: 10 }}>Who’s who</Label>
            {k.speakers.map((x, i) => ({ sp: `Speaker ${'ABC'[i]}`, name: x.name, share: x.share, you: !!x.you, note: x.you ? '' : 'matched by voice' })).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${C.hair}` : 'none', ...enter(t, 21.3 + i * 0.25, 0.4, 6) }}>
                <span style={{ width: 72, fontSize: 11.5, color: C.dim }}>{r.sp}</span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={r.name} size={24} you={r.you} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
                  {r.note && <span style={{ fontSize: 10.5, color: C.faint }}>{r.note}</span>}
                </span>
                <span style={{ fontSize: 11, color: C.dim, ...NUM }}>{r.share}%</span>
              </div>
            ))}
          </div>
          {/* People */}
          <div style={{ ...GLASS, padding: 16, alignSelf: 'start', ...enter(t, 22.0, 0.5) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <I n="people" size={15} color={C.dim} />
              <Label>People</Label>
            </div>
            {!added ? (
              <>
                <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>Detected on this call · not saved yet</div>
                {k.people.map(([n]) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                    <Avatar name={n} size={26} muted />
                    <span style={{ flex: 1, fontSize: 13.5 }}>{n}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <span data-at="addAll" style={{ ...PRIMARY, padding: '7px 18px', fontSize: 12.5 }}>Add all</span>
                </div>
              </>
            ) : (
              <>
                {k.people.map(([n, about], i) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${C.hair}` : 'none', ...enter(t, 24.6 + i * 0.15, 0.4, 8) }}>
                    <Avatar name={n} size={30} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{n}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: C.dim }}>{about}</span>
                    </span>
                    <I n="check" size={16} color={C.blue} />
                  </div>
                ))}
                <div style={{ marginTop: 10, fontSize: 12, color: C.dim, ...enter(t, 25.2, 0.4, 6) }}>
                  Now ask about them anywhere with <strong style={{ color: C.blueInk }}>@{k.people[0][0].replace(/^(Prof\.|Ms\.|Mr\.|Dr\.) /, '').split(' ')[0]}</strong>
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
      {/* The AI summary: the app's blue-tinted glass */}
      <div style={{ ...GLASS, alignSelf: 'start', padding: '16px 18px', background: 'linear-gradient(150deg, rgba(232,241,252,.97), rgba(222,235,251,.82))', borderLeft: `3px solid ${C.blue}`, ...enter(t, 24.6, 0.5) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <I n="sparkle" size={16} color={C.blue} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.blueInk }}>AI meeting summary</span>
        </div>
        {k.summary.map((s, i) => {
          const at = 25.1 + i * 1.25
          return (
            <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 8, fontSize: 13.5, lineHeight: 1.5, minHeight: t >= at ? undefined : 0 }}>
              {t >= at && <span style={{ color: C.blue }}>•</span>}
              <span>{typed(s, t, at, 75)}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...GLASS, padding: 16, ...enter(t, 28.6, 0.5) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Label>Next actions</Label>
            <span style={{ fontSize: 11, color: C.dim, ...NUM }}>{ticked > 0.6 ? '1/3 done' : '0/3 done'}</span>
          </div>
          {k.todos.map(([what, when], i) => {
            const on = i === 0 ? ticked : 0
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: i ? `1px solid ${C.hair}` : 'none', ...enter(t, 28.9 + i * 0.3, 0.4, 8) }}>
                <span data-at={i === 0 ? 'todo' : undefined}><Check on={on} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: on ? C.faint : C.ink, textDecoration: on > 0.6 ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{what}</span>
                </span>
                <span style={{ flex: 'none', padding: '1px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: i === 0 ? C.amberWash : '#f0f0f3', color: i === 0 ? C.amber : C.soft }}>{when}</span>
              </div>
            )
          })}
        </div>
        <div style={{ ...GLASS, padding: 16, boxShadow: emailIn ? `0 0 0 2px ${C.blueLine}, ${GLASS.boxShadow}` : GLASS.boxShadow, ...enter(t, 31.4, 0.5) }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: emailIn ? 10 : 0 }}>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
              <I n="mail" size={15} color={C.dim} />
              <Label>Follow-up email · ready</Label>
            </span>
            <span data-at="email" style={{ ...PRIMARY, padding: '6px 14px', fontSize: 12 }}>{emailIn ? 'Open in Gmail' : 'Open draft'}</span>
          </div>
          {emailIn > 0 && (
            <div style={{ opacity: emailIn }}>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 4 }}>To: {k.email.to}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>{k.email.subject}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.soft }}>{typed(k.email.body, t, 32.7, 70)}</div>
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
    <div style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '8px 11px 7px', borderRadius: 12, borderTopRightRadius: me ? 3 : 12, borderTopLeftRadius: me ? 12 : 3, background: me ? C.waMe : C.panel, boxShadow: '0 1px 1px rgba(11,20,26,.13)', fontFamily: FONT.ui, fontSize: 15, lineHeight: 1.38, color: '#111B21', flex: 'none', ...style }}>
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
    <div style={{ width, height: h, borderRadius: 52, background: 'linear-gradient(140deg, #3a3b3f, #1d1d1f 40%)', padding: 11, boxShadow: '0 0 0 1.5px #c9ccd1, 0 40px 80px -30px rgba(29,29,31,.5), 0 12px 26px -14px rgba(29,29,31,.3)' }}>
      <div style={{ position: 'relative', height: '100%', borderRadius: 42, overflow: 'hidden', background: C.waBg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', top: 10, left: '50%', width: 96, height: 27, marginLeft: -48, borderRadius: 16, background: '#0d0d0f', zIndex: 2 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 14px 11px', background: C.waHead, borderBottom: '1px solid #E4E1DC' }}>
          <span style={{ fontSize: 26, lineHeight: 1, color: C.waGreen }}>‹</span>
          <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#111', color: '#f5f5f7', fontFamily: FONT.mark, fontSize: 22 }}>j</span>
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
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.waGreen, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 15 }}>{typing ? '➤' : '🎙'}</span>
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
    <div style={{ position: 'absolute', left: 0, right: 0, top: portrait ? 70 : 18, display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${(1 - o) * 8}px)`, zIndex: 40, padding: portrait ? '0 36px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: portrait ? '14px 22px 14px 14px' : '10px 20px 10px 10px', ...GLASS, borderRadius: 999, maxWidth: portrait ? 648 : 920 }}>
        <span style={{ flex: 'none', width: portrait ? 42 : 36, height: portrait ? 42 : 36, borderRadius: '50%', background: 'linear-gradient(180deg, #1b7be3, #0066cc)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), 0 6px 12px -6px rgba(0,102,204,.6)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: FONT.ui, fontWeight: 600, fontSize: portrait ? 18 : 16 }}>{s.n}</span>
        <span>
          <span style={{ display: 'block', fontFamily: FONT.ui, fontWeight: 600, letterSpacing: '-0.02em', fontSize: portrait ? 25 : 21, color: C.ink, lineHeight: 1.2 }}>{s.text}</span>
          {s.sub && <span style={{ display: 'block', fontFamily: FONT.ui, fontSize: portrait ? 17 : 14, color: C.dim, marginTop: 2 }}>{s.sub}</span>}
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
  // Landscape: the laptop, facing us, fills the frame under the caption. Portrait: the window
  // is wider than the frame, so a camera follows the action (focus in window space).
  const TOP = 98
  const winScale = portrait ? 1.12 : Math.min((w - 80) / (WIN.w + BEZEL * 2), (h - TOP - 12) / (WIN.h + BEZEL * 2 + BASE_H))
  const FOCUS: [number, number, number][] = [
    [7.7, 330, 300],
    [9.2, AT.connect[0] + 180, AT.connect[1] + 100],
    [10.4, 560, 300],
    [12.6, 560, 280],
    [13.4, 520, 300],
    [15.9, AT.who[0], AT.who[1] - 10],
    [16.4, AT.consent[0] - 20, AT.consent[1]],
    [17.1, AT.consent[0] - 20, AT.consent[1]],
    [17.6, AT.importBtn[0] + 40, AT.importBtn[1] - 40],
    [19.9, 560, 280],
    [21.2, 540, 280],
    [22.8, 860, 290],
    [27.6, 470, 300],
    [31.4, 450, 300],
    [32.0, 820, 320],
    [36.5, 840, 420],
  ]
  const cam = (tt: number) => {
    const f = path(tt, FOCUS)
    return portrait ? [w / 2 - f[0] * winScale, 680 - f[1] * winScale] : [(w - WIN.w * winScale) / 2, TOP + BEZEL * winScale]
  }
  const [camX, camY] = cam(t)

  /* -- 1. the laptop, from the side; the pen goes in; it turns to face us (0 – 8) -- */
  const lapW = portrait ? 380 : 470
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
  const lapDy = lerp(0, endY + (WIN.h * winScale) / 2 - P.y, zoom)
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
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: C.stage, fontFamily: FONT.ui }}>
      {/* The stage: cool grey with soft tints, as the app's canvas */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(${w * 0.7}px ${h * 0.6}px at 8% -4%, rgba(168,192,232,.38), transparent 64%), radial-gradient(${w * 0.6}px ${h * 0.55}px at 100% 8%, rgba(212,202,242,.34), transparent 62%), radial-gradient(${w * 0.7}px ${h * 0.5}px at 50% 112%, rgba(182,212,236,.32), transparent 62%)` }} />

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

      {/* ---- 2–5. the app, on the laptop facing us ---- */}
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
            }}
          >
            <LaptopFront />
            <div style={{ position: 'absolute', inset: 0, borderRadius: BEZEL * 0.6, overflow: 'hidden', zIndex: 1 }}>
              <AppWindow t={t} k={k} />
            </div>
            <div style={{ position: 'absolute', left: 0, top: -BEZEL, width: WIN.w, height: BEZEL * 2, zIndex: 2, pointerEvents: 'none' }}>
              <Notch w={WIN.w * 0.075} h={BEZEL * 0.62} />
            </div>
            {t >= 8.2 && t < 37.8 && <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}><Cursor x={cur[0]} y={cur[1]} down={down} /></div>}
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
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: `rgba(242,243,247,${0.98 * endIn})`, opacity: endIn, padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: FONT.ui, fontWeight: 600, letterSpacing: '-0.045em', fontSize: portrait ? 84 : 96, lineHeight: 1, color: C.ink, transform: `translateY(${(1 - endIn) * 16}px)` }}>That’s it.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, ...enter(t, 50.4, 0.5, 10) }}>
            <Mark size={40} />
            <span style={{ fontFamily: FONT.ui, fontWeight: 500, fontSize: 20, color: C.soft }}>tryjunoapp.com</span>
          </div>
        </div>
      )}
    </div>
  )
}
