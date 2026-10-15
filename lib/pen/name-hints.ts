// Who a voice probably is, worked out from the names said on the call.
//
// lib/pen/names.ts finds every personal name spoken and how it was used: someone saying their
// own name ("soy Pedro"), someone being spoken TO ("gracias, Pedro"), introduced ("this is
// Pedro"), or just talked ABOUT ("Pedro said the deal is off"). Only the first three say
// anything about who a voice is; a name talked about is usually someone who isn't there.
//
// Everything here only SUGGESTS. A circle at a conference says Pedro, Juan and Chancho in two
// minutes and nothing can be sure which voice is which, but a person can pick from the list in
// a second. Never assigned automatically.
//
// Pure: no server imports, so the browser, the WhatsApp agent and the archive search share it.

import { foldName, isSelfName } from './speakers'

export type MentionKind = 'self' | 'addressed' | 'introduced' | 'mentioned'

export type NameMention = {
  name: string
  /** Index into transcript.utterances. */
  utterance: number
  at_sec: number
  /** Speaker label of whoever said the name. */
  said_by: string | null
  /** Speaker label of the person spoken to or introduced, when clear. */
  addressed_to: string | null
  kind: MentionKind
  context: string | null
}

export type Segment = {
  id: string
  idx: number
  first_utt: number
  last_utt: number
  start_sec: number
  end_sec: number
  topic: string
  gist: string | null
  /** 'continues' = carries on the last conversation of the file before (the pen cut mid-chat). */
  kind: 'conversation' | 'talk' | 'other' | 'continues'
  speakers: string[]
  person_id: string | null
  confirmed_name: string | null
}

/** One name option with the evidence behind it, counted so each language can phrase the reason. */
export type NameOption = {
  name: string
  score: number
  /** They said it themselves ("I'm Pedro"). */
  self: number
  /** Someone spoke to them by it. */
  called: number
  /** Someone introduced them by it. */
  introduced: number
  /** Said, but about them rather than to them. Weak; only used inside a conversation. */
  mentioned: number
  /** The user's own name: offered as "You". */
  me?: boolean
  firstAt: number
}

/** A name as it is shown: first letter of each word up, the rest as heard. */
export function displayName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/(^|\s)(\p{Ll})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase())
}

type Tally = Map<string, NameOption>

function bump(t: Tally, m: NameMention, field: 'self' | 'called' | 'introduced' | 'mentioned', w: number, me?: string | null) {
  const key = foldName(m.name)
  if (!key) return
  const cur = t.get(key) ?? { name: displayName(m.name), score: 0, self: 0, called: 0, introduced: 0, mentioned: 0, firstAt: m.at_sec, ...(isSelfName(m.name, me) ? { me: true } : {}) }
  cur[field]++
  cur.score += w
  cur.firstAt = Math.min(cur.firstAt, m.at_sec)
  t.set(key, cur)
}

/**
 * Who each mention points at. Self = the speaker. Spoken to or introduced = the label the scan
 * named, or else whoever speaks next (in a conversation, the person called is usually the one
 * who answers). Null when it can't tell.
 */
export function targetOf(m: NameMention, labelAt: (i: number) => string | null): string | null {
  if (m.kind === 'self') return m.said_by
  if (m.kind !== 'addressed' && m.kind !== 'introduced') return null
  if (m.addressed_to && m.addressed_to !== m.said_by) return m.addressed_to
  for (let i = m.utterance + 1; i <= m.utterance + 3; i++) {
    const l = labelAt(i)
    if (l === null) return null
    if (l !== m.said_by) return l
  }
  return null
}

const W = { self: 3, called: 2, introduced: 2, mentioned: 0.5 } as const

/**
 * Names that are really fillers: two voices calling EACH OTHER the same name ("weón", which the
 * transcriber writes as "Juan", said back and forth). Two real people rarely share a name and
 * address each other by it. Folded names.
 */
export function fillerNames(mentions: NameMention[], labelAt: (i: number) => string | null): Set<string> {
  // Counted, not just seen: one mislabelled "who was spoken to" each way must not turn a real
  // name into a filler (it did: "Titi" once B→C and once C→B). The real filler bounced 13 and 6
  // times, so both directions need at least 2 and the pair at least 5.
  const pairs = new Map<string, Map<string, number>>()
  for (const m of mentions) {
    if (m.kind !== 'addressed' || !m.said_by) continue
    const to = targetOf(m, labelAt)
    if (!to) continue
    const k = foldName(m.name)
    const p = pairs.get(k) ?? new Map<string, number>()
    p.set(`${m.said_by}>${to}`, (p.get(`${m.said_by}>${to}`) ?? 0) + 1)
    pairs.set(k, p)
  }
  const out = new Set<string>()
  for (const [k, p] of pairs) for (const [e, n] of p) {
    const [a, b] = e.split('>')
    const back = p.get(`${b}>${a}`) ?? 0
    if (n >= 2 && back >= 2 && n + back >= 5) out.add(k)
  }
  return out
}

