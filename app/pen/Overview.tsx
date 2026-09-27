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
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, useIsPresent, animate } from 'motion/react'
import type { ArchiveStats, OpenAction, OpenMissed, ClientCard } from '@/lib/pen/stats'
import type { PersonCard } from '@/lib/pen/people'
import { postJson, errMessage } from '@/lib/pen/http'
import Icon, { type IconName } from './Icon'
import { useCopy, useLang } from './LangContext'
import { shortDate as fmtShort, ago as fmtAgo, plural, type Copy } from '@/lib/pen/i18n'

type Kind = 'todo' | 'missed' | 'people'

const MORPH = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 0.8 }
const EASE_OUT = [0.16, 1, 0.3, 1] as const
/** Items a card shows before "See all". */
const PREVIEW = 3

/* ================================================================== copy */

const OV_EN = {
  saveFailed: 'That did not save. Try again.',
  markedDone: 'Marked done',
  markedHandled: 'Marked handled',
  addedTodo: 'Added to Still to do',
  heading: (n: number) => `${n} recording${n === 1 ? '' : 's'}, and what came out of them`,
  recorded: (t: string) => `${t} recorded`,
  latest: (d: string) => ` · latest ${d}`,
  todo: 'Still to do',
  todoEmpty: 'Nothing outstanding. Actions from each recording land here.',
  missed: 'Nearly missed',
  missedSub: 'said once, easy to lose',
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
  recent: 'Recent',
  mostCalls: 'Most calls',
  az: 'A to Z',
  nobodyMatches: 'Nobody matches.',
  orphans: 'Learned from recordings, not in People yet',
  undo: 'Undo',
  dismiss: 'Dismiss',
  emptyTitle: 'Nothing recorded yet',
  emptyBody: 'Plug the pen in and import one recording. From the second one on, Juno Pen starts joining them up: what the same people keep asking for, what you keep forgetting, what is still outstanding across everything.',
}

const OV: Copy<typeof OV_EN> = {
  en: OV_EN,
  es: {
    saveFailed: 'No se guardó. Inténtalo otra vez.',
    markedDone: 'Marcada como hecha',
    markedHandled: 'Marcado como resuelto',
    addedTodo: 'Agregado a Pendientes',
    heading: (n) => (n === 1 ? '1 grabación, y lo que salió de ella' : `${n} grabaciones, y lo que salió de ellas`),
    recorded: (t) => `${t} grabadas`,
    latest: (d) => ` · la última el ${d}`,
    todo: 'Pendientes',
    todoEmpty: 'No hay nada pendiente. Las tareas de cada grabación aparecen aquí.',
    missed: 'Casi se te pasa',
    missedSub: 'se dijo una vez, fácil de perder',
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
    recent: 'Recientes',
    mostCalls: 'Más reuniones',
    az: 'A a Z',
    nobodyMatches: 'Nadie coincide.',
    orphans: 'Aprendido de las grabaciones, todavía no está en Personas',
    undo: 'Deshacer',
    dismiss: 'Cerrar',
    emptyTitle: 'Todavía no hay grabaciones',
    emptyBody: 'Conecta el lápiz e importa una grabación. Desde la segunda, Juno Pen empieza a conectarlas: lo que las mismas personas siguen pidiendo, lo que se te sigue olvidando, lo que sigue pendiente en todo.',
  },
  pt: {
    saveFailed: 'Não foi salvo. Tente de novo.',
    markedDone: 'Marcada como feita',
    markedHandled: 'Marcado como resolvido',
    addedTodo: 'Adicionado a Pendências',
    heading: (n) => (n === 1 ? '1 gravação, e o que saiu dela' : `${n} gravações, e o que saiu delas`),
    recorded: (t) => `${t} gravadas`,
    latest: (d) => ` · a última em ${d}`,
    todo: 'Pendências',
    todoEmpty: 'Nada pendente. As tarefas de cada gravação aparecem aqui.',
    missed: 'Quase passou batido',
    missedSub: 'dito uma vez, fácil de perder',
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
    recent: 'Recentes',
    mostCalls: 'Mais reuniões',
    az: 'A a Z',
    nobodyMatches: 'Ninguém encontrado.',
    orphans: 'Aprendido nas gravações, ainda não está em Pessoas',
    undo: 'Desfazer',
    dismiss: 'Fechar',
    emptyTitle: 'Nada gravado ainda',
    emptyBody: 'Conecte a caneta e importe uma gravação. A partir da segunda, o Juno Pen começa a ligar os pontos: o que as mesmas pessoas continuam pedindo, o que você continua esquecendo, o que ainda está pendente em tudo.',
  },
}

