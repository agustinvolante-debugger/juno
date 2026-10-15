// What Juno writes to Google Docs & Sheets (lib/pen/google-drive.ts), shared by the website and
// the chat: a recording's notes as a Doc ("Send to Google Docs"), a plan Juno offered as a Doc
// (offer-accept.ts), and the user's to-dos or contacts as a Sheet.

import { supabaseAdmin } from '@/lib/supabase'
import { createDoc, createSheet, findByProp, type Cell, type Created, type GDocBlock } from './google-drive'
import { isMine, type ActionMeta } from './todo-labels'
import { listPeople } from './people'
import type { DocBlock } from './notion'
import type { PenNotes, PenSession } from './store'
import type { Lang } from './i18n'

const base = () => (process.env.PEN_PUBLIC_URL || 'https://www.tryjunoapp.com').replace(/\/$/, '')
export const openLink = (sessionId: string) => `${base()}/?open=${sessionId}`

const L = {
  en: {
    summary: 'Summary', todos: 'To-dos', decisions: 'Decisions', missed: 'Said once, easy to miss', questions: 'Still open', people: 'Who was there',
    open: 'Open the full note in Juno', from: 'From your recording in Juno', done: 'done', recording: 'Recording',
    todoSheet: 'Juno to-dos', contactSheet: 'Juno contacts', yes: 'Yes', no: 'No', openIt: 'Open',
    todoHead: ['Task', 'Owner', 'Due', 'Done', 'Recording', 'Recorded', 'Link'],
    contactHead: ['Name', 'Email', 'Role', 'Company', 'About', 'Recordings', 'Last seen'],
    todoTab: 'To-dos', contactTab: 'Contacts',
  },
  es: {
    summary: 'Resumen', todos: 'Pendientes', decisions: 'Decisiones', missed: 'Dicho una vez, fácil de perder', questions: 'Sin resolver', people: 'Quiénes estaban',
    open: 'Abrir la nota completa en Juno', from: 'De tu grabación en Juno', done: 'hecho', recording: 'Grabación',
    todoSheet: 'Pendientes de Juno', contactSheet: 'Contactos de Juno', yes: 'Sí', no: 'No', openIt: 'Abrir',
    todoHead: ['Tarea', 'Responsable', 'Fecha', 'Hecha', 'Grabación', 'Grabada', 'Link'],
    contactHead: ['Nombre', 'Email', 'Cargo', 'Empresa', 'Nota', 'Grabaciones', 'Última vez'],
    todoTab: 'Pendientes', contactTab: 'Contactos',
  },
  pt: {
    summary: 'Resumo', todos: 'Tarefas', decisions: 'Decisões', missed: 'Dito uma vez, fácil de perder', questions: 'Em aberto', people: 'Quem estava',
    open: 'Abrir a nota completa no Juno', from: 'Da sua gravação no Juno', done: 'feito', recording: 'Gravação',
    todoSheet: 'Tarefas do Juno', contactSheet: 'Contatos do Juno', yes: 'Sim', no: 'Não', openIt: 'Abrir',
    todoHead: ['Tarefa', 'Responsável', 'Prazo', 'Feita', 'Gravação', 'Gravada', 'Link'],
    contactHead: ['Nome', 'Email', 'Cargo', 'Empresa', 'Nota', 'Gravações', 'Última vez'],
    todoTab: 'Tarefas', contactTab: 'Contatos',
  },
} as const

const day = (iso: string | null | undefined) => (iso ?? '').slice(0, 10)

/* ------------------------------------------------------------- notes → Doc */

/** A recording's notes as Doc blocks (the same sections as the Notion page). */
export function notesBlocks(s: PenSession, lang: Lang): GDocBlock[] {
  const n: PenNotes = s.notes ?? {}
  const T = L[lang]
  const done = new Set(Array.isArray(s.action_done) ? s.action_done : [])
  const out: GDocBlock[] = []
  if (n.summary) out.push({ type: 'heading', text: T.summary }, { type: 'paragraph', text: n.summary })
  const acts = n.actions ?? []
  if (acts.length) {
    out.push({ type: 'heading', text: T.todos })
    acts.forEach((a, i) => out.push({ type: 'todo', text: [a.action, a.owner && `(${a.owner})`, a.due && `· ${a.due}`, done.has(i) && `· ${T.done} ✓`].filter(Boolean).join(' ') }))
  }
  if (n.decisions?.length) out.push({ type: 'heading', text: T.decisions }, ...n.decisions.map((d) => ({ type: 'bullet' as const, text: d.who ? `${d.decision} (${d.who})` : d.decision })))
  if (n.missed?.length) out.push({ type: 'heading', text: T.missed }, ...n.missed.map((m) => ({ type: 'bullet' as const, text: m.why ? `${m.item} — ${m.why}` : m.item })))
  if (n.open_questions?.length) out.push({ type: 'heading', text: T.questions }, ...n.open_questions.map((q) => ({ type: 'bullet' as const, text: q })))
  if (n.people?.length) out.push({ type: 'heading', text: T.people }, ...n.people.map((p) => ({ type: 'bullet' as const, text: [p.name, p.role].filter(Boolean).join(', ') })))
  out.push({ type: 'link', text: `${T.open} →`, url: openLink(s.id) })
  return out
}