/**
 * Likely names for each speaker label, best first. A name needs real evidence (said by them,
 * or to them) to be offered; a name only talked about never is. `resolve` maps a raw label to
 * the label that owns it (a "same as" merge), so a split voice pools its evidence.
 */
export function speakerSuggestions(
  mentions: NameMention[],
  labels: (string | null)[],
  opts: { me?: string | null; resolve?: (l: string) => string; max?: number } = {},
): Record<string, NameOption[]> {
  const own = (l: string | null) => (l && opts.resolve ? opts.resolve(l) : l)
  const at = (i: number) => (i >= 0 && i < labels.length ? own(labels[i]) : null)
  const by: Record<string, Tally> = {}
  const filler = fillerNames(mentions, at)
  for (const m of mentions) {
    if (filler.has(foldName(m.name))) continue
    const target = own(targetOf(m, at))
    if (!target) continue
    const field = m.kind === 'self' ? 'self' : m.kind === 'introduced' ? 'introduced' : 'called'
    bump((by[target] ??= new Map()), m, field, W[field], opts.me)
  }
  // A name belongs to the voice it fits best: "Chaska, called 4× to B" is not also offered for C
  // on the strength of one stray line. Ties keep both; the user picks.
  const merged = Object.fromEntries(Object.entries(by).map(([l, t]) => [l, mergeVariants([...t.values()])]))
  const best = new Map<string, number>()
  for (const opts2 of Object.values(merged)) for (const o of opts2) best.set(foldName(o.name), Math.max(best.get(foldName(o.name)) ?? 0, o.score))
  const out: Record<string, NameOption[]> = {}
  for (const [label, all] of Object.entries(merged)) {
    const ranked = all.filter((o) => o.score >= (best.get(foldName(o.name)) ?? 0)).sort((a, b) => b.score - a.score || a.firstAt - b.firstAt)
    // A runner-up needs at least half the leader's evidence: "Titi, called 4×" should not sit
    // beside three names each heard once.
    const floor = Math.max(2, (ranked[0]?.score ?? 0) / 2)
    out[label] = ranked.filter((o) => o.score >= floor).slice(0, opts.max ?? 3)
  }
  return out
}

/**
 * "Honors" and "Honor", "Mel" and "Melissa": one person heard two ways. A plural-s variant, or a
 * name that starts another (3+ letters), is folded into the more-said one. Folded keys.
 */
function sameName(a: string, b: string): boolean {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (l === `${s}s`) return true
  return s.length >= 3 && !s.includes(' ') && !l.includes(' ') && l.startsWith(s)
}

function mergeVariants(opts: NameOption[]): NameOption[] {
  const out: NameOption[] = []
  for (const o of [...opts].sort((a, b) => b.score - a.score)) {
    const into = out.find((x) => sameName(foldName(x.name), foldName(o.name)))
    if (!into) { out.push({ ...o }); continue }
    into.score += o.score
    into.self += o.self
    into.called += o.called
    into.introduced += o.introduced
    into.mentioned += o.mentioned
    into.firstAt = Math.min(into.firstAt, o.firstAt)
    // Keep the fuller spelling when one was said about oneself: "I'm Melissa" beats "Mel".
    if (o.self > into.self - o.self && o.name.length > into.name.length) into.name = o.name
  }
  return out
}

/**
 * Name options for one conversation inside an event recording, from the names said in its
 * stretch of the transcript. `likely` = said by them, to them, or introducing them; `mentioned`
 * = only talked about (often someone who isn't there: a boss, a friend), shown apart so it isn't
 * mistaken for a guess. The user's own name is left out: they were in every conversation.
 */
export function segmentOptions(mentions: NameMention[], seg: Pick<Segment, 'first_utt' | 'last_utt'>, opts: { me?: string | null; max?: number } = {}): { likely: NameOption[]; mentioned: NameOption[] } {
  const t: Tally = new Map()
  for (const m of mentions) {
    if (m.utterance < seg.first_utt || m.utterance > seg.last_utt) continue
    if (isSelfName(m.name, opts.me)) continue
    const field = m.kind === 'self' ? 'self' : m.kind === 'introduced' ? 'introduced' : m.kind === 'addressed' ? 'called' : 'mentioned'
    bump(t, m, field, W[field], opts.me)
  }
  const all = mergeVariants([...t.values()]).sort((a, b) => b.score - a.score || a.firstAt - b.firstAt)
  return {
    likely: all.filter((o) => o.self + o.called + o.introduced > 0).slice(0, opts.max ?? 4),
    mentioned: all.filter((o) => o.self + o.called + o.introduced === 0).slice(0, 6),
  }
}

