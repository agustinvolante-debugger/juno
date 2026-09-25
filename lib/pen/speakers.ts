// Who "Speaker A" is.
//
// AssemblyAI labels voices A, B, C. The transcript keeps those labels forever; the names live
// beside it in pen_sessions.speaker_map, so a correction never rewrites the transcript and a
// label can be renamed, pointed at a contact, or merged into another label.
//
// Pure: no server imports, so the browser and merge-detect can use it.

import type { Utterance } from './store'

export type SpeakerEntry = {
  name: string
  /** The contact this voice is, when known. */
  person_id?: string | null
  /** The person recording. */
  me?: boolean
  /** Another label this voice actually belongs to (the diarizer split one person in two). */
  same_as?: string | null
  source: 'auto' | 'user'
}
export type SpeakerMap = Record<string, SpeakerEntry>

/** Follows same_as to the label that owns the name. Guards against loops. */
export function resolve(map: SpeakerMap | null | undefined, label: string): { label: string; entry: SpeakerEntry | null } {
  let cur = label
  for (let i = 0; i < 5; i++) {
    const e = map?.[cur]
    if (!e?.same_as || e.same_as === cur) return { label: cur, entry: e ?? null }
    cur = e.same_as
  }
  return { label: cur, entry: map?.[cur] ?? null }
}

/** How a speaker is written in a prompt or on screen. */
export function speakerName(map: SpeakerMap | null | undefined, label: string, opts: { forModel?: boolean } = {}): string {
  const { label: owner, entry } = resolve(map, label)
  if (!entry?.name) return `Speaker ${owner}`
  return opts.forModel && entry.me ? `${entry.name} (the user)` : entry.name
}

/** Speaker-labelled text with names and the user's corrections applied. */
export function namedDialogue(
  utterances: Utterance[],
  map: SpeakerMap | null | undefined,
  edits?: Record<string, string> | null,
): string {
  return utterances.map((u, i) => `${speakerName(map, u.speaker, { forModel: true })}: ${edits?.[String(i)] ?? u.text}`).join('\n')
}

/**
 * Speaker identification replaces the labels in AssemblyAI's utterances with names. Put the
 * letters back and keep the names as a map, so everything downstream sees stable labels.
 * Two labels mapped to one name become one label: that is AssemblyAI merging a split voice.
 */
export function restoreLabels(
  utterances: Utterance[],
  mapping: Record<string, string> | null | undefined,
): { utterances: Utterance[]; names: Record<string, string> } {
  if (!mapping || !Object.keys(mapping).length) return { utterances, names: {} }
  const byName = new Map<string, string>()
  for (const [label, name] of Object.entries(mapping)) if (!byName.has(name)) byName.set(name, label)
  const names: Record<string, string> = {}
  for (const [name, label] of byName) names[label] = name
  return {
    utterances: utterances.map((u) => ({ ...u, speaker: byName.get(u.speaker) ?? u.speaker })),
    names,
  }
}

/** Labels in order of first appearance, merged labels excluded. */
export function speakersIn(utterances: Utterance[], map?: SpeakerMap | null): string[] {
  const seen: string[] = []
  for (const u of utterances) {
    const l = resolve(map, u.speaker).label
    if (!seen.includes(l)) seen.push(l)
  }
  return seen
}
