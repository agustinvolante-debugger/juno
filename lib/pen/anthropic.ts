// The Anthropic client for Juno Pen: the SDK's own client, with every reply's token usage
// logged under a feature name (lib/pen/usage.ts). create, parse and stream all pass through.
import Anthropic from '@anthropic-ai/sdk'
import { logUsage } from './usage'

export function penAnthropic(feature: string): Anthropic {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const m = client.messages as unknown as Record<string, (...a: unknown[]) => unknown>
  const wrap = (name: 'create' | 'parse') => {
    const orig = m[name].bind(client.messages)
    m[name] = (...args: unknown[]) => {
      const p = orig(...args) as Promise<{ model?: string; usage?: object }>
      // A streaming create returns a stream, not a message: the stream path logs that one.
      if (!(args[0] as { stream?: boolean })?.stream) p.then((r) => logUsage(feature, r as never), () => {})
      return p
    }
  }
  wrap('create')
  wrap('parse')
  const origStream = m.stream.bind(client.messages)
  m.stream = (...args: unknown[]) => {
    const s = origStream(...args) as { finalMessage: () => Promise<{ model?: string; usage?: object }> }
    s.finalMessage().then((r) => logUsage(feature, r as never), () => {})
    return s
  }
  return client
}
