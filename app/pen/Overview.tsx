'use client'

// Home: what came out of everything recorded, as three cards you can act on.
//
// Still to do, Nearly missed and People, side by side. Each shows its first few items and
// grows into a full panel on "See all", morphing out of the card rather than opening a
// separate screen, so it is obvious where the list came from and where closing returns to.
//
// Items are worked from here: tick an action off, mark a nearly-missed item handled or turn
// it into an action, hover anything for the detail. Every change is optimistic and undoable,
// and the counts move with it. The server copy catches up a moment later.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, useIsPresent } from 'motion/react'
import type { ArchiveStats, OpenAction, OpenMissed, ClientCard } from '@/lib/pen/stats'
import type { PersonCard } from '@/lib/pen/people'
import { getJson, postJson, patchJson, del, errMessage } from '@/lib/pen/http'
import { RowMenu, RenameInput } from './RowMenu'
import { JunoCard, NextLine, DateChip, type Lists, type NextUpView, type WaLink } from './JunoNoticed'
import Icon, { type IconName } from './Icon'
import DeliverableSheet, { DeliverableActions, type SheetRequest } from './DeliverableSheet'
import { isMine } from '@/lib/pen/todo-labels'
import { useCopy, useLang } from './LangContext'
import { shortDate as fmtShort, ago as fmtAgo, plural, type Copy } from '@/lib/pen/i18n'

type Kind = 'todo' | 'missed' | 'people'
type Heard = { name: string; count: number; moments: { session_id: string; title: string; when: string; at_sec: number; context: string | null }[] }

const MORPH = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 0.8 }
const EASE_OUT = [0.16, 1, 0.3, 1] as const
/** Items a card shows before "See all". */
const PREVIEW = 3

/* ================================================================== copy */

const OV_EN = {
  saveFailed: 'That did not save. Try again.',
  markedDone: 'Marked done',
  markedHandled: 'Marked handled',
  addedTodo: 'Added to your to-dos',
  heading: (n: number) => `${n} recording${n === 1 ? '' : 's'}, and what came out of them`,
  recorded: (t: string) => `${t} recorded`,
  latest: (d: string) => ` · latest ${d}`,
  todo: 'Your to-dos',
  todoEmpty: 'Nothing outstanding. Actions from each recording land here.',
  missed: 'Worth a second look',
  missedSub: 'said once, easy to lose',
  missedWeek: (n: number) => `${n} new this week · said once, easy to lose`,
  missedEmpty: 'Nothing slipped through. When a meeting has something easy to miss, it shows up here.',
  people: 'People',
  lastSpoke: (name: string) => `last spoke with ${name}`,
  nobody: 'nobody added yet',
  peopleEmpty: "Add who you spoke with from a recording's People section. Then ask about them with @ in search.",
  seeAll: (n: number) => `See all ${n}`,
  open: 'Open',
  ofDone: (d: number, t: number) => `${d} of ${t} done`,
  markDone: (a: string) => `Mark done: ${a}`,
  priority: 'Priority',
  owner: 'Owner',
  due: 'Due',
  from: 'From',
  markHandled: (m: string) => `Mark handled: ${m}`,
  handled: 'Handled',
  makeTodo: (m: string) => `Make it a to-do: ${m}`,
  makeTodoTitle: 'Make it a to-do',
  askAbout: (n: string) => `Ask about ${n}`,
  calls: ['call', 'calls'] as [string, string],
  noCard: 'No card yet. It is written the next time they are on a processed recording.',
  mustHave: 'Must have',
  dealbreakers: 'Dealbreakers',
  neverSaid: 'Never said outright',
  unknown: 'Still unknown',
  close: 'Close',
  filter: 'Filter',
  show: 'Show',
  shown: (n: number) => `${n} shown`,
  todoFilter: 'Filter by words, person or recording',
  all: (n: number) => `All ${n}`,
  hasDate: 'Has a date',
  nothingMatches: 'Nothing matches.',
  missedFilter: 'Filter by words or recording',
  last7: 'Last 7 days',
  peopleFilter: 'Filter by name, email or role',
  sheetExport: 'Export to Google Sheets',
  sheetExporting: 'Making the sheet…',
  sheetOpen: (n: number) => `Open the sheet (${n}) ↗`,
  heardIn: 'Heard in your recordings',
  heardTimes: (n: number) => `said ${n}×`,
  recent: 'Recent',
  mostCalls: 'Most calls',
  az: 'A to Z',
  nobodyMatches: 'Nobody matches.',
  orphans: 'Learned from recordings, not in People yet',
  undo: 'Undo',
  dismiss: 'Dismiss',
  emptyTitle: 'Nothing recorded yet',
  today: 'Today',
  dueNow: 'Due',
  waitingOnYou: 'Waiting on you',
  nothingDue: 'Nothing due today.',
  nobodyWaiting: 'Nobody waiting on you.',
  overdue: 'Overdue',
  dueToday: 'Today',
  dueTomorrow: 'Tomorrow',
  waits: (who: string) => `Waiting: ${who}`,
  draftFollowUp: 'Draft follow-up',
  everyoneElse: (n: number) => `Everyone else ${n}`,
  mine: 'Mine',
  greet: (part: 'morning' | 'afternoon' | 'evening', name: string | null) =>
    `Good ${part}${name ? `, ${name}` : ''}`,
  subline: (n: number, hours: string, latest: string | null) =>
    `${n} recording${n === 1 ? '' : 's'} · ${hours} captured${latest ? ` · latest ${latest}` : ''}`,
  needsAttention: 'Needs attention',
  newThisWeek: (n: number) => `${n} new this week`,
  inRecordings: 'In your recordings',
  youOwe: 'You owe',
  personOptions: (n: string) => `Options for ${n}`,
  rename: 'Rename',
  deleteContact: 'Delete contact',
  nameLabel: 'Name',
  confirmDeletePerson: (n: string) => `Delete ${n} from your People? Their recordings stay; only the contact and its links to recordings are removed.`,
  dupName: 'Someone with that name is already in your People.',
  personFailed: 'That did not work. Try again.',
  seeAllN: (n: number) => `See all ${n}`,
  emailWho: (n: string) => `Email ${n}`,
  worthSub: 'From this week. Said once, easy to lose.',
  recentPeople: 'Recent people',
  emptyBody: 'Plug the pen in and import one recording. From the second one on, Juno Pen starts joining them up: what the same people keep asking for, what you keep forgetting, what is still outstanding across everything.',
}

