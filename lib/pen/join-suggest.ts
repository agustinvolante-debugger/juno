// Suggesting joins the filename rule can't make.
//
// lib/pen/merge-detect.ts joins pen files by the start time in their names (R20261013-215648)
// and a seam of at most 90 s. That misses one meeting sent in two parts over WhatsApp, a renamed
// file, or a pause longer than 90 s. Here, pairs of recordings that are close in time are shown
// to a cheap model with the END of the earlier one and the START of the later one, and asked
// whether the second simply carries on the first. A confident yes becomes a SUGGESTION the user
// accepts or dismisses. Nothing here ever joins anything by itself.
//
// Verdicts are stored (pen_join_suggestions, SQL in schema.sql 2026-10-14) so a pair is judged
// once and a dismissal sticks. Until that table exists every function here degrades: nothing is
// persisted and nothing is suggested, and nothing throws.

import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { supabaseAdmin } from '@/lib/supabase'
import { penAnthropic } from './anthropic'
import { isMissingSchema } from './allowance'
import { findRuns, startFromName } from './merge-detect'
import { namedDialogue, type SpeakerMap } from './speakers'
import { getProfileRaw } from './profile'
import type { PenSession } from './store'

const MODEL = 'claude-haiku-5-5'
/** How far apart two recordings can start and still be one conversation. */
const WINDOW_MS = 12 * 3600_000
/** Pairs judged per check, newest first. Each is one small Haiku call. */
const MAX_PAIRS = 5
/** Utterances from the end of the earlier one and the start of the later one. */
const EDGE = 15
/** Only a confident yes becomes a suggestion. */
export const SUGGEST_FLOOR = 0.75

type Lang = 'en' | 'es' | 'pt'
export type Pair = { a: PenSession; b: PenSession }
export type Verdict = { same: boolean; confidence: number; reason: string }
export type Suggestion = { a_id: string; b_id: string; confidence: number; reason: string }

/** When a recording began: the filename's time, then the file's own time, then the upload. */
function startMs(s: PenSession): number {
  return (startFromName(s.source_name) ?? new Date(s.recorded_at ?? s.created_at)).getTime()
}
function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function hasTranscript(s: PenSession): boolean {
  return (s.transcript?.utterances?.length ?? 0) > 0
}

/**
 * Pairs worth asking about, earlier one first, newest pairs first. Pure, so it can be tested on
 * real rows without touching anything.
 *
 * Both written up (noted), neither already joined, neither the sample, same calendar day and
 * within 12 h, and not a pair the filename rule already handles. With `focusId`, only pairs
 * that include that recording.
 */
export function candidatePairs(sessions: PenSession[], focusId?: string, max = MAX_PAIRS): Pair[] {
  const inRun = new Set(findRuns(sessions).flatMap((r) => r.sessions.map((s) => s.id)))
  const ok = sessions
    .filter((s) => s.status === 'noted' && !s.merge_group && s.source_channel !== 'sample' && hasTranscript(s) && !inRun.has(s.id))
    .map((s) => ({ s, t: startMs(s) }))
    .sort((x, y) => x.t - y.t)
  const pairs: { p: Pair; t: number }[] = []
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const a = ok[i], b = ok[j]
      if (b.t - a.t > WINDOW_MS) break
      if (dayKey(a.t) !== dayKey(b.t)) continue
      if (focusId && a.s.id !== focusId && b.s.id !== focusId) continue
      pairs.push({ p: { a: a.s, b: b.s }, t: b.t })
    }
  }
  return pairs.sort((x, y) => y.t - x.t).slice(0, max).map((x) => x.p)
}

const SCHEMA = {
  type: 'object',
  properties: {
    same: { type: 'boolean', description: 'True only if the second recording directly continues the same conversation as the first.' },
    confidence: { type: 'number', description: '0 to 1. Be honest; a low number is a useful answer.' },
    reason: { type: 'string', description: 'One short sentence of at most 20 words, in the requested language, saying why. No names of companies or amounts.' },
  },
  required: ['same', 'confidence', 'reason'],
  additionalProperties: false,
} as const

const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish (Latin American, tú)', pt: 'Brazilian Portuguese' }

const SYSTEM = `You decide whether two recordings are ONE conversation split in two: the recorder stopped (a file limit, a battery, a pause, someone sent it in two parts) and the second recording carries straight on from the first.

You see the END of the earlier recording and the START of the later one.

Say same=true only when the second is a direct continuation: the same people, the same topic, and the first ends cut off or the second starts mid-conversation (no greetings, no "let's begin", referring back to what was just said).
Say same=false for two separate meetings on the same day, even with the same people or topic, when the first wraps up properly or the second clearly opens a new conversation.
Speaker labels restart in each recording, so "Speaker A" in one is not necessarily "Speaker A" in the other.
Write the reason in the language you are told: one plain sentence, at most 20 words.`

function edges(s: PenSession, from: 'start' | 'end'): string {
  const u = s.transcript?.utterances ?? []
  // Edits are keyed by utterance index in the full list, so slice after naming, not before.
  const lines = namedDialogue(u, s.speaker_map as SpeakerMap | null, s.transcript_edits).split('\n')
  return (from === 'end' ? lines.slice(-EDGE) : lines.slice(0, EDGE)).join('\n')
}

function describe(s: PenSession, label: string): string {
  const name = startFromName(s.source_name)
  const when = name ? name.toISOString() : s.recorded_at ? `${s.recorded_at} (file time)` : `${s.created_at} (upload time)`
  return `${label}: "${s.title || s.source_name || 'Untitled'}", ${Math.round((s.duration_sec ?? 0) / 60)} min, started ${when}`
}

