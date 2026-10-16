// "Import my Granola meetings from this week" from the chat (lib/pen/granola-import.ts). Lists the
// meetings not yet in Juno, asks once (which also stands for "everyone agreed to be recorded",
// the switch the website asks for), then imports them after the reply, two at a time, and says
// what came in. Not connected: offer the connect link (connections.ts, connect_app 'granola').

import type Anthropic from '@anthropic-ai/sdk'
import type { Ctx } from '../agent'
import { askConfirm } from '../confirm'
import { str, type ToolModule } from './types'
import { getConnection, granolaAvailable } from '../../granola'
import { importMany, listForPicker } from '../../granola-import'
import { sendText } from '../provider'
import { getLinkByEmail, setChat } from '../store'
import type { Lang } from '../../i18n'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'import_granola',
    description:
      'Import meetings from the user\'s Granola into Juno as recordings (transcript → Juno notes; meetings without a transcript come in as notes only). ' +
      'Lists the Granola meetings of the last `days` that are not in Juno yet, then asks the user to confirm before importing. ' +
      'Use for "import my Granola meetings from this week", "trae mis reuniones de Granola", "what\'s in my Granola?" (list_only).',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How far back, 1–30. Today = 1, this week = 7, this month / everything = 30. Default 7.' },
        match: { type: 'string', description: 'Only meetings whose title contains this (e.g. a person or company), if they named one.' },
        list_only: { type: 'boolean', description: 'true to just list what is there, without offering to import.' },
      },
      additionalProperties: false,
    },
  },
]

const S: Record<Lang, { done: (n: number, titles: string, notesOnly: number, failed: number) => string; none: string }> = {
  en: {
    done: (n, t, o, f) => `Imported ${n} Granola meeting${n === 1 ? '' : 's'}: ${t}.${o ? ` ${o === 1 ? '1 had no transcript, so it came in' : `${o} had no transcript, so they came in`} as notes only.` : ''}${f ? ` ${f} didn’t import; ask me again to retry.` : ''} They’re in your recordings, and you can ask me about them here.`,
    none: 'None of those Granola meetings could be imported. Ask me again in a few minutes.',
  },
  es: {
    done: (n, t, o, f) => `Importé ${n} reunión${n === 1 ? '' : 'es'} de Granola: ${t}.${o ? ` ${o === 1 ? '1 no tenía transcripción, así que llegó' : `${o} no tenían transcripción, así que llegaron`} solo con notas.` : ''}${f ? ` ${f} no se importaron; pídemelo de nuevo para reintentar.` : ''} Ya están en tus grabaciones y puedes preguntarme por ellas aquí.`,
    none: 'No se pudo importar ninguna de esas reuniones de Granola. Pídemelo de nuevo en unos minutos.',
  },
  pt: {
    done: (n, t, o, f) => `Importei ${n} reuni${n === 1 ? 'ão' : 'ões'} do Granola: ${t}.${o ? ` ${o === 1 ? '1 não tinha transcrição, então veio' : `${o} não tinham transcrição, então vieram`} só com as notas.` : ''}${f ? ` ${f} não foram importadas; peça de novo para tentar outra vez.` : ''} Já estão nas suas gravações e você pode me perguntar sobre elas aqui.`,
    none: 'Não consegui importar nenhuma dessas reuniões do Granola. Peça de novo em alguns minutos.',
  },
}

async function tell(ctx: Ctx, text: string): Promise<void> {
  await sendText(ctx.phone, text)
  const link = await getLinkByEmail(ctx.email).catch(() => null)
  if (link) await setChat(ctx.email, [...(link.chat ?? []), { role: 'assistant', content: text, ts: Date.now() }]).catch(() => {})
}

