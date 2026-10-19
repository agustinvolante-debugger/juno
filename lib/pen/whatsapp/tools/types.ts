// A tool module adds tools to the WhatsApp/iMessage assistant without touching agent.ts.
//
//   tools    the tool definitions the model sees
//   run      called for every tool call; return undefined for names this module does not own
//   confirm  executors for actions that wait for the user's "yes" (see ../confirm.ts): a tool
//            calls askConfirm(ctx, {kind, args, summary}) and returns what to ask; the user's
//            yes in a LATER message runs confirm[kind](ctx, args)
//   prompt   lines added to the system prompt (what the tools are for, when to use them)
//   when     optional: the module's tools and prompt are only shown when this is true for the turn
//
// Post-reply work (slow jobs: notes, joins, splits) goes in ctx.later; bot.ts runs it after the
// reply is sent. Tell the user in the reply that it is running and what message follows.

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'

export type ToolModule = {
  tools: Anthropic.Tool[]
  run: (ctx: Ctx, name: string, input: Record<string, unknown>) => Promise<unknown> | undefined
  confirm?: Record<string, (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>>
  prompt?: string
  when?: (ctx: Ctx) => boolean
}

export const str = (input: Record<string, unknown>, k: string): string => (typeof input[k] === 'string' ? (input[k] as string).trim() : '')