export default function Overview({
  stats,
  people,
  onOpen,
  onAskPerson,
  onChanged,
}: {
  stats: ArchiveStats
  people: PersonCard[]
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

  if (!stats.recordings) return <EmptyArchive />

  const hours = stats.minutes / 60
  const openCount = actions.length + Math.max(0, stats.actionsOpen - stats.openActions.length)
  const doneCount = Math.max(0, stats.actionsTotal - stats.actionsOpen + doneExtra)
  const missedCount = missed.length + Math.max(0, (stats.missedOpen ?? 0) - (stats.openMissed?.length ?? 0))

  return (
    <div className="pen-home">
      <header className="pen-home-head">
        <h2 className="pen-display pen-home-title">
          {T.heading(stats.recordings)}
        </h2>
        <p className="pen-home-meta">
          {T.recorded(hours >= 1 ? `${hours.toFixed(1)} h` : `${stats.minutes} min`)}
          {stats.lastAt && T.latest(fmtShort(stats.lastAt, lang))}
        </p>
      </header>

      <LayoutGroup>
        <div className="pen-home-cards">
          <HomeCard
            kind="todo"
            open={open}
            onOpen={setOpen}
            icon="checklist"
            title={T.todo}
            count={openCount}
            sub={
              <FollowThrough done={doneCount} total={doneCount + openCount} />
            }
            empty={T.todoEmpty}
            seeAll={openCount}
          >
            <AnimatePresence initial={false}>
              {actions.slice(0, PREVIEW).map((a) => (
                <ActionRow key={`${a.sessionId}:${a.index}`} a={a} onTick={tick} onOpen={onOpen} />
              ))}
            </AnimatePresence>
          </HomeCard>

          <HomeCard
            kind="missed"
            open={open}
            onOpen={setOpen}
            icon="alert"
            title={T.missed}
            count={missedCount}
            sub={<span>{T.missedSub}</span>}
            empty={T.missedEmpty}
            seeAll={missedCount}
          >
            <AnimatePresence initial={false}>
              {missed.slice(0, PREVIEW).map((m) => (
                <MissedRow key={`${m.sessionId}:${m.index}`} m={m} onHandle={handle} onPromote={promote} onOpen={onOpen} />
              ))}
            </AnimatePresence>
          </HomeCard>

          <HomeCard
            kind="people"
            open={open}
            onOpen={setOpen}
            icon="people"
            title={T.people}
            count={people.length}
            sub={<span>{people.length ? T.lastSpoke(people[0].name.split(' ')[0]) : T.nobody}</span>}
            empty={T.peopleEmpty}
            seeAll={people.length}
          >
            {people.slice(0, PREVIEW).map((p) => (
              <PersonRow key={p.id} p={p} client={clientsByName.get(p.name.toLowerCase())} onAsk={onAskPerson} />
            ))}
          </HomeCard>
        </div>

        <Panel open={open} onClose={() => setOpen(null)}>
          {open === 'todo' && (
            <TodoPanel actions={actions} count={openCount} onTick={tick} onOpen={(id) => { setOpen(null); onOpen(id) }} />
          )}
          {open === 'missed' && (
            <MissedPanel missed={missed} count={missedCount} onHandle={handle} onPromote={promote} onOpen={(id) => { setOpen(null); onOpen(id) }} />
          )}
          {open === 'people' && (
            <PeoplePanel people={people} clients={stats.clients} clientsByName={clientsByName} onAsk={(p) => { setOpen(null); onAskPerson(p) }} />
          )}
        </Panel>
      </LayoutGroup>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

/* ================================================================== card */

const TITLES: Record<Kind, { title: 'todo' | 'missed' | 'people'; icon: IconName }> = {
  todo: { title: 'todo', icon: 'checklist' },
  missed: { title: 'missed', icon: 'alert' },
  people: { title: 'people', icon: 'people' },
}

function HomeCard({
  kind,
  open,
  onOpen,
  icon,
  title,
  count,
  sub,
  empty,
  seeAll,
  children,
}: {
  kind: Kind
  open: Kind | null
  onOpen: (k: Kind) => void
  icon: IconName
  title: string
  count: number
  sub: React.ReactNode
  empty: string
  seeAll: number
  children: React.ReactNode
}) {
  const T = useCopy(OV)
  const reduce = useReducedMotion()
  const isOpen = open === kind
  const hasItems = count > 0
  return (
    // The grid slot stays put while its card is out as the panel, so the row does not reflow.
    <div className="pen-card-slot">
      {!isOpen && (
        <motion.section
          layoutId={reduce ? undefined : `home-${kind}`}
          transition={MORPH}
          className="pen-card"
          data-kind={kind}
          aria-labelledby={`home-${kind}-title`}
        >
          <header className="pen-card-head">
            <div className="pen-card-title-row">
              <span className="pen-card-icon" data-kind={kind}><Icon name={icon} size={19} /></span>
              <h3 id={`home-${kind}-title`} className="pen-card-title">{title}</h3>
            </div>
            {/* The figure gets its own line: read first, from across the desk. */}
            <Count value={count} className="pen-card-count" />
            <div className="pen-card-sub">{sub}</div>
          </header>

          {hasItems ? <ul className="pen-card-list">{children}</ul> : <p className="pen-card-empty">{empty}</p>}

          {seeAll > PREVIEW && (
            <button type="button" className="pen-card-more" onClick={() => onOpen(kind)} aria-haspopup="dialog">
              {T.seeAll(seeAll)}
              <Icon name="chevron" size={15} />
            </button>
          )}
          {hasItems && seeAll <= PREVIEW && (
            <button type="button" className="pen-card-more" data-quiet onClick={() => onOpen(kind)} aria-haspopup="dialog">
              {T.open}
              <Icon name="chevron" size={15} />
            </button>
          )}
        </motion.section>
      )}
    </div>
  )
}

/** A figure that counts to its new value instead of jumping. */
function Count({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || prev.current === value) {
      el.textContent = String(value)
      prev.current = value
      return
    }
    const c = animate(prev.current, value, {
      duration: 0.35,
      ease: EASE_OUT,
      onUpdate: (v) => (el.textContent = String(Math.round(v))),
    })
    prev.current = value
    return () => c.stop()
  }, [value, reduce])
  return <span ref={ref} className={className}>{value}</span>
}

function FollowThrough({ done, total }: { done: number; total: number }) {
  const T = useCopy(OV)
  const pct = total ? Math.min(100, (done / total) * 100) : 0
  return (
    <span className="pen-follow">
      <span className="pen-follow-bar" role="img" aria-label={T.ofDone(done, total)}>
        <motion.span initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: EASE_OUT }} />
      </span>
      <span className="pen-follow-n">{T.ofDone(done, total)}</span>
    </span>
  )
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