/** "Send to Google Docs": the recording's notes as a Doc, once (sending again opens that Doc). */
export async function sendNotesToDocs(email: string, s: PenSession, lang: Lang): Promise<{ url: string; created: boolean }> {
  const prior = await findByProp(email, 'juno_session', s.id).catch(() => null)
  if (prior) return { url: prior.url, created: false }
  const title = s.title || s.notes?.headline || s.source_name || L[lang].recording
  const d = await createDoc(email, { title: `${title} · ${day(s.recorded_at ?? s.created_at)}`, blocks: notesBlocks(s, lang), props: { juno_session: s.id } })
  return { url: d.url, created: true }
}

/** A page Juno wrote for an offer (suggestion-docs.ts) as a Google Doc, with the way back to the recording. */
export async function planToDoc(email: string, lang: Lang, d: { title: string; blocks: DocBlock[]; sessionId?: string | null; ref?: string }): Promise<Created> {
  const blocks: GDocBlock[] = d.blocks.map((b) => ({ type: b.type, text: b.text }))
  if (d.sessionId) blocks.push({ type: 'link', text: `${L[lang].from} →`, url: openLink(d.sessionId) })
  return createDoc(email, { title: d.title, blocks, props: d.ref ? { juno_offer: d.ref } : {} })
}

/* ---------------------------------------------------------- Sheets exports */

type Row = { id: string; title: string | null; notes: PenNotes | null; action_done: number[] | null; action_meta?: ActionMeta[] | null; recorded_at: string | null; created_at: string }

/** Every to-do from the recordings: the user's own (or everyone's), open and done. */
export async function todoRows(email: string, lang: Lang, o: { everyone?: boolean; includeDone?: boolean } = {}): Promise<Cell[][]> {
  const T = L[lang]
  const query = (cols: string) => supabaseAdmin.from('pen_sessions').select(cols).eq('user_email', email.toLowerCase()).order('created_at', { ascending: false }).limit(400)
  let res = await query('id,title,notes,action_done,action_meta,recorded_at,created_at')
  if (res.error && /action_meta/.test(res.error.message)) res = await query('id,title,notes,action_done,recorded_at,created_at')
  if (res.error) throw new Error(res.error.message)
  const rows: Cell[][] = []
  for (const r of (res.data ?? []) as unknown as Row[]) {
    const acts = r.notes?.actions ?? []
    const done = new Set(Array.isArray(r.action_done) ? r.action_done : [])
    const meta = Array.isArray(r.action_meta) && r.action_meta.length === acts.length ? r.action_meta : null
    acts.forEach((a, i) => {
      if (!o.everyone && !isMine(meta?.[i] ?? null)) return
      if (o.includeDone === false && done.has(i)) return
      rows.push([
        a.action,
        a.owner || '',
        meta?.[i]?.due_date ?? a.due ?? '',
        done.has(i) ? T.yes : T.no,
        r.title || T.recording,
        day(r.recorded_at ?? r.created_at),
        { text: T.openIt, url: openLink(r.id) },
      ])
    })
  }
  return rows
}

export async function contactRows(email: string): Promise<Cell[][]> {
  const people = await listPeople(email.toLowerCase())
  return people.map((p) => [p.name, p.email ?? '', p.role ?? '', p.company ?? '', p.about ?? '', p.recordings, day(p.lastAt)])
}

const stamp = () => new Date().toISOString().slice(0, 10)

export type SheetExport = Created & { rows: number }

export async function exportTodosSheet(email: string, lang: Lang, o: { everyone?: boolean; includeDone?: boolean } = {}): Promise<SheetExport> {
  const T = L[lang]
  const rows = await todoRows(email, lang, o)
  const s = await createSheet(email, { title: `${T.todoSheet} · ${stamp()}`, tab: T.todoTab, headers: [...T.todoHead], rows, props: { juno_export: 'todos' } })
  return { ...s, rows: rows.length }
}

export async function exportContactsSheet(email: string, lang: Lang): Promise<SheetExport> {
  const T = L[lang]
  const rows = await contactRows(email)
  const s = await createSheet(email, { title: `${T.contactSheet} · ${stamp()}`, tab: T.contactTab, headers: [...T.contactHead], rows, props: { juno_export: 'contacts' } })
  return { ...s, rows: rows.length }
}