/** One small model call. Exported so a dry run can call it without storing anything. */
export async function judgePair(pair: Pair, lang: Lang): Promise<Verdict> {
  const anthropic = penAnthropic('join-suggest')
  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content:
        `${describe(pair.a, 'Earlier recording')}\n${describe(pair.b, 'Later recording')}\n\n` +
        `END of the earlier recording (last ${EDGE} turns):\n${edges(pair.a, 'end')}\n\n` +
        `START of the later recording (first ${EDGE} turns):\n${edges(pair.b, 'start')}\n\n` +
        `Write the reason in ${LANG_NAME[lang]}.`,
    }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  })
  const p = res.parsed_output
  if (!p) return { same: false, confidence: 0, reason: '' }
  return { same: Boolean(p.same), confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)), reason: String(p.reason ?? '').trim().slice(0, 300) }
}

async function langOf(email: string): Promise<Lang> {
  const l = (await getProfileRaw(email).catch(() => null))?.appLanguage
  return l === 'es' || l === 'pt' ? l : 'en'
}

/** Pairs already judged, as "a:b" keys. Null when the table doesn't exist yet. */
async function judged(email: string): Promise<Set<string> | null> {
  const { data, error } = await supabaseAdmin.from('pen_join_suggestions').select('a_id,b_id').eq('user_email', email)
  if (error) {
    if (!isMissingSchema(error.message)) console.warn(`pen: join suggestions read: ${error.message}`)
    return null
  }
  return new Set((data ?? []).map((r: { a_id: string; b_id: string }) => `${r.a_id}:${r.b_id}`))
}

/**
 * Judges the new pairs (optionally only those with `focusId`) and stores the verdicts. Best
 * effort: every failure is swallowed, because this runs after a recording is written up and must
 * never cost the user their notes or their briefing. Does nothing until the table exists, so the
 * model is never paid for a verdict that can't be kept.
 */
export async function checkJoinSuggestions(email: string, focusId?: string): Promise<number> {
  try {
    const seen = await judged(email)
    if (!seen) return 0
    const { data, error } = await supabaseAdmin
      .from('pen_sessions').select('*').eq('user_email', email).order('created_at', { ascending: false }).limit(60)
    if (error) return 0
    const pairs = candidatePairs((data ?? []) as PenSession[], focusId).filter((p) => !seen.has(`${p.a.id}:${p.b.id}`))
    if (!pairs.length) return 0
    const lang = await langOf(email)
    let n = 0
    for (const pair of pairs) {
      const v = await judgePair(pair, lang).catch(() => null)
      if (!v) continue
      const { error: e2 } = await supabaseAdmin.from('pen_join_suggestions').upsert(
        { user_email: email, a_id: pair.a.id, b_id: pair.b.id, same: v.same, confidence: v.confidence, reason: v.reason },
        { onConflict: 'user_email,a_id,b_id', ignoreDuplicates: true },
      )
      if (!e2) n++
    }
    return n
  } catch (e) {
    console.warn(`pen: join suggestions: ${(e as Error).message}`)
    return 0
  }
}

/** The suggestions to show: confident, not dismissed, and both recordings still separate. */
export async function openJoinSuggestions(email: string): Promise<Suggestion[]> {
  const { data, error } = await supabaseAdmin
    .from('pen_join_suggestions')
    .select('a_id,b_id,confidence,reason')
    .eq('user_email', email)
    .eq('same', true)
    .gte('confidence', SUGGEST_FLOOR)
    .is('dismissed_at', null)
  if (error) return []
  const rows = (data ?? []) as Suggestion[]
  if (!rows.length) return []
  const ids = Array.from(new Set(rows.flatMap((r) => [r.a_id, r.b_id])))
  const { data: live } = await supabaseAdmin.from('pen_sessions').select('id,merge_group').eq('user_email', email).in('id', ids)
  const free = new Set((live ?? []).filter((s: { merge_group: string | null }) => !s.merge_group).map((s: { id: string }) => s.id))
  return rows.filter((r) => free.has(r.a_id) && free.has(r.b_id))
}

/**
 * Seams the user said are separate recordings, as "earlierId:laterId": any dismissed row, a
 * turned-down model suggestion or a "No, keep separate" on the filename rule's banner. Empty when
 * the table doesn't exist yet.
 */
export async function separateSeams(email: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('pen_join_suggestions')
    .select('a_id,b_id')
    .eq('user_email', email)
    .not('dismissed_at', 'is', null)
  if (error) return new Set()
  return new Set((data ?? []).map((r: { a_id: string; b_id: string }) => `${r.a_id}:${r.b_id}`))
}

/**
 * "No, keep separate" on a run the filename rule found: every seam in it is stored as a dismissed
 * pair (same=false), so the banner never comes back and autoJoin never joins them. Ids in order.
 */
export async function keepSeparate(email: string, ids: string[]): Promise<void> {
  const now = new Date().toISOString()
  const rows = ids.slice(1).map((b, i) => ({ user_email: email, a_id: ids[i], b_id: b, same: false, confidence: 1, reason: 'kept separate by the user', dismissed_at: now }))
  if (!rows.length) return
  const { error } = await supabaseAdmin.from('pen_join_suggestions').upsert(rows, { onConflict: 'user_email,a_id,b_id' })
  if (error && !isMissingSchema(error.message)) throw new Error(error.message)
}

/** "Not the same": the pair is never suggested again. */
export async function dismissJoinSuggestion(email: string, a: string, b: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('pen_join_suggestions')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_email', email)
    .eq('a_id', a)
    .eq('b_id', b)
  if (error && !isMissingSchema(error.message)) throw new Error(error.message)
}