function ActionRow({ a, onTick, onOpen, full = false }: { a: OpenAction; onTick: (a: OpenAction) => void; onOpen: (id: string) => void; full?: boolean }) {
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
        <button type="button" className="pen-row2-main" onClick={() => onOpen(a.sessionId)}>
          <span className="pen-row2-text" data-done={ticking}>{a.action}</span>
          <span className="pen-row2-meta">
            {a.priority === 'high' && <span className="pen-row2-flag">{T.priority}</span>}
            {a.due && <span className="pen-row2-due">{a.due}</span>}
            <span>{a.sessionTitle}</span>
          </span>
        </button>
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

function PersonRow({ p, client, onAsk }: { p: PersonCard; client?: ClientCard; onAsk: (p: PersonCard) => void }) {
  const T = useCopy(OV)
  const lang = useLang()
  const peek = usePeek()
  return (
    <li className="pen-row2" {...peek.bind}>
      <div className="pen-row2-inner">
        <span className="pen-avatar pen-row2-avatar">{initials(p.name)}</span>
        <button type="button" className="pen-row2-main" onClick={() => onAsk(p)} title={T.askAbout(p.name)}>
          <span className="pen-row2-text pen-row2-name">{p.name}</span>
          <span className="pen-row2-meta">
            <span>{[plural(p.recordings, T.calls), p.lastAt && fmtAgo(p.lastAt, lang)].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      </div>
      <Peek on={peek.on}>
        <PersonDetail p={p} client={client} onAsk={onAsk} />
      </Peek>
    </li>
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

function Toolbar({ q, setQ, placeholder, filters, filter, setFilter, count }: {
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
    </div>
  )
}

const match = (q: string, ...xs: (string | null | undefined)[]) => {
  const n = q.trim().toLowerCase()
  return !n || xs.some((x) => x?.toLowerCase().includes(n))
}

function TodoPanel({ actions, count, onTick, onOpen }: { actions: OpenAction[]; count: number; onTick: (a: OpenAction) => void; onOpen: (id: string) => void }) {
  const T = useCopy(OV)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const list = actions.filter(
    (a) => match(q, a.action, a.sessionTitle, a.owner, a.due) && (filter === 'all' || (filter === 'priority' ? a.priority === 'high' : !!a.due)),
  )
  return (
    <>
      <Toolbar
        q={q}
        setQ={setQ}
        placeholder={T.todoFilter}
        filters={[{ key: 'all', label: T.all(count) }, { key: 'priority', label: T.priority }, { key: 'due', label: T.hasDate }]}
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

function PeoplePanel({ people, clients, clientsByName, onAsk }: {
  people: PersonCard[]
  clients: ClientCard[]
  clientsByName: Map<string, ClientCard>
  onAsk: (p: PersonCard) => void
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
  return (
    <>
      <Toolbar
        q={q}
        setQ={setQ}
        placeholder={T.peopleFilter}
        filters={[{ key: 'recent', label: T.recent }, { key: 'calls', label: T.mostCalls }, { key: 'az', label: T.az }]}
        filter={filter}
        setFilter={setFilter}
        count={list.length}
      />
      <ul className="pen-bigpanel-list">
        {list.map((p) => (
          <li key={p.id} className="pen-row2" data-full>
            <div className="pen-row2-inner">
              <span className="pen-avatar pen-row2-avatar">{initials(p.name)}</span>
              <button type="button" className="pen-row2-main" onClick={() => setOpenId(openId === p.id ? null : p.id)} aria-expanded={openId === p.id}>
                <span className="pen-row2-text pen-row2-name">{p.name}</span>
                <span className="pen-row2-meta">
                  <span>{[p.role, p.company, plural(p.recordings, T.calls)].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
              {p.lastAt && <span className="pen-row2-when">{fmtAgo(p.lastAt, lang)}</span>}
            </div>
            <AnimatePresence initial={false}>
              {openId === p.id && (
                <motion.div {...rowMotion} className="pen-row2-expand">
                  <PersonDetail p={p} client={clientsByName.get(p.name.toLowerCase())} onAsk={onAsk} />
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
        {!list.length && !orphans.length && <li className="pen-card-empty">{T.nobodyMatches}</li>}
      </ul>
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
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

function EmptyArchive() {
  const T = useCopy(OV)
  return (
    <div className="pen-panel px-8 py-14 text-center">
      <h2 className="pen-display text-[26px]">{T.emptyTitle}</h2>
      <p className="mx-auto mt-3 max-w-[46ch] text-[16.5px] leading-relaxed" style={{ color: 'var(--soft)' }}>
        {T.emptyBody}
      </p>
    </div>
  )
}
