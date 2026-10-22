// "That recording was two meetings, split it where Robert joins" (22 Oct): split_recording and
// join_split, the chat side of the recording page's "Split into two?" card and "Split here".
//
// Splitting rewrites the notes of every part (one model call each) and moves to-dos and people,
// so it asks once (../confirm.ts askConfirm, joins the turn's batch). Joining back runs at once.
// The split itself, the notes after it, and the rules are lib/pen/split-server.ts / split.ts.

import type Anthropic from '@anthropic-ai/sdk'
import type { PenSession } from '../../store'
import { askConfirm } from '../confirm'
import type { Ctx } from '../agent'
import { zoneOf } from './timezone'
import { str, type ToolModule } from './types'
import type { Lang } from '../../currency'

const UUID = /^[0-9a-f-]{36}$/i
const titleOf = (s: PenSession) => s.title ?? s.notes?.headline ?? s.source_name ?? 'Untitled'

function appUrl(): string {
  return (process.env.PEN_PUBLIC_URL || process.env.NEXTAUTH_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
}
const linkTo = (id: string) => `${appUrl()}/pen?open=${encodeURIComponent(id)}`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'split_recording',
    description:
      'One recording that holds two meetings back to back ("that was two calls", "split it at 10:45", "split where Robert joins"): ' +
      'cuts it in two at that point. Each part becomes its own recording with its own notes, to-dos and people (the notes are rewritten). ' +
      '`at` is a clock time where the user is ("10:45", "3:05 pm"), minutes or seconds into the recording ("45 min", "2700"), ' +
      'or a person ("where Robert joins"). Asks the user to confirm first, showing both time ranges. For three meetings, split once, ' +
      'then split the later part after the first split is done.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        at: { type: 'string', description: 'Where to cut: "10:45", "45 min", "2700", or "where Robert joins".' },
      },
      required: ['session_id', 'at'],
      additionalProperties: false,
    },
  },
  {
    name: 'join_split',
    description: 'Undo a split: the parts of a recording that was split become one recording again, and its notes are rewritten over all of it. Runs at once.',
    input_schema: { type: 'object', properties: { session_id: { type: 'string', description: 'Any part of the split recording.' } }, required: ['session_id'], additionalProperties: false },
  },
]

const S: Record<Lang, { done: (n: number, links: string) => string; failed: (t: string) => string }> = {
  en: { done: (n, l) => `Split into ${n} recordings ✓ Each has its own notes now:\n${l}`, failed: (t) => `I split "${t}", but couldn't finish writing the notes for every part. Open it on the website and tap "Redo notes".` },
  es: { done: (n, l) => `Dividida en ${n} grabaciones ✓ Cada una tiene sus propias notas:\n${l}`, failed: (t) => `Dividí "${t}", pero no pude terminar las notas de cada parte. Ábrela en el sitio y toca "Rehacer notas".` },
  pt: { done: (n, l) => `Dividida em ${n} gravações ✓ Cada uma tem suas próprias notas:\n${l}`, failed: (t) => `Dividi "${t}", mas não consegui terminar as notas de cada parte. Abra no site e toque em "Refazer notas".` },
}

/** "10:00–10:44" for each part, where the user is; minutes in when the start time is unknown. */
function ranges(parts: { from_sec: number; to_sec: number }[], startIso: string | null, tz: string | null, clockAt: (ms: number, tz: string) => string, fmtOffset: (s: number) => string): string[] {
  const start = startIso ? Date.parse(startIso) : NaN
  return parts.map((p) => (Number.isFinite(start)
    ? `${clockAt(start + p.from_sec * 1000, tz || 'UTC')}–${clockAt(start + p.to_sec * 1000, tz || 'UTC')}`
    : `${fmtOffset(p.from_sec)}–${fmtOffset(p.to_sec)} in`))
}

