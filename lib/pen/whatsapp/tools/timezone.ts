// set_timezone: "I'm in SF until Friday", "I live in Santiago" (plan E). The zone resolution
// itself is lib/pen/timezone.ts.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { str, type ToolModule } from './types'
import { localToUtc, setSaidZone, userZone, validZone, zoneLabel, type Zone } from '../../timezone'

/** The user's zone for this turn: the one runAgent resolved, else looked up now. */
export async function zoneOf(ctx: Ctx): Promise<Zone> {
  if (!ctx.zone) ctx.zone = await userZone(ctx.email, ctx.phone).catch((): Zone => ({ tz: null, source: 'none', sure: false }))
  return ctx.zone
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'set_timezone',
    description:
      'Remember the time zone the user is in, when they say where they are or answer which city they are in. ' +
      'For a trip ("in SF until Friday") pass until; afterwards their usual zone comes back by itself.',
    input_schema: {
      type: 'object',
      properties: {
        zone: { type: 'string', description: 'IANA zone for the place they named, e.g. America/Los_Angeles for San Francisco, America/Santiago for Chile.' },
        until: { type: 'string', description: 'Last day there, YYYY-MM-DD, for a temporary stay. Omit when they live there or did not say.' },
      },
      required: ['zone'],
      additionalProperties: false,
    },
  },
]

async function setTimezone(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  const tz = str(input, 'zone')
  if (!validZone(tz)) return { error: `"${tz}" is not an IANA time zone; use one like America/Los_Angeles` }
  const day = str(input, 'until')
  let until: string | null = null
  if (day) {
    if (!/^\d{4}-\d\d-\d\d$/.test(day)) return { error: 'until must be YYYY-MM-DD' }
    // The end of that day where they are.
    const end = localToUtc(`${day}T23:59`, tz)
    if (!end || end.getTime() < Date.now()) return { error: 'that end date has already passed' }
    until = end.toISOString()
  }
  await setSaidZone(ctx.email, tz, until)
  ctx.zone = { tz, source: 'chat', sure: true, ...(until ? { until } : {}) }
  return {
    ok: true,
    zone: tz,
    label: zoneLabel(tz),
    ...(day ? { until: day } : {}),
    note: 'Confirm in one line, e.g. "Got it, I\'ll use Pacific time" (plus "until Friday" when there is an end date).',
  }
}

export const timezoneModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => (name === 'set_timezone' ? setTimezone(ctx, input) : undefined),
  prompt:
    '- Time zone: when the user says where they are ("I\'m in SF until Friday", "I live in Santiago") or answers ' +
    'which city they are in, call set_timezone (until = their last day there, for a trip) and confirm in one line. ' +
    'If the timezone above is unknown or not confirmed, ask once, only when a clock time matters.',
}