const OV: Copy<typeof OV_EN> = {
  en: OV_EN,
  es: {
    saveFailed: 'No se guardó. Inténtalo otra vez.',
    markedDone: 'Marcada como hecha',
    markedHandled: 'Marcado como resuelto',
    addedTodo: 'Agregado a tus pendientes',
    heading: (n) => (n === 1 ? '1 grabación, y lo que salió de ella' : `${n} grabaciones, y lo que salió de ellas`),
    recorded: (t) => `${t} grabadas`,
    latest: (d) => ` · la última el ${d}`,
    todo: 'Tus pendientes',
    todoEmpty: 'No hay nada pendiente. Las tareas de cada grabación aparecen aquí.',
    missed: 'Vale la pena revisar',
    missedSub: 'se dijo una vez, fácil de perder',
    missedWeek: (n: number) => `${n} ${n === 1 ? 'nuevo' : 'nuevos'} esta semana · se dijo una vez`,
    missedEmpty: 'No se te escapó nada. Cuando una reunión tenga algo fácil de pasar por alto, aparecerá aquí.',
    people: 'Personas',
    lastSpoke: (name) => `última vez con ${name}`,
    nobody: 'todavía no agregas a nadie',
    peopleEmpty: 'Agrega con quién hablaste desde la sección Personas de una grabación. Después pregunta por ellos con @ en la búsqueda.',
    seeAll: (n) => `Ver las ${n}`,
    open: 'Abrir',
    ofDone: (d, t) => `${d} de ${t} hechas`,
    markDone: (a) => `Marcar como hecha: ${a}`,
    priority: 'Prioridad',
    owner: 'Responsable',
    due: 'Fecha',
    from: 'De',
    markHandled: (m) => `Marcar como resuelto: ${m}`,
    handled: 'Resuelto',
    makeTodo: (m) => `Convertir en tarea: ${m}`,
    makeTodoTitle: 'Convertir en tarea',
    askAbout: (n) => `Preguntar por ${n}`,
    calls: ['reunión', 'reuniones'],
    noCard: 'Todavía no hay ficha. Se escribe la próxima vez que aparezca en una grabación procesada.',
    mustHave: 'Imprescindible',
    dealbreakers: 'Descartes',
    neverSaid: 'Nunca lo dijo directo',
    unknown: 'Todavía no se sabe',
    close: 'Cerrar',
    filter: 'Filtrar',
    show: 'Mostrar',
    shown: (n) => `${n} visibles`,
    todoFilter: 'Filtra por palabras, persona o grabación',
    all: (n) => `Todas ${n}`,
    hasDate: 'Con fecha',
    nothingMatches: 'No hay coincidencias.',
    missedFilter: 'Filtra por palabras o grabación',
    last7: 'Últimos 7 días',
    peopleFilter: 'Filtra por nombre, correo o cargo',
    sheetExport: 'Exportar a Google Sheets',
    sheetExporting: 'Creando la hoja…',
    sheetOpen: (n: number) => `Abrir la hoja (${n}) ↗`,
    heardIn: 'Escuchados en tus grabaciones',
    heardTimes: (n) => `dicho ${n}×`,
    recent: 'Recientes',
    mostCalls: 'Más reuniones',
    az: 'A a Z',
    nobodyMatches: 'Nadie coincide.',
    orphans: 'Aprendido de las grabaciones, todavía no está en Personas',
    undo: 'Deshacer',
    dismiss: 'Cerrar',
    emptyTitle: 'Todavía no hay grabaciones',
    today: 'Hoy',
    dueNow: 'Vence',
    waitingOnYou: 'Esperan algo de ti',
    nothingDue: 'Nada vence hoy.',
    nobodyWaiting: 'Nadie está esperando algo de ti.',
    overdue: 'Atrasado',
    dueToday: 'Hoy',
    dueTomorrow: 'Mañana',
    waits: (who) => `Espera: ${who}`,
    draftFollowUp: 'Redactar seguimiento',
    everyoneElse: (n) => `De otros ${n}`,
    mine: 'Mías',
    greet: (part, name) => `${part === 'morning' ? 'Buenos días' : part === 'afternoon' ? 'Buenas tardes' : 'Buenas noches'}${name ? `, ${name}` : ''}`,
    subline: (n, hours, latest) =>
      `${n} ${n === 1 ? 'grabación' : 'grabaciones'} · ${hours} capturadas${latest ? ` · la última el ${latest}` : ''}`,
    needsAttention: 'Requiere atención',
    newThisWeek: (n) => `${n} ${n === 1 ? 'nuevo' : 'nuevos'} esta semana`,
    inRecordings: 'En tus grabaciones',
    youOwe: 'Debes',
    personOptions: (n) => `Opciones de ${n}`,
    rename: 'Renombrar',
    deleteContact: 'Eliminar contacto',
    nameLabel: 'Nombre',
    confirmDeletePerson: (n) => `¿Eliminar a ${n} de tus Personas? Sus grabaciones se quedan; solo se borran el contacto y sus vínculos con las grabaciones.`,
    dupName: 'Ya hay alguien con ese nombre en tus Personas.',
    personFailed: 'No funcionó. Inténtalo otra vez.',
    seeAllN: (n) => `Ver todo (${n})`,
    emailWho: (n) => `Escribir a ${n}`,
    worthSub: 'De esta semana. Se dijo una vez, fácil de perder.',
    recentPeople: 'Personas recientes',
    emptyBody: 'Conecta el lápiz e importa una grabación. Desde la segunda, Juno Pen empieza a conectarlas: lo que las mismas personas siguen pidiendo, lo que se te sigue olvidando, lo que sigue pendiente en todo.',
  },
  pt: {
    saveFailed: 'Não foi salvo. Tente de novo.',
    markedDone: 'Marcada como feita',
    markedHandled: 'Marcado como resolvido',
    addedTodo: 'Adicionado às suas tarefas',
    heading: (n) => (n === 1 ? '1 gravação, e o que saiu dela' : `${n} gravações, e o que saiu delas`),
    recorded: (t) => `${t} gravadas`,
    latest: (d) => ` · a última em ${d}`,
    todo: 'Suas tarefas',
    todoEmpty: 'Nada pendente. As tarefas de cada gravação aparecem aqui.',
    missed: 'Vale uma segunda olhada',
    missedSub: 'dito uma vez, fácil de perder',
    missedWeek: (n: number) => `${n} ${n === 1 ? 'novo' : 'novos'} esta semana · dito uma vez`,
    missedEmpty: 'Nada escapou. Quando uma reunião tiver algo fácil de perder, aparece aqui.',
    people: 'Pessoas',
    lastSpoke: (name) => `última conversa com ${name}`,
    nobody: 'ninguém adicionado ainda',
    peopleEmpty: 'Adicione com quem você falou na seção Pessoas de uma gravação. Depois pergunte sobre eles com @ na busca.',
    seeAll: (n) => `Ver todas (${n})`,
    open: 'Abrir',
    ofDone: (d, t) => `${d} de ${t} feitas`,
    markDone: (a) => `Marcar como feita: ${a}`,
    priority: 'Prioridade',
    owner: 'Responsável',
    due: 'Prazo',
    from: 'De',
    markHandled: (m) => `Marcar como resolvido: ${m}`,
    handled: 'Resolvido',
    makeTodo: (m) => `Virar tarefa: ${m}`,
    makeTodoTitle: 'Virar tarefa',
    askAbout: (n) => `Perguntar sobre ${n}`,
    calls: ['reunião', 'reuniões'],
    noCard: 'Ainda sem ficha. Ela é escrita na próxima vez que a pessoa aparecer numa gravação processada.',
    mustHave: 'Indispensável',
    dealbreakers: 'Eliminatórios',
    neverSaid: 'Nunca disse com todas as letras',
    unknown: 'Ainda não se sabe',
    close: 'Fechar',
    filter: 'Filtrar',
    show: 'Mostrar',
    shown: (n) => `${n} visíveis`,
    todoFilter: 'Filtre por palavras, pessoa ou gravação',
    all: (n) => `Todas ${n}`,
    hasDate: 'Com prazo',
    nothingMatches: 'Nada encontrado.',
    missedFilter: 'Filtre por palavras ou gravação',
    last7: 'Últimos 7 dias',
    peopleFilter: 'Filtre por nome, e-mail ou cargo',
    sheetExport: 'Exportar para o Planilhas Google',
    sheetExporting: 'Criando a planilha…',
    sheetOpen: (n: number) => `Abrir a planilha (${n}) ↗`,
    heardIn: 'Ouvidos nas suas gravações',
    heardTimes: (n) => `dito ${n}×`,
    recent: 'Recentes',
    mostCalls: 'Mais reuniões',
    az: 'A a Z',
    nobodyMatches: 'Ninguém encontrado.',
    orphans: 'Aprendido nas gravações, ainda não está em Pessoas',
    undo: 'Desfazer',
    dismiss: 'Fechar',
    emptyTitle: 'Nada gravado ainda',
    today: 'Hoje',
    dueNow: 'Vence',
    waitingOnYou: 'Esperando por você',
    nothingDue: 'Nada vence hoje.',
    nobodyWaiting: 'Ninguém esperando por você.',
    overdue: 'Atrasado',
    dueToday: 'Hoje',
    dueTomorrow: 'Amanhã',
    waits: (who) => `Aguarda: ${who}`,
    draftFollowUp: 'Escrever follow-up',
    everyoneElse: (n) => `De outros ${n}`,
    mine: 'Minhas',
    greet: (part, name) => `${part === 'morning' ? 'Bom dia' : part === 'afternoon' ? 'Boa tarde' : 'Boa noite'}${name ? `, ${name}` : ''}`,
    subline: (n, hours, latest) =>
      `${n} ${n === 1 ? 'gravação' : 'gravações'} · ${hours} capturadas${latest ? ` · a última em ${latest}` : ''}`,
    needsAttention: 'Precisa de atenção',
    newThisWeek: (n) => `${n} ${n === 1 ? 'novo' : 'novos'} esta semana`,
    inRecordings: 'Nas suas gravações',
    youOwe: 'Você deve',
    personOptions: (n) => `Opções de ${n}`,
    rename: 'Renomear',
    deleteContact: 'Excluir contato',
    nameLabel: 'Nome',
    confirmDeletePerson: (n) => `Excluir ${n} das suas Pessoas? As gravações continuam; só o contato e os vínculos com as gravações são removidos.`,
    dupName: 'Já existe alguém com esse nome nas suas Pessoas.',
    personFailed: 'Não funcionou. Tente de novo.',
    seeAllN: (n) => `Ver tudo (${n})`,
    emailWho: (n) => `Escrever para ${n}`,
    worthSub: 'Desta semana. Dito uma vez, fácil de perder.',
    recentPeople: 'Pessoas recentes',
    emptyBody: 'Conecte a caneta e importe uma gravação. A partir da segunda, o Juno Pen começa a ligar os pontos: o que as mesmas pessoas continuam pedindo, o que você continua esquecendo, o que ainda está pendente em tudo.',
  },
}