async function askSplit(ctx: Ctx, id: string, at: string): Promise<unknown> {
  if (!UUID.test(id)) return { error: 'no such recording; find it with list_recordings' }
  const { unitOf, cannotSplit } = await import('../../split-server')
  const split = await import('../../split')
  const unit = await unitOf(ctx.email, id)
  if (!unit) return { error: 'no such recording; find it with list_recordings' }
  const why = cannotSplit(unit.files)
  if (why) return { error: why }
  const files = unit.files.map((f) => ({ id: f.id, duration_sec: f.duration_sec, utterances: f.transcript?.utterances ?? [], speaker_map: (f.speaker_map ?? null) as never }))
  const tz = (await zoneOf(ctx)).tz
  const where = split.parseSplitAt(/^\d+(\.\d+)?$/.test(at) ? Number(at) : at, { files, startIso: unit.primary.recorded_at, tz })
  if ('error' in where) return { error: where.error, next: 'ask the user where to split (a time or who joins)' }
  const plan = split.planSplit(files, [where.sec])
  if ('error' in plan) return { error: plan.error }
  const lines = split.timeline(files)
  const parts = split.describeParts(lines, plan.map((o) => o[0].startSec).slice(1), split.totalSec(files), null)
  const r = ranges(parts, unit.primary.recorded_at, tz, split.clockAt, split.fmtOffset)
  const title = titleOf(unit.primary)
  // The exact start of the first line of part 2, so the yes cuts where the question said.
  const cutLine = lines.find((l) => l.start >= where.sec * 1000 - 1)
  if (!cutLine) return { error: 'that is past the end of the recording' }
  return askConfirm(ctx, {
    kind: 'split_recording',
    args: { id: unit.primary.id, at: cutLine.start / 1000, title },
    summary:
      `Split "${title}" in two? Part 1: ${r[0]}. Part 2: ${r[1]}` + (where.how === 'person' ? ` (from where ${where.who} joins)` : '') +
      '. Each part gets its own notes, to-dos and people; the notes are rewritten. Reply yes.',
    line: `Split "${title}" at ${r[1].split('–')[0]}`,
  })
}

async function doSplit(ctx: Ctx, a: Record<string, unknown>): Promise<unknown> {
  const { performSplit, finishSplit } = await import('../../split-server')
  const r = await performSplit(ctx.email, String(a.id), [Number(a.at)])
  if (!r.ok) return { error: `${r.error}; nothing was split` }
  const L = S[ctx.lang] ?? S.en
  ctx.later.push(async () => {
    try {
      await finishSplit(ctx.email, r)
      const { getSession } = await import('../../store')
      const rows = await Promise.all(r.parts.map((p) => getSession(ctx.email, p.id)))
      const list = rows.map((s, i) => `${i + 1}. ${s ? titleOf(s) : `Part ${i + 1}`}: ${linkTo(r.parts[i].id)}`).join('\n')
      await ctx.notify(L.done(r.parts.length, list))
    } catch (e) {
      console.warn(`pen whatsapp: split finish failed: ${(e as Error).message}`)
      await ctx.notify(L.failed(String(a.title ?? ''))).catch(() => {})
    }
  })
  return {
    ok: true,
    parts: r.parts.length,
    note: 'Split. Say in one line that it is now separate recordings and that each part\'s notes come here in a minute or two; ' +
      'they can say "join them back" to undo it.',
  }
}

async function joinSplit(ctx: Ctx, id: string): Promise<unknown> {
  if (!UUID.test(id)) return { error: 'no such recording' }
  const { splitSiblings, joinBack } = await import('../../split-server')
  const rows = await splitSiblings(ctx.email, id)
  if (rows.length < 2) return { error: 'this recording was not split from another one' }
  ctx.later.push(async () => {
    const r = await joinBack(ctx.email, id).catch((e) => ({ ok: false as const, status: 500, error: (e as Error).message }))
    if (!r.ok) await ctx.notify(`Couldn't join them back: ${r.error}`).catch(() => {})
  })
  return { ok: true, joining: rows.length, note: 'Joining them back after your reply; the notes are rewritten over the whole recording. Say so in one line.' }
}

export const splitModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => {
    if (name === 'split_recording') return askSplit(ctx, str(input, 'session_id'), str(input, 'at') || String(input.at ?? ''))
    if (name === 'join_split') return joinSplit(ctx, str(input, 'session_id'))
    return undefined
  },
  confirm: { split_recording: doSplit },
  prompt:
    '- A recording that was really two meetings ("that was two calls", "split it at 10:45", "split where Robert joins") is ' +
    'split_recording: it asks once, showing both time ranges, and each part then gets its own notes, to-dos and people. ' +
    'join_split undoes it. An event with many short conversations is split_conversations instead (it lists them; nothing is cut).',
}