/** Every distinct name heard, most-said first, with all its moments. For the People section. */
export function namesHeard(mentions: NameMention[], me?: string | null, labels?: (string | null)[]): { name: string; count: number; me: boolean; present: boolean; moments: NameMention[] }[] {
  const filler = labels ? fillerNames(mentions, (i) => (i >= 0 && i < labels.length ? labels[i] : null)) : new Set<string>()
  const g = new Map<string, NameMention[]>()
  for (const m of mentions) {
    const k = foldName(m.name)
    if (k && !filler.has(k)) g.set(k, [...(g.get(k) ?? []), m])
  }
  return [...g.values()]
    .map((ms) => {
      const sorted = [...ms].sort((a, b) => a.at_sec - b.at_sec)
      return {
        name: displayName(sorted[0].name),
        count: ms.length,
        me: isSelfName(sorted[0].name, me),
        present: ms.some((m) => m.kind !== 'mentioned'),
        moments: sorted,
      }
    })
    .sort((a, b) => Number(a.me) - Number(b.me) || Number(b.present) - Number(a.present) || b.count - a.count || a.moments[0].at_sec - b.moments[0].at_sec)
}

/** 3725 -> "1:02:05", 65 -> "1:05". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** A plain-English reason, for prompts and the assistant. The web UI phrases its own per language. */
export function reasonEn(o: NameOption): string {
  const bits: string[] = []
  if (o.self) bits.push(`says "${o.name}" about themself${o.self > 1 ? ` ${o.self}×` : ''}`)
  if (o.called) bits.push(`called "${o.name}" ${o.called}×`)
  if (o.introduced) bits.push(`introduced as "${o.name}"`)
  if (o.mentioned && !bits.length) bits.push(`"${o.name}" said ${o.mentioned}×`)
  return bits.join(', ')
}

/**
 * The event's name from the recording title. Titles are written by the notes and often name
 * whoever the notes found most notable after a separator ("Payments conference networking;
 * Nativia open banking lead"), which is someone else entirely: only the part before it is kept.
 */
export function eventName(title: string | null | undefined): string {
  return (title ?? '').split(/\s*(?:[;:|]|\s[-–—]\s)\s*/)[0].replace(/\s+/g, ' ').trim().slice(0, 80)
}

/* ------------------------------------------------ conversations across hour files */

export type Piece = { partId: string; partIndex: number; offset: number; seg: Segment; mentions: NameMention[] }

/** One conversation as the user sees it: usually one stretch, two when the pen cut it at the hour. */
export type Conversation = {
  key: string
  pieces: Piece[]
  partIndex: number
  start_sec: number
  end_sec: number
  topic: string
  gist: string | null
  kind: 'conversation' | 'talk' | 'other'
  confirmed_name: string | null
  person_id: string | null
  likely: NameOption[]
  mentioned: NameOption[]
}

/**
 * The conversations of a joined meeting in order, times from the start of the first file. A
 * stretch marked 'continues' is joined to the last conversation of the file before, so a chat
 * the pen cut at 2:00 is one conversation with one set of names, not two halves.
 */
export function stitch(
  parts: { id: string; offset: number; segments: Segment[]; mentions: NameMention[] }[],
  opts: { me?: string | null } = {},
): Conversation[] {
  const groups: Piece[][] = []
  parts.forEach((p, partIndex) => {
    p.segments.forEach((seg, k) => {
      const piece: Piece = { partId: p.id, partIndex, offset: p.offset, seg, mentions: p.mentions }
      const last = groups[groups.length - 1]
      const tail = last?.[last.length - 1]
      const prevPart = parts[partIndex - 1]
      const joins = seg.kind === 'continues' && k === 0 && tail && tail.partIndex === partIndex - 1 &&
        prevPart && tail.seg.id === prevPart.segments[prevPart.segments.length - 1]?.id
      if (joins) last.push(piece)
      else groups.push([piece])
    })
  })
  return groups.map((pieces) => {
    const head = pieces[0]
    const end = pieces[pieces.length - 1]
    // Names from every stretch, as if one: each stretch's mentions inside its own lines.
    const inRange = pieces.flatMap((x) => x.mentions.filter((m) => m.utterance >= x.seg.first_utt && m.utterance <= x.seg.last_utt))
    const o = segmentOptions(inRange, { first_utt: 0, last_utt: Number.MAX_SAFE_INTEGER }, { me: opts.me })
    const confirmed = pieces.find((x) => x.seg.confirmed_name || x.seg.person_id)?.seg
    const kind = head.seg.kind === 'continues' ? 'conversation' : head.seg.kind
    return {
      key: head.seg.id,
      pieces,
      partIndex: head.partIndex,
      start_sec: head.seg.start_sec + head.offset,
      end_sec: end.seg.end_sec + end.offset,
      topic: head.seg.topic,
      gist: pieces.length > 1 ? [head.seg.gist, end.seg.gist].filter(Boolean).join(' ') || null : head.seg.gist,
      kind,
      confirmed_name: confirmed?.confirmed_name ?? null,
      person_id: confirmed?.person_id ?? null,
      ...o,
    }
  })
}