export default function Overview({
  stats,
  people,
  peopleLoading = false,
  onOpen,
  onAskPerson,
  onChanged,
  onPeopleChanged = () => {},
  firstName = null,
  suggestions = null,
  sheets = false,
  phone = false,
  ownRecordings = 1,
  onUpload,
  next = null,
  whatsapp = null,
}: {
  /** The phone's Home: the Juno card, Today (3) and the WhatsApp line, nothing else. */
  phone?: boolean
  /** Recordings of the user's own (not the sample). None = the first-week prompt. */
  ownRecordings?: number
  onUpload?: () => void
  /** Home's "Next from Juno" (lib/pen/next-up.ts). */
  next?: NextUpView | null
  whatsapp?: WaLink
  /** Google is set up and the account can act: "Export to Google Sheets" on To-do and People. */
  sheets?: boolean
  /** Juno's open offers and recent yeses, from the server render (JunoNoticed.tsx). */
  suggestions?: Lists | null
  /** A person was renamed or deleted here: reload the People list. */
  onPeopleChanged?: () => void
  /** For the greeting. The session's name, first word; none means a greeting without a name. */
  firstName?: string | null
  stats: ArchiveStats
  people: PersonCard[]
  peopleLoading?: boolean
  onOpen: (sessionId: string) => void
  /** Start a search scoped to one person: "Show me all the conversations with @Name". */
  onAskPerson: (p: PersonCard) => void
  /** Something was ticked or dismissed; refresh the counts elsewhere in the app. */
  onChanged: () => void
}) {
  // Local copies, so a tick removes the row immediately. Re-seeded whenever the server
  // snapshot changes, which happens a moment after each change settles.
  const T = useCopy(OV)
  const lang = useLang()
  const personActions = usePersonActions(onPeopleChanged)
  // The viewer's own clock, read after mount: the server's hour is not the viewer's.
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => {
    setHour(new Date().getHours())
    const t = setInterval(() => setHour(new Date().getHours()), 10 * 60_000)
    return () => clearInterval(t)
  }, [])
  const [actions, setActions] = useState<OpenAction[]>(stats.openActions)
  const [missed, setMissed] = useState<OpenMissed[]>(stats.openMissed ?? [])
  const [doneExtra, setDoneExtra] = useState(0)
  // Items ticked or dismissed here whose write may not have reached the snapshot yet. A
  // background refresh that races the write would otherwise put the row straight back.
  const hidden = useRef(new Set<string>())
  useEffect(() => {
    const serverOpen = new Set([
      ...stats.openActions.map((a) => `a:${a.sessionId}:${a.index}`),
      ...(stats.openMissed ?? []).map((m) => `m:${m.sessionId}:${m.index}`),
    ])
    // Once the server no longer lists an item, the write has landed and the guard can go.
    for (const k of Array.from(hidden.current)) if (!serverOpen.has(k)) hidden.current.delete(k)
    setActions(stats.openActions.filter((a) => !hidden.current.has(`a:${a.sessionId}:${a.index}`)))
    setMissed((stats.openMissed ?? []).filter((m) => !hidden.current.has(`m:${m.sessionId}:${m.index}`)))
    setDoneExtra(stats.openActions.filter((a) => hidden.current.has(`a:${a.sessionId}:${a.index}`)).length)
  }, [stats])

  const [open, setOpen] = useState<Kind | null>(null)
  const [sheet, setSheet] = useState<{ sessionId: string; req: SheetRequest } | null>(null)
  const [toast, setToast] = useState<{ text: string; undo?: () => void; tone?: 'bad' } | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const changed = useCallback(() => {
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(onChanged, 1800)
  }, [onChanged])

  const clientsByName = useMemo(() => new Map(stats.clients.map((c) => [c.name.toLowerCase(), c])), [stats.clients])

  const send = useCallback(async (body: { op: string; sessionId: string; index: number }) => {
    return postJson<{ ok: true; actionIndex?: number }>('/api/pen/home', body)
  }, [])

  const fail = (e: unknown) => setToast({ text: errMessage(e, T.saveFailed), tone: 'bad' })

  /* -------------------------------------------------------------- actions */

  const tick = useCallback(
    async (a: OpenAction) => {
      const at = actions.indexOf(a)
      const key = `a:${a.sessionId}:${a.index}`
      hidden.current.add(key)
      setActions((xs) => xs.filter((x) => x !== a))
      setDoneExtra((n) => n + 1)
      // Undo waits for this save to land first. Sent in parallel, "undone" can reach the server
      // before "done" and the item ends up done anyway.
      const saving = send({ op: 'done', sessionId: a.sessionId, index: a.index })
      const undo = async () => {
        hidden.current.delete(key)
        setActions((xs) => [...xs.slice(0, at), a, ...xs.slice(at)])
        setDoneExtra((n) => n - 1)
        setToast(null)
        try {
          await saving.catch(() => {})
          await send({ op: 'undone', sessionId: a.sessionId, index: a.index })
          changed()
        } catch (e) {
          fail(e)
        }
      }
      setToast({ text: T.markedDone, undo })
      try {
        await saving
        changed()
      } catch (e) {
        hidden.current.delete(key)
        setActions((xs) => [...xs.slice(0, at), a, ...xs.slice(at)])
        setDoneExtra((n) => n - 1)
        fail(e)
      }
    },
    [actions, send, changed, T],
  )

  /* --------------------------------------------------------- nearly missed */

  const handle = useCallback(
    async (m: OpenMissed) => {
      const at = missed.indexOf(m)
      const key = `m:${m.sessionId}:${m.index}`
      hidden.current.add(key)
      const restore = () => {
        hidden.current.delete(key)
        setMissed((xs) => [...xs.slice(0, at), m, ...xs.slice(at)])
      }
      setMissed((xs) => xs.filter((x) => x !== m))
      const saving = send({ op: 'handled', sessionId: m.sessionId, index: m.index })
      setToast({
        text: T.markedHandled,
        undo: async () => {
          restore()
          setToast(null)
          try {
            await saving.catch(() => {})
            await send({ op: 'unhandled', sessionId: m.sessionId, index: m.index })
            changed()
          } catch (e) {
            fail(e)
          }
        },
      })
      try {
        await saving
        changed()
      } catch (e) {
        restore()
        fail(e)
      }
    },
    [missed, send, changed, T],
  )

  const promote = useCallback(
    async (m: OpenMissed) => {
      const at = missed.indexOf(m)
      const key = `m:${m.sessionId}:${m.index}`
      hidden.current.add(key)
      setMissed((xs) => xs.filter((x) => x !== m))
      try {
        const r = await send({ op: 'todo', sessionId: m.sessionId, index: m.index })
        const added: OpenAction = {
          sessionId: m.sessionId,
          sessionTitle: m.sessionTitle,
          when: m.when,
          action: m.item,
          owner: '',
          due: '',
          priority: 'normal',
          index: r.actionIndex ?? 0,
          mine: 'me',
          dueDate: null,
          waiting: null,
        }
        setActions((xs) => [added, ...xs])
        setToast({ text: T.addedTodo })
        changed()
      } catch (e) {
        hidden.current.delete(key)
        setMissed((xs) => [...xs.slice(0, at), m, ...xs.slice(at)])
        fail(e)
      }
    },
    [missed, send, changed, T],
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [toast])

  const part = hour === null ? 'morning' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const card = (
    <JunoCard
      greeting={T.greet(part, firstName)}
      ready={hour !== null}
      initial={suggestions}
      onOpenRecording={onOpen}
      phone={phone}
      firstWeek={!stats.recordings || ownRecordings === 0}
      onUpload={onUpload}
      next={next}
      whatsapp={whatsapp}
    />
  )
  if (!stats.recordings) {
    return (
      <div className="pen-home" data-phone={phone || undefined}>
        {card}
        {phone && <NextLine next={next} whatsapp={whatsapp} />}
      </div>
    )
  }

  // Only the user's own to-dos count and show; everyone else's sit behind a filter in the panel.
  const mineList = actions.filter((a) => isMine(a))
  const othersList = actions.filter((a) => !isMine(a))
  const openCount = mineList.length + Math.max(0, stats.actionsOpen - stats.openActions.filter((a) => isMine(a)).length)
  const missedCount = missed.length + Math.max(0, (stats.missedOpen ?? 0) - (stats.openMissed?.length ?? 0))
  const draft = (a: OpenAction, kind: SheetRequest['kind']) => setSheet({ sessionId: a.sessionId, req: { kind, item: a.action } })

  return (
    <div className="pen-home" data-phone={phone || undefined}>
      {/* Juno speaks first: what needs you, what it did, what it does next (critique 16 Oct). */}
      {card}

      <LayoutGroup>
        <Today actions={mineList} max={phone ? 3 : 5} total={openCount} onTick={tick} onOpen={onOpen} onDraft={draft} onSeeAll={() => setOpen('todo')} />

        {phone ? (
          <NextLine next={next} whatsapp={whatsapp} />
        ) : (
          <>
            <WorthALook missed={missed} count={missedCount} onHandle={handle} onPromote={promote} onOpen={onOpen} onSeeAll={() => setOpen('missed')} />
            <PeopleStrip people={people} loading={peopleLoading} onAsk={onAskPerson} onSeeAll={() => setOpen('people')} />
          </>
        )}

        <Panel open={open} onClose={() => setOpen(null)}>
          {open === 'todo' && (
            <TodoPanel actions={mineList} others={othersList} count={openCount} onTick={tick} onOpen={(id) => { setOpen(null); onOpen(id) }} sheets={sheets} />
          )}
          {open === 'missed' && (
            <MissedPanel missed={missed} count={missedCount} onHandle={handle} onPromote={promote} onOpen={(id) => { setOpen(null); onOpen(id) }} />
          )}
          {open === 'people' && (
            <PeoplePanel people={people} clients={stats.clients} clientsByName={clientsByName} onAsk={(p) => { setOpen(null); onAskPerson(p) }} actions={personActions} onOpenRecording={(id) => { setOpen(null); onOpen(id) }} sheets={sheets} />
          )}
        </Panel>
      </LayoutGroup>

      <Toast toast={toast} onClose={() => setToast(null)} />
      <DeliverableSheet request={sheet?.req ?? null} sessionId={sheet?.sessionId ?? ''} onClose={() => setSheet(null)} />
    </div>
  )
}