async function importGranola(ctx: Ctx, input: Record<string, unknown>): Promise<unknown> {
  if (!(await granolaAvailable())) return { error: 'Granola import is not available yet' }
  const conn = await getConnection(ctx.email).catch(() => null)
  if (!conn) {
    return { error: 'granola not connected', note: 'Say Granola is not connected yet and offer the one-tap sign-in link (on their yes: connect_app app granola). If they have a Business/Enterprise API key: connect_app with api_key true.' }
  }
  const days = Math.min(Math.max(Math.round(Number(input.days) || 7), 1), 30)
  let list
  try {
    list = await listForPicker(ctx.email, { since: new Date(Date.now() - days * 86_400_000), limit: 60 })
  } catch (e) {
    const status = (e as { status?: number }).status
    return { error: (e as Error).message, ...(status === 401 ? { note: 'Granola needs reconnecting: offer connect_app granola with reconnect true (or a new key in Settings → Granola if they use an API key).' } : {}) }
  }
  const match = str(input, 'match').toLowerCase()
  if (match) list = list.filter((m) => m.title.toLowerCase().includes(match))
  const fresh = list.filter((m) => !m.imported)
  const shown = list.slice(0, 15).map((m) => ({ title: m.title, date: m.start, ...(m.minutes ? { minutes: m.minutes } : {}), already_in_juno: m.imported }))
  if (input.list_only === true || !fresh.length) {
    return {
      granola_account: conn.account_email,
      days,
      meetings: shown,
      total: list.length,
      not_yet_imported: fresh.length,
      note: fresh.length ? 'List them briefly (title, day). Offer to import the ones not in Juno yet.' : list.length ? 'Everything from that period is already in Juno; say so.' : 'No Granola meetings in that period; say so (free Granola plans only reach the last 30 days).',
    }
  }
  const ids = fresh.slice(0, 30).map((m) => m.id)
  const titles = fresh.slice(0, 6).map((m) => `"${m.title}"`).join(', ') + (fresh.length > 6 ? ` and ${fresh.length - 6} more` : '')
  return askConfirm(ctx, {
    kind: 'import_granola',
    args: { ids },
    summary: `Import ${ids.length} Granola meeting${ids.length === 1 ? '' : 's'} from the last ${days} day${days === 1 ? '' : 's'} (${titles})? Juno writes its notes from each transcript (a few minutes; it uses recording hours). Reply yes if everyone on them agreed to be recorded.`,
  })
}

async function doImport(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (!ids.length) return { error: 'nothing to import' }
  ctx.later.push(async () => {
    try {
      const r = await importMany(ctx.email, ids, { budgetMs: 240_000 })
      const ok = r.filter((x) => x.id && !x.existing)
      if (!ok.length) return void (await tell(ctx, S[ctx.lang].none).catch(() => {}))
      const t = ok.slice(0, 6).map((x) => `“${x.title ?? 'Granola meeting'}”`).join(', ') + (ok.length > 6 ? ` +${ok.length - 6}` : '')
      await tell(ctx, S[ctx.lang].done(ok.length, t, ok.filter((x) => x.notesOnly).length, r.filter((x) => x.error).length)).catch(() => {})
    } catch (e) {
      console.warn(`pen whatsapp: granola import failed: ${(e as Error).message}`)
      await tell(ctx, S[ctx.lang].none).catch(() => {})
    }
  })
  return { ok: true, queued: ids.length, note: 'Importing after your reply; a message follows here when they are in (a few minutes). Say so in one line.' }
}

export const granolaModule: ToolModule = {
  tools: TOOLS,
  run: (ctx, name, input) => (name === 'import_granola' ? importGranola(ctx, input) : undefined),
  confirm: { import_granola: doImport },
  prompt:
    '- Granola: "import my Granola meetings from this week" / "trae mis reuniones de Granola" → import_granola (days: today 1, this week 7, ' +
    'this month 30; match for a name in the title). It asks before importing; their yes runs it via confirm_pending. "What\'s in my Granola?" → ' +
    'import_granola list_only. Not connected → offer connect_app granola.',
}