/* ================================================================== panels */

const TITLES: Record<Kind, { title: 'todo' | 'missed' | 'people'; icon: IconName }> = {
  todo: { title: 'todo', icon: 'checklist' },
  missed: { title: 'missed', icon: 'alert' },
  people: { title: 'people', icon: 'people' },
}

/* ================================================================== rows */

const rowMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: EASE_OUT },
}



/** Hover or keyboard focus shows it; leaving hides it. A short delay so skimming the list does not flash cards. */
function usePeek() {
  const [on, setOn] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = () => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setOn(true), 320)
  }
  const hide = () => {
    if (t.current) clearTimeout(t.current)
    setOn(false)
  }
  useEffect(() => () => { if (t.current) clearTimeout(t.current) }, [])
  return { on, bind: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide } }
}

function Peek({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          className="pen-peek"
          role="tooltip"
          initial={{ opacity: 0, y: 4, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 2 }}
          transition={{ duration: 0.16, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ActionRow({ a, onTick, onOpen, onDraft, full = false }: { a: OpenAction; onTick: (a: OpenAction) => void; onOpen: (id: string) => void; onDraft?: (a: OpenAction, kind: SheetRequest['kind']) => void; full?: boolean }) {
  const T = useCopy(OV)
  const lang = useLang()
  const peek = usePeek()
  const [ticking, setTicking] = useState(false)
  // Undo brings the same row back while it is still leaving, so React reuses this component
  // with its check drawn. Clear it whenever the row becomes present again.
  const present = useIsPresent()
  useEffect(() => {
    if (present) setTicking(false)
  }, [present])
  return (
    <motion.li {...rowMotion} className="pen-row2" data-full={full} {...(full ? {} : peek.bind)}>
      <div className="pen-row2-inner">
        <button
          type="button"
          className="pen-tick"
          data-on={ticking}
          aria-label={T.markDone(a.action)}
          onClick={() => {
            setTicking(true)
            // The check draws first, then the row leaves. Removing it instantly reads as a glitch.
            setTimeout(() => onTick(a), 260)
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden>
            <motion.path
              d="M5.2 10.4 8.4 13.6 14.8 6.8"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: ticking ? 1 : 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            />
          </svg>
        </button>
        <div className="pen-row2-main">
          <button type="button" className="pen-row2-open" onClick={() => onOpen(a.sessionId)}>
            <span className="pen-row2-text" data-done={ticking}>{a.action}</span>
          </button>
          <span className="pen-row2-meta">
            {a.priority === 'high' && <span className="pen-row2-flag">{T.priority}</span>}
            {/* A dated to-do's date is its "add to calendar" (Google when connected, else .ics). */}
            {a.dueDate ? (
              <DateChip sessionId={a.sessionId} index={a.index} label={dueLabel(a.dueDate, T, lang)} late={a.dueDate < todayIso()} />
            ) : (
              a.due && <span className="pen-row2-due">{a.due}</span>
            )}
            {/* Who, then where it came from, as one muted run that ellipsizes at the source. */}
            <span className="pen-row2-src">
              {[!isMine(a) ? a.owner : a.waiting, a.sessionTitle].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
        {/* A labelled menu (Email / Memo / Task card), not a bare envelope: "Email Titi" says
            who it is for. The menu takes focus, Escape closes it and returns focus. */}
        {onDraft && (
          <DeliverableActions
            item={a.action}
            label={a.waiting ? T.emailWho(a.waiting.split(/[\s,]+/)[0]) : T.draftFollowUp}
            onPick={(kind) => onDraft(a, kind)}
          />
        )}
      </div>
      {!full && (
        <Peek on={peek.on}>
          <p className="pen-peek-text">{a.action}</p>
          <dl className="pen-peek-facts">
            {a.owner && <><dt>{T.owner}</dt><dd>{a.owner}</dd></>}
            {a.due && <><dt>{T.due}</dt><dd>{a.due}</dd></>}
            <dt>{T.from}</dt><dd>{`${a.sessionTitle} · ${fmtShort(a.when, lang)}`}</dd>
          </dl>
        </Peek>
      )}
    </motion.li>
  )
}

/* ================================================================= today */

/** How far back an overdue item still counts as "due" in Today. */
const STALE_DAYS = 14

/** Today in the viewer's own timezone, as YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dueLabel(iso: string, T: typeof OV_EN, lang: ReturnType<typeof useLang>): string {
  const today = todayIso()
  const tomorrow = new Date(Date.now() + 86_400_000)
  const tIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  if (iso === today) return T.dueToday
  if (iso === tIso) return T.dueTomorrow
  // Noon UTC, so the label is the stored day whatever the viewer's timezone.
  const day = fmtShort(`${iso}T12:00:00Z`, lang, 'UTC')
  return iso < today ? `${T.overdue} · ${day}` : day
}

/**
 * Today, under the Juno card: what is due (or overdue) and who is waiting on the user, capped
 * at `max` rows with "See all" for the rest. Both come from action_meta; an archive with no labels
 * yet shows the newest to-dos instead of a false "nothing due".
 */
function Today({ actions, max, total, onTick, onOpen, onDraft, onSeeAll }: {
  actions: OpenAction[]
  max: number
  total: number
  onTick: (a: OpenAction) => void
  onOpen: (id: string) => void
  onDraft: (a: OpenAction, kind: SheetRequest['kind']) => void
  onSeeAll: () => void
}) {
  const T = useCopy(OV)
  const lang = useLang()
  if (!actions.length) return null
  const labelled = actions.some((a) => a.mine !== null)
  const today = todayIso()
  // Overdue by more than two weeks is history, not today's list; it stays in Your to-dos.
  const floor = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const due = labelled
    ? actions.filter((a) => a.dueDate && a.dueDate <= today && a.dueDate >= floor).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, max)
    : []
  const dueKeys = new Set(due.map((a) => `${a.sessionId}:${a.index}`))
  // Oldest promise first: someone waiting two weeks outranks someone waiting since this morning.
  const waiting = labelled
    ? actions.filter((a) => a.waiting && !dueKeys.has(`${a.sessionId}:${a.index}`)).sort((a, b) => a.when.localeCompare(b.when)).slice(0, Math.max(0, max - due.length))
    : []
  const plain = labelled ? [] : actions.slice(0, max)
  const shown = due.length + waiting.length + plain.length
  return (
    <section className="pen-today" aria-labelledby="pen-today-title">
      <header className="pen-today-head">
        <span className="pen-card-icon" data-kind="today"><Icon name="calendar" size={16} /></span>
        <h3 id="pen-today-title" className="pen-card-title">{T.today}</h3>
        <span className="pen-today-date">{new Date().toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </header>
      {labelled ? (
        <>
        {!due.length && <p className="pen-today-nodue">{T.nothingDue}</p>}
        <div className="pen-today-cols" data-one={!due.length || undefined}>
          {due.length > 0 && <div className="pen-today-col">
            <h4 className="pen-today-sub">{T.dueNow}{due.length ? ` · ${due.length}` : ''}</h4>
            <ul className="pen-card-list">
              <AnimatePresence initial={false}>
                {due.map((a) => <ActionRow key={`${a.sessionId}:${a.index}`} a={a} onTick={onTick} onOpen={onOpen} onDraft={a.waiting ? onDraft : undefined} />)}
              </AnimatePresence>
            </ul>
          </div>}
          <div className="pen-today-col">
            <h4 className="pen-today-sub">{T.youOwe}{waiting.length ? ` · ${waiting.length}` : ''}</h4>
            <ul className="pen-card-list">
              <AnimatePresence initial={false}>
                {waiting.map((a) => <ActionRow key={`${a.sessionId}:${a.index}`} a={a} onTick={onTick} onOpen={onOpen} onDraft={onDraft} />)}
              </AnimatePresence>
              {!waiting.length && <li className="pen-card-empty">{T.nobodyWaiting}</li>}
            </ul>
          </div>
        </div>
        </>
      ) : (
        <ul className="pen-card-list pen-today-plain">
          <AnimatePresence initial={false}>
            {plain.map((a) => <ActionRow key={`${a.sessionId}:${a.index}`} a={a} onTick={onTick} onOpen={onOpen} />)}
          </AnimatePresence>
        </ul>
      )}
      {total > shown && (
        <button type="button" className="pen-card-more" onClick={onSeeAll} aria-haspopup="dialog">
          {T.seeAllN(total)}
          <Icon name="chevron" size={15} />
        </button>
      )}
    </section>
  )
}

/* ====================================================== worth a second look */

const MONEY_RE = /[$€£]|\bR\$|\b\d+(?:[.,]\d+)?\s?(?:k|m|mil|usd|eur|clp|brl|mxn)\b|\b(?:price|pricing|budget|cost|fee|invoice|pay|paid|precio|presupuesto|costo|pago|factura|preço|orçamento|custo|pagamento)\b/i
const DATE_RE = /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(?:today|tomorrow|tonight|next week|deadline|lunes|martes|miércoles|jueves|viernes|mañana|semana que viene|hoje|amanhã|segunda|terça|quarta|quinta|sexta|prazo|plazo)\b|\b\d{1,2}[/:.]\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic|fev|set|out|dez)[a-z]*\.?\s+\d{1,2}\b/i
// Voice memos and notes-to-self: what they "nearly missed" is the user's own thinking aloud.
const INTERNAL_RE = /\b(?:voice memo|memo|note to self|notes?|to-?do|reminder|nota|notas|apuntes|recordatorio|lembrete|anotações)\b/i

/** Recency (this week), plus a person, a date or money in it; internal notes drop out. */
function rankMissed(missed: OpenMissed[]): OpenMissed[] {
  const now = Date.now()
  return missed
    .filter((m) => now - Date.parse(m.when) < 7 * 86_400_000 && !INTERNAL_RE.test(m.sessionTitle))
    .map((m) => {
      const text = `${m.item} ${m.why}`
      const words = m.item.split(/\s+/).slice(1)
      const person = words.some((w) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/.test(w))
      const score = 1 - (now - Date.parse(m.when)) / (7 * 86_400_000) + (MONEY_RE.test(text) ? 0.6 : 0) + (DATE_RE.test(text) ? 0.5 : 0) + (person ? 0.4 : 0)
      return { m, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.m)
}

/** The 1–3 things from this week most worth a second look. Hidden when there are none. */
function WorthALook({ missed, count, onHandle, onPromote, onOpen, onSeeAll }: {
  missed: OpenMissed[]
  count: number
  onHandle: (m: OpenMissed) => void
  onPromote: (m: OpenMissed) => void
  onOpen: (id: string) => void
  onSeeAll: () => void
}) {
  const T = useCopy(OV)
  const top = useMemo(() => rankMissed(missed), [missed])
  if (!top.length) return null
  return (
    <section className="pen-worth" aria-labelledby="pen-worth-title">
      <header className="pen-worth-head">
        <h3 id="pen-worth-title" className="pen-card-title">{T.missed}</h3>
        <p className="pen-worth-sub">{T.worthSub}</p>
      </header>
      <ul className="pen-card-list">
        <AnimatePresence initial={false}>
          {top.map((m) => <MissedRow key={`${m.sessionId}:${m.index}`} m={m} onHandle={onHandle} onPromote={onPromote} onOpen={onOpen} />)}
        </AnimatePresence>
      </ul>
      {count > top.length && (
        <button type="button" className="pen-card-more" data-quiet onClick={onSeeAll} aria-haspopup="dialog">
          {T.seeAllN(count)}
          <Icon name="chevron" size={15} />
        </button>
      )}
    </section>
  )
}

function MissedRow({
  m,
  onHandle,
  onPromote,
  onOpen,
  full = false,
}: {
  m: OpenMissed
  onHandle: (m: OpenMissed) => void
  onPromote: (m: OpenMissed) => void
  onOpen: (id: string) => void
  full?: boolean
}) {
  const T = useCopy(OV)
  const lang = useLang()
  const peek = usePeek()
  return (
    <motion.li {...rowMotion} className="pen-row2" data-full={full} {...(full ? {} : peek.bind)}>
      <div className="pen-row2-inner">
        <span className="pen-row2-mark" aria-hidden />
        <button type="button" className="pen-row2-main" onClick={() => onOpen(m.sessionId)}>
          <span className="pen-row2-text">{m.item}</span>
          {full && m.why && <span className="pen-row2-why">{m.why}</span>}
          <span className="pen-row2-meta"><span>{full ? `${m.sessionTitle} · ${fmtShort(m.when, lang)}` : m.sessionTitle}</span></span>
        </button>
        <span className="pen-row2-tools">
          <button type="button" className="pen-tool" onClick={() => onHandle(m)} aria-label={T.markHandled(m.item)} title={T.handled}>
            <Icon name="check" size={15} />
          </button>
          <button type="button" className="pen-tool" onClick={() => onPromote(m)} aria-label={T.makeTodo(m.item)} title={T.makeTodoTitle}>
            <Icon name="plus" size={15} />
          </button>
        </span>
      </div>
      {!full && (
        <Peek on={peek.on}>
          <p className="pen-peek-text">{m.item}</p>
          {m.why && <p className="pen-peek-why">{m.why}</p>}
          <dl className="pen-peek-facts"><dt>{T.from}</dt><dd>{`${m.sessionTitle} · ${fmtShort(m.when, lang)}`}</dd></dl>
        </Peek>
      )}
    </motion.li>
  )
}

/** Recent people as one compact row. Each asks about them; the full list is behind See all. */
function PeopleStrip({ people, loading, onAsk, onSeeAll }: { people: PersonCard[]; loading: boolean; onAsk: (p: PersonCard) => void; onSeeAll: () => void }) {
  const T = useCopy(OV)
  if (loading || !people.length) return null
  const recent = [...people].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '')).slice(0, 8)
  return (
    <section className="pen-pstrip" aria-labelledby="pen-pstrip-title">
      <h3 id="pen-pstrip-title" className="pen-pstrip-title">{T.recentPeople}</h3>
      <ul className="pen-pstrip-list">
        {recent.map((p) => (
          <li key={p.id}>
            <button type="button" className="pen-pstrip-p" onClick={() => onAsk(p)} title={T.askAbout(p.name)}>
              <span className="pen-avatar" aria-hidden="true">{initials(p.name)}</span>
              <span className="pen-pstrip-name">{p.name.split(' ')[0]}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="pen-pstrip-all" onClick={onSeeAll} aria-haspopup="dialog">
        {T.seeAllN(people.length)}
        <Icon name="chevron" size={15} />
      </button>
    </section>
  )
}

/* ------------------------------------------------- rename / delete a person */

type PersonActions = ReturnType<typeof usePersonActions>

/** Rename and delete for the People rows on Home and in the People panel. One row at a time. */
function usePersonActions(onPeopleChanged: () => void) {
  const T = useCopy(OV)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cancel = useCallback(() => { setEditing(null); setError(null); setFailedId(null) }, [])
  const start = useCallback((id: string) => { setError(null); setFailedId(null); setEditing(id) }, [])
  const rename = useCallback(async (p: PersonCard, name: string) => {
    if (!name || name === p.name) { cancel(); return }
    setBusy(true)
    setError(null)
    try {
      await patchJson(`/api/pen/people/${p.id}`, { name })
      setEditing(null)
      onPeopleChanged()
    } catch (e) {
      setFailedId(p.id)
      setError((e as { status?: number }).status === 409 ? T.dupName : errMessage(e, T.personFailed))
    } finally {
      setBusy(false)
    }
  }, [cancel, onPeopleChanged, T])
  const remove = useCallback(async (p: PersonCard) => {
    if (!window.confirm(T.confirmDeletePerson(p.name))) return
    setBusy(true)
    setError(null)
    try {
      await del(`/api/pen/people/${p.id}?contact=1`)
      onPeopleChanged()
    } catch (e) {
      setFailedId(p.id)
      setError(errMessage(e, T.personFailed))
    } finally {
      setBusy(false)
    }
  }, [onPeopleChanged, T])
  return { editing, error, failedId, busy, cancel, start, rename, remove }
}

function PersonMenu({ p, actions }: { p: PersonCard; actions: PersonActions }) {
  const T = useCopy(OV)
  return (
    <RowMenu
      label={T.personOptions(p.name)}
      items={[
        { label: T.rename, icon: 'pen', onSelect: () => actions.start(p.id) },
        { label: T.deleteContact, icon: 'trash', danger: true, onSelect: () => void actions.remove(p) },
      ]}
    />
  )
}

function PersonDetail({ p, client, onAsk }: { p: PersonCard; client?: ClientCard; onAsk: (p: PersonCard) => void }) {
  const T = useCopy(OV)
  return (
    <div className="pen-person-detail">
      <div className="pen-person-detail-head">
        <strong>{p.name}</strong>
        {(p.role || p.company) && <span>{[p.role, p.company].filter(Boolean).join(' · ')}</span>}
      </div>
      {p.email && <span className="pen-person-email">{p.email}</span>}
      {p.summary ? <p className="pen-peek-why">{p.summary}</p> : <p className="pen-peek-why">{T.noCard}</p>}
      {client && <ClientFacets c={client} />}
      <button type="button" className="pen-peek-ask" onMouseDown={(e) => e.preventDefault()} onClick={() => onAsk(p)}>
        <Icon name="search" size={14} />
        {T.askAbout(p.name.split(' ')[0])}
      </button>
    </div>
  )
}

/** What the client profile learned across meetings. Formerly its own section on Home. */
function ClientFacets({ c }: { c: ClientCard }) {
  const T = useCopy(OV)
  const rows: [string, string[] | undefined, string][] = [
    [T.mustHave, c.profile.must_haves, ''],
    [T.dealbreakers, c.profile.dealbreakers, 'bad'],
    [T.neverSaid, c.profile.revealed_criteria, 'accent'],
    [T.unknown, c.profile.open_questions, ''],
  ]
  const shown = rows.filter(([, xs]) => xs?.length)
  if (!shown.length) return null
  return (
    <div className="pen-facets">
      {shown.map(([label, xs, tone]) => (
        <div key={label}>
          <div className="pen-facet-label" data-tone={tone}>{label}</div>
          <ul>{xs!.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      ))}
    </div>
  )
}

/* ================================================================= panel */

function Panel({ open, onClose, children }: { open: Kind | null; onClose: () => void; children: React.ReactNode }) {
  const T = useCopy(OV)
  const reduce = useReducedMotion()
  const [host, setHost] = useState<Element | null>(null)
  const back = useRef<HTMLElement | null>(null)
  // Portalled into .pen-root, not document.body: the fonts and tokens are declared on it.
  useEffect(() => setHost(document.querySelector('.pen-root')), [])

  useEffect(() => {
    if (!open) return
    back.current = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      // Focus goes back to whatever opened it.
      requestAnimationFrame(() => back.current?.focus?.())
    }
  }, [open, onClose])

  if (!host) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="pen-panel-layer">
          <motion.div
            className="pen-panel-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.section
            layoutId={reduce ? undefined : `home-${open}`}
            transition={MORPH}
            className="pen-bigpanel"
            role="dialog"
            aria-modal="true"
            aria-label={T[TITLES[open].title]}
            {...(reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : {})}
          >
            <header className="pen-bigpanel-head">
              <span className="pen-card-icon" data-kind={open}><Icon name={TITLES[open].icon} size={17} /></span>
              <h3 className="pen-bigpanel-title">{T[TITLES[open].title]}</h3>
              <button type="button" className="pen-bigpanel-close" onClick={onClose} aria-label={T.close}>
                <svg viewBox="0 0 20 20" aria-hidden><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              </button>
            </header>
            {/* Content fades in after the morph has most of its size, so text never squashes. */}
            <motion.div
              className="pen-bigpanel-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.12, duration: 0.18 } }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              {children}
            </motion.div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    host,
  )
}

function Toolbar({ q, setQ, placeholder, filters, filter, setFilter, count, action }: {
  /** One small action at the end of the row (Export to Google Sheets). */
  action?: React.ReactNode
  q: string
  setQ: (v: string) => void
  placeholder: string
  filters: { key: string; label: string }[]
  filter: string
  setFilter: (k: string) => void
  count: number
}) {
  const T = useCopy(OV)
  return (
    <div className="pen-bigpanel-tools">
      <label className="pen-bigpanel-search">
        <Icon name="search" size={16} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={T.filter} />
      </label>
      <div className="pen-bigpanel-filters" role="group" aria-label={T.show}>
        {filters.map((f) => (
          <button key={f.key} type="button" className="pen-set-chip" data-on={filter === f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <span className="pen-bigpanel-n">{T.shown(count)}</span>
      {action}
    </div>
  )
}

/**
 * "Export to Google Sheets" (lib/pen/google-exports.ts): a new Sheet in the user's "Juno Pen"
 * Drive folder, then a link to it. Not connected: Settings → Google, at Docs & Sheets.
 */
function ExportSheet({ what }: { what: 'todos' | 'contacts' }) {
  const T = useCopy(OV)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ url: string; rows: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (done) return <a className="pen-notion-sent pen-bigpanel-export" href={done.url} target="_blank" rel="noreferrer">{T.sheetOpen(done.rows)}</a>
  async function run() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/pen/google-sheets/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ what }) })
      const j = (await r.json().catch(() => ({}))) as { url?: string; rows?: number; connect?: boolean; error?: string }
      if (r.status === 409 && j.connect) { window.location.href = '/pen/settings/google'; return }
      if (!r.ok || !j.url) throw new Error(j.error || T.saveFailed)
      setDone({ url: j.url, rows: j.rows ?? 0 })
    } catch (e) {
      setErr(errMessage(e, T.saveFailed))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="pen-set-chip pen-bigpanel-export" onClick={run} disabled={busy} aria-busy={busy}>
        <Icon name="doc" size={14} />{busy ? T.sheetExporting : T.sheetExport}
      </button>
      {err && <span className="pen-ref-err" role="alert">{err}</span>}
    </>
  )
}

const match = (q: string, ...xs: (string | null | undefined)[]) => {
  const n = q.trim().toLowerCase()
  return !n || xs.some((x) => x?.toLowerCase().includes(n))
}

function TodoPanel({ actions, others, count, onTick, onOpen, sheets = false }: { actions: OpenAction[]; others: OpenAction[]; count: number; onTick: (a: OpenAction) => void; onOpen: (id: string) => void; sheets?: boolean }) {
  const T = useCopy(OV)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const source = filter === 'others' ? others : actions
  const list = source.filter(
    (a) =>
      match(q, a.action, a.sessionTitle, a.owner, a.due, a.waiting ?? '') &&
      (filter === 'all' || filter === 'others' || (filter === 'priority' ? a.priority === 'high' : !!(a.dueDate || a.due))),
  )
  return (
    <>
      <Toolbar
        q={q}
        setQ={setQ}
        placeholder={T.todoFilter}
        action={sheets ? <ExportSheet what="todos" /> : undefined}
        filters={[
          { key: 'all', label: T.all(count) },
          { key: 'priority', label: T.priority },
          { key: 'due', label: T.hasDate },
          ...(others.length ? [{ key: 'others', label: T.everyoneElse(others.length) }] : []),
        ]}
        filter={filter}
        setFilter={setFilter}
        count={list.length}
      />
      <ul className="pen-bigpanel-list">
        <AnimatePresence initial={false}>
          {list.map((a) => <ActionRow key={`${a.sessionId}:${a.index}`} a={a} onTick={onTick} onOpen={onOpen} full />)}
        </AnimatePresence>
        {!list.length && <li className="pen-card-empty">{T.nothingMatches}</li>}
      </ul>
    </>
  )
}

function MissedPanel({ missed, count, onHandle, onPromote, onOpen }: {
  missed: OpenMissed[]
  count: number
  onHandle: (m: OpenMissed) => void
  onPromote: (m: OpenMissed) => void
  onOpen: (id: string) => void
}) {
  const T = useCopy(OV)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const weekAgo = Date.now() - 7 * 86_400_000
  const list = missed.filter((m) => match(q, m.item, m.why, m.sessionTitle) && (filter === 'all' || Date.parse(m.when) >= weekAgo))
  return (
    <>
      <Toolbar
        q={q}
        setQ={setQ}
        placeholder={T.missedFilter}
        filters={[{ key: 'all', label: T.all(count) }, { key: 'week', label: T.last7 }]}
        filter={filter}
        setFilter={setFilter}
        count={list.length}
      />
      <ul className="pen-bigpanel-list">
        <AnimatePresence initial={false}>
          {list.map((m) => <MissedRow key={`${m.sessionId}:${m.index}`} m={m} onHandle={onHandle} onPromote={onPromote} onOpen={onOpen} full />)}
        </AnimatePresence>
        {!list.length && <li className="pen-card-empty">{T.nothingMatches}</li>}
      </ul>
    </>
  )
}

function PeoplePanel({ people, clients, clientsByName, onAsk, actions, onOpenRecording, sheets = false }: {
  sheets?: boolean
  /** Opens a recording, for a name heard in it. */
  onOpenRecording?: (sessionId: string) => void
  people: PersonCard[]
  clients: ClientCard[]
  clientsByName: Map<string, ClientCard>
  onAsk: (p: PersonCard) => void
  actions: PersonActions
}) {
  const T = useCopy(OV)
  const lang = useLang()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('recent')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = people
    .filter((p) => match(q, p.name, p.email, p.role, p.company, p.summary))
    .sort((a, b) => (filter === 'calls' ? b.recordings - a.recordings : 0) || (filter === 'az' ? a.name.localeCompare(b.name) : 0))
  // Profiles learned for someone not yet in People. Kept visible rather than dropped.
  const names = new Set(people.map((p) => p.name.toLowerCase()))
  const orphans = clients.filter((c) => !names.has(c.name.toLowerCase()) && match(q, c.name))
  // Names said in recordings (lib/pen/names.ts), for people never saved: "Dimitri" finds the
  // calls where he came up even though he is nobody's contact.
  const [heard, setHeard] = useState<Heard[]>([])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHeard([]); return }
    const t = setTimeout(() => {
      getJson<{ heard: Heard[] }>(`/api/pen/names?q=${encodeURIComponent(term)}`).then((j) => setHeard(j.heard ?? [])).catch(() => setHeard([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  const heardShown = heard.filter((h) => !names.has(h.name.toLowerCase()))
  return (
    <>
      <Toolbar
        q={q}
        setQ={setQ}
        placeholder={T.peopleFilter}
        action={sheets ? <ExportSheet what="contacts" /> : undefined}
        filters={[{ key: 'recent', label: T.recent }, { key: 'calls', label: T.mostCalls }, { key: 'az', label: T.az }]}
        filter={filter}
        setFilter={setFilter}
        count={list.length}
      />
      <ul className="pen-bigpanel-list" hidden={!list.length && !orphans.length && heardShown.length > 0}>
        {list.map((p) => (
          <li key={p.id} className="pen-row2" data-full>
            <div className="pen-row2-inner">
              <span className="pen-avatar pen-row2-avatar">{initials(p.name)}</span>
              {actions.editing === p.id ? (
                <RenameInput value={p.name} label={T.nameLabel} error={actions.error} busy={actions.busy} onSave={(v) => void actions.rename(p, v)} onCancel={actions.cancel} />
              ) : (
                <button type="button" className="pen-row2-main" onClick={() => setOpenId(openId === p.id ? null : p.id)} aria-expanded={openId === p.id}>
                  <span className="pen-row2-text pen-row2-name">{p.name}</span>
                  <span className="pen-row2-meta">
                    <span>{[p.role, p.company, plural(p.recordings, T.calls)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              )}
              {p.lastAt && actions.editing !== p.id && <span className="pen-row2-when">{fmtAgo(p.lastAt, lang)}</span>}
              {actions.editing !== p.id && <PersonMenu p={p} actions={actions} />}
            </div>
            {actions.failedId === p.id && actions.editing !== p.id && actions.error && <p className="pen-chatrow-err" role="alert">{actions.error}</p>}
            <AnimatePresence initial={false}>
              {openId === p.id && (
                <motion.div {...rowMotion} className="pen-row2-expand">
                  <PersonDetail p={p} client={clientsByName.get(p.name.toLowerCase())} onAsk={onAsk} />
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
        {!list.length && !orphans.length && !heardShown.length && <li className="pen-card-empty">{T.nobodyMatches}</li>}
      </ul>
      {heardShown.length > 0 && (
        <div className="pen-bigpanel-orphans">
          <h4 className="pen-bigpanel-subhead">{T.heardIn}</h4>
          <ul className="pen-heard-list">
            {heardShown.map((h) => (
              <li key={h.name} className="pen-heard-item">
                <div className="pen-heard-across">
                  <span className="pen-heard-name">{h.name}</span>
                  <span className="pen-heard-count">{T.heardTimes(h.count)}</span>
                </div>
                <ul className="pen-heard-where">
                  {h.moments.map((m) => (
                    <li key={m.session_id}>
                      <button type="button" className="pen-heard-time" onClick={() => onOpenRecording?.(m.session_id)}>{m.title}</button>
                      <span className="pen-heard-mctx">{[fmtAgo(m.when, lang), m.context].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
      {orphans.length > 0 && (
        <div className="pen-bigpanel-orphans">
          <h4 className="pen-bigpanel-subhead">{T.orphans}</h4>
          {orphans.map((c) => (
            <div key={c.name} className="pen-orphan">
              <strong>{c.name}</strong>
              <ClientFacets c={c} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ================================================================= toast */

function Toast({ toast, onClose }: { toast: { text: string; undo?: () => void; tone?: 'bad' } | null; onClose: () => void }) {
  const T = useCopy(OV)
  return (
    <div className="pen-toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.text}
            className="pen-toast"
            data-tone={toast.tone}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <span>{toast.text}</span>
            {toast.undo && <button type="button" onClick={toast.undo}>{T.undo}</button>}
            <button type="button" className="pen-toast-x" onClick={onClose} aria-label={T.dismiss}>
              <svg viewBox="0 0 20 20" aria-hidden><path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ================================================================ helpers */

function initials(s: string) {
  // Letters only: 'Chris "CD" Dyas' or 'Titi (cofounder)' must not show a quote or a bracket.
  const parts = s.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}
