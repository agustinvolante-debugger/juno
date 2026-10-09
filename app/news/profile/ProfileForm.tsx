'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { READ_CHOICES, WATCH_CHOICES, MARKET_BUNDLES, TOPIC_GROUPS, VIDEO_SUGGESTIONS, type Choice } from '@/lib/news/profile-options'
import { CheckIcon, CloseIcon, SearchIcon, BellIcon } from '../Icons'

type Initial = {
  lang: 'en' | 'es'; about: string; sections: string[]; bundles: string[]; digest: boolean
  items: { q: string; topic: boolean; alert: boolean }[]; videos: { key: string; label: string }[]; stocks: { symbol: string; label: string }[]
}
// A topic on the reader's list. topic/alertWas = what exists now; new ones get built on save.
type Item = { q: string; topic: boolean; alert: boolean; alertWas: boolean; isNew: boolean }
type Hit = { symbol: string; name: string; exchange: string }
type Job = { label: string; state: 'wait' | 'run' | 'ok' | 'fail' }

const T = {
  en: {
    firstT: 'Let’s set up your Daily Brief', firstS: 'A minute now, and the page is yours every morning. You can change all of this later.',
    editT: 'Your profile', editS: 'What you tell us here shapes your page and your briefing.',
    back: '← Back to the brief', lang: 'Language', langS: 'For the page, the briefing and the headlines.',
    about: 'About you', aboutS: 'A sentence or two. The briefing picks and explains stories with this in mind.',
    aboutP: 'e.g. Retired engineer in Santiago. I follow US stocks, bonds and Chilean politics.',
    read: 'What do you want to read about?', readS: 'A team, a company, a country, a person, a subject. Each one becomes a section of your page.',
    topicP: 'Type a topic…', add: 'Add',
    bellOn: 'Following closely: we mark what’s new and keep it in Monitors', bellOff: 'Follow closely',
    bellHint: 'The bell follows a story closely: what’s new is marked, and it also goes to Monitors.',
    watch: 'What do you like to watch?', watchS: 'Describe it and we find good YouTube channels for a video shelf.',
    watchP: 'e.g. cooking, Chilean football, history', juno: 'Juno’s sections', junoS: 'Ready-made sections from hand-picked sources. Optional.', markets: 'Your markets', marketsS: 'Tap what you want on your panel.',
    stocks: 'Stocks', stockP: 'Search a company: Microsoft, Tesla…', email: 'Morning email',
    emailS: 'Your briefing and top stories in your inbox each morning.',
    save: 'Save', saveFirst: 'Save and see my brief', saving: 'Saving…', saved: 'Saved', skip: 'Skip for now',
    building: 'Setting up your page', buildingS: 'Building the sections you asked for. This takes a few seconds each.',
    remove: 'Remove', none: 'Nothing yet. Pick some ideas below or type your own.', limit: 'Up to 6 topics can be followed closely.',
  },
  es: {
    firstT: 'Armemos tu Daily Brief', firstS: 'Un minuto ahora, y la página es tuya cada mañana. Puedes cambiar todo esto después.',
    editT: 'Tu perfil', editS: 'Lo que nos cuentas aquí da forma a tu página y a tu resumen.',
    back: '← Volver al brief', lang: 'Idioma', langS: 'Para la página, el resumen y los titulares.',
    about: 'Sobre ti', aboutS: 'Una o dos frases. El resumen elige y explica las noticias pensando en esto.',
    aboutP: 'p. ej. Ingeniero jubilado en Santiago. Sigo la bolsa y los bonos de EE. UU. y la política chilena.',
    read: '¿Sobre qué quieres leer?', readS: 'Un equipo, una empresa, un país, una persona, un tema. Cada uno será una sección de tu página.',
    topicP: 'Escribe un tema…', add: 'Agregar',
    bellOn: 'Siguiendo de cerca: marcamos lo nuevo y lo dejamos en Monitores', bellOff: 'Seguir de cerca',
    bellHint: 'La campana sigue una historia de cerca: marca lo nuevo y también la deja en Monitores.',
    watch: '¿Qué te gusta ver?', watchS: 'Descríbelo y buscamos buenos canales de YouTube para armarte una sección de videos.',
    watchP: 'p. ej. cocina, fútbol chileno, historia', juno: 'Secciones de Juno', junoS: 'Secciones listas con fuentes elegidas a mano. Opcional.', markets: 'Tus mercados', marketsS: 'Toca lo que quieres en tu panel.',
    stocks: 'Acciones', stockP: 'Busca una empresa: Microsoft, Tesla…', email: 'Email de la mañana',
    emailS: 'Tu resumen y las noticias principales en tu correo cada mañana.',
    save: 'Guardar', saveFirst: 'Guardar y ver mi brief', saving: 'Guardando…', saved: 'Guardado', skip: 'Saltar por ahora',
    building: 'Armando tu página', buildingS: 'Creando las secciones que pediste. Toma unos segundos cada una.',
    remove: 'Quitar', none: 'Nada todavía. Elige ideas abajo o escribe las tuyas.', limit: 'Puedes seguir de cerca hasta 6 temas.',
  },
}

const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function ProfileForm({ first, initial }: { first: boolean; initial: Initial }) {
  const [lang, setLang] = useState(initial.lang)
  const t = T[lang]
  const es = lang === 'es'
  const [about, setAbout] = useState(initial.about)
  const [sections, setSections] = useState<string[]>(initial.sections)
  const [bundles, setBundles] = useState<string[]>(initial.bundles)
  const [digest, setDigest] = useState(initial.digest)
  const [items, setItems] = useState<Item[]>(initial.items.map((x) => ({ ...x, alertWas: x.alert, isNew: false })))
  const [videos, setVideos] = useState(initial.videos)
  const [newVideos, setNewVideos] = useState<string[]>([])
  const [videoIn, setVideoIn] = useState('')
  const [stocks, setStocks] = useState(initial.stocks)
  const [topicIn, setTopicIn] = useState('')
  const [junoOpen, setJunoOpen] = useState(initial.sections.length > 0)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [status, setStatus] = useState<'' | 'saving' | 'saved'>('')

  // The page language follows the choice right away.
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const toggle = (list: string[], set: (v: string[]) => void, k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k])
  const has = (q: string) => items.some((x) => x.q.toLowerCase() === q.trim().toLowerCase())
  const addItem = (v: string) => {
    const q = v.trim().slice(0, 120)
    if (!q || has(q) || items.length >= 30) return
    setItems((cur) => [...cur, { q, topic: false, alert: false, alertWas: false, isNew: true }])
  }
  const alerts = items.filter((x) => x.alert).length
  const addVideo = (v: string) => {
    const d = v.trim().slice(0, 120)
    if (!d || newVideos.some((x) => x.toLowerCase() === d.toLowerCase())) return
    setNewVideos((cur) => [...cur, d])
  }

  async function save() {
    setStatus('saving')
    const hasOwn = items.length > 0 || videos.length > 0 || newVideos.length > 0
    const r = await post('/api/news/profile-setup', { lang, about, sections, bundles, digest, first, hasOwn })
    if (!r.ok) { setStatus(''); return }
    // Build what's new, remove what's gone, one at a time so progress is visible.
    const enc = encodeURIComponent
    const work: { label: string; run: () => Promise<Response> }[] = []
    for (const it of items) {
      // Every topic is a section; the bell adds (or removes) the monitor that follows it closely.
      if (!it.topic) work.push({ label: it.q, run: () => post('/api/news/topic', { query: it.q }) })
      if (it.alert && !it.alertWas) work.push({ label: it.topic ? '' : '', run: () => post('/api/news/monitor', { query: it.q }) })
      if (!it.alert && it.alertWas) work.push({ label: '', run: () => fetch('/api/news/monitor?query=' + enc(it.q), { method: 'DELETE' }) })
    }
    for (const was of initial.items) {
      if (items.some((x) => x.q === was.q)) continue
      if (was.topic) work.push({ label: '', run: () => fetch('/api/news/topic?query=' + enc(was.q), { method: 'DELETE' }) })
      if (was.alert) work.push({ label: '', run: () => fetch('/api/news/monitor?query=' + enc(was.q), { method: 'DELETE' }) })
    }
    for (const d of newVideos) work.push({ label: (es ? 'Videos: ' : 'Videos: ') + d, run: () => post('/api/news/video-section', { desc: d }) })
    for (const v of initial.videos) {
      if (!videos.some((x) => x.key === v.key)) work.push({ label: '', run: () => fetch('/api/news/video-section?key=' + enc(v.key), { method: 'DELETE' }) })
    }
    const visible = work.filter((w) => w.label)
    if (visible.length) setJobs(visible.map((w) => ({ label: w.label, state: 'wait' })))
    for (const w of work) {
      const k = visible.indexOf(w)
      if (k >= 0) setJobs((js) => js && js.map((j, i) => (i === k ? { ...j, state: 'run' } : j)))
      let ok = false
      try { ok = (await w.run()).ok } catch { /* keep going */ }
      if (k >= 0) setJobs((js) => js && js.map((j, i) => (i === k ? { ...j, state: ok ? 'ok' : 'fail' } : j)))
    }
    if (first || visible.length) { window.location.href = '/news'; return }
    setStatus('saved')
    setTimeout(() => setStatus(''), 2200)
  }

  if (jobs) {
    const doneN = jobs.filter((j) => j.state === 'ok' || j.state === 'fail').length
    return (
      <main className="db-app db-prof" data-tab="profile">
        <div className="db-prof-build" role="status" aria-live="polite">
          <h1 className="db-prof-t">{t.building}</h1>
          <p className="db-prof-s">{t.buildingS}</p>
          <div className="db-prof-bar" aria-hidden><span style={{ width: `${Math.round((doneN / jobs.length) * 100)}%` }} /></div>
          <ul className="db-prof-jobs">
            {jobs.map((j) => (
              <li key={j.label} data-state={j.state}>
                <span className="db-prof-jobi" aria-hidden>{j.state === 'ok' ? <CheckIcon size={13} /> : j.state === 'fail' ? <CloseIcon size={13} /> : null}</span>
                <span>{j.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    )
  }

  return (
    <main className="db-app db-prof" data-tab="profile">
      <header className="db-prof-head">
        <a className="db-mark" href="/news" aria-label="The Daily Brief"><span className="db-mark-the">The</span> Daily Brief</a>
        {!first && <a className="db-prof-back" href="/news">{t.back}</a>}
      </header>

      <div className="db-prof-wrap">
        <h1 className="db-prof-t">{first ? t.firstT : t.editT}</h1>
        <p className="db-prof-s">{first ? t.firstS : t.editS}</p>

        <Block title={t.lang} sub={t.langS}>
          <div className="db-prof-seg" role="radiogroup" aria-label={t.lang}>
            {(['es', 'en'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}>{l === 'es' ? 'Español' : 'English'}</button>
            ))}
          </div>
        </Block>

        <Block title={t.about} sub={t.aboutS}>
          <textarea className="db-prof-area" rows={3} maxLength={500} value={about} placeholder={t.aboutP} onChange={(e) => setAbout(e.target.value)} aria-label={t.about} />
        </Block>

        <Block title={t.read} sub={t.readS}>
          {items.length ? (
            <ul className="db-prof-items">
              {items.map((it) => (
                <li key={it.q} className={`db-prof-item${it.alert ? ' is-alert' : ''}`}>
                  <span className="db-prof-item-q">{it.q}</span>
                  <button type="button" className="db-prof-bell" aria-pressed={it.alert} disabled={!it.alert && alerts >= 6}
                    title={it.alert ? t.bellOn : t.bellOff} aria-label={`${it.alert ? t.bellOn : t.bellOff}: ${it.q}`}
                    onClick={() => setItems((cur) => cur.map((x) => (x.q === it.q ? { ...x, alert: !x.alert } : x)))}>
                    <BellIcon size={15} /><span>{it.alert ? (es ? 'De cerca' : 'Closely') : (es ? 'Seguir de cerca' : 'Follow closely')}</span>
                  </button>
                  <button type="button" className="db-iconbtn" aria-label={`${t.remove}: ${it.q}`} onClick={() => setItems((cur) => cur.filter((x) => x.q !== it.q))}><CloseIcon size={13} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="db-prof-note">{t.none}</p>}
          <AddRow value={topicIn} setValue={setTopicIn} placeholder={t.topicP} label={t.add} onAdd={() => { addItem(topicIn); setTopicIn('') }} />
          <p className="db-prof-hint"><BellIcon size={13} /> {alerts >= 6 ? t.limit : t.bellHint}</p>
          <div className="db-prof-groups">
            {TOPIC_GROUPS.map((g) => {
              const left = g.items.map((x) => (es ? x.es : x.en)).filter((x) => !has(x))
              if (!left.length) return null
              return (
                <div key={g.en} className="db-prof-group">
                  <span className="db-prof-glabel">{es ? g.es : g.en}</span>
                  <div className="db-prof-ideas">{left.map((x) => <button key={x} type="button" onClick={() => addItem(x)}>+ {x}</button>)}</div>
                </div>
              )
            })}
          </div>
        </Block>

        <Block title={t.watch} sub={t.watchS}>
          <Chips items={[...videos.map((v) => v.label), ...newVideos]} removeLabel={t.remove} none=""
            onRemove={(label) => { setVideos(videos.filter((v) => v.label !== label)); setNewVideos(newVideos.filter((d) => d !== label)) }} />
          <AddRow value={videoIn} setValue={setVideoIn} placeholder={t.watchP} label={t.add} onAdd={() => { addVideo(videoIn); setVideoIn('') }} />
          <div className="db-prof-ideas">
            {VIDEO_SUGGESTIONS[lang].filter((x) => !newVideos.includes(x) && !videos.some((v) => v.label === x)).map((x) => <button key={x} type="button" onClick={() => addVideo(x)}>+ {x}</button>)}
          </div>
        </Block>

        <Block title={t.markets} sub={t.marketsS}>
          <div className="db-prof-bundles">
            {MARKET_BUNDLES.map((b) => {
              const on = bundles.includes(b.key)
              return (
                <button key={b.key} type="button" className="db-prof-bundle" aria-pressed={on} onClick={() => toggle(bundles, setBundles, b.key)}>
                  {on && <CheckIcon size={13} />}<span>{es ? b.es : b.en}</span>
                </button>
              )
            })}
          </div>
          <div className="db-prof-sub">{t.stocks}</div>
          <Chips items={stocks.map((s) => `${s.label} · ${s.symbol}`)} removeLabel={t.remove} none=""
            onRemove={async (label) => {
              const s = stocks.find((x) => `${x.label} · ${x.symbol}` === label)
              if (!s) return
              setStocks(stocks.filter((x) => x.symbol !== s.symbol))
              await fetch('/api/news/tickers?symbol=' + encodeURIComponent(s.symbol), { method: 'DELETE' })
            }} />
          <StockSearch placeholder={t.stockP} addLabel={t.add} onAdded={(s) => setStocks((cur) => (cur.some((x) => x.symbol === s.symbol) ? cur : [...cur, s]))} />
        </Block>

        <section className="db-prof-block">
          <button type="button" className="db-prof-fold" aria-expanded={junoOpen} onClick={() => setJunoOpen(!junoOpen)}>
            <span className="db-prof-h">{t.juno}</span>
            <span className="db-prof-fold-n">{sections.length ? `${sections.length} ${es ? 'activas' : 'on'}` : (es ? 'ninguna' : 'none')}</span>
            <span className="db-prof-fold-c" aria-hidden>{junoOpen ? '−' : '+'}</span>
          </button>
          <p className="db-prof-hs">{t.junoS}</p>
          {junoOpen && (
            <>
              <Choices items={READ_CHOICES} on={sections} es={es} onToggle={(k) => toggle(sections, setSections, k)} />
              <div className="db-prof-sub">{es ? 'Videos' : 'Videos'}</div>
              <Choices items={WATCH_CHOICES} on={sections} es={es} onToggle={(k) => toggle(sections, setSections, k)} />
            </>
          )}
        </section>

        <Block title={t.email} sub={t.emailS}>
          <button type="button" role="switch" aria-checked={digest} className="db-prof-switch" onClick={() => setDigest(!digest)}>
            <span className="db-switch" data-on={digest ? '1' : '0'} aria-hidden />
            <span>{digest ? (es ? 'Activado' : 'On') : (es ? 'Desactivado' : 'Off')}</span>
          </button>
        </Block>
      </div>

      <div className="db-prof-foot">
        <div className="db-prof-foot-in">
          <span className="db-prof-state" aria-live="polite">{status === 'saved' ? t.saved : ''}</span>
          {/* Never trap anyone on the first visit: skipping keeps every standard section and the
              profile stays one tap away in the avatar menu. Marked done so /news stops sending them here. */}
          {first && (
            <button type="button" className="db-prof-skip" disabled={status === 'saving'}
              onClick={async () => {
                setStatus('saving')
                await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, layout: { profile: { done: true, first: true, skipped: true, at: new Date().toISOString() } } }) }).catch(() => {})
                window.location.href = '/news'
              }}>
              {t.skip}
            </button>
          )}
          <button type="button" className="db-btn is-ink db-prof-save" onClick={save} disabled={status === 'saving'}>
            {status === 'saving' ? t.saving : first ? t.saveFirst : t.save}
          </button>
        </div>
      </div>
    </main>
  )
}

function Block({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="db-prof-block">
      <h2 className="db-prof-h">{title}</h2>
      <p className="db-prof-hs">{sub}</p>
      {children}
    </section>
  )
}

function Choices({ items, on, es, onToggle }: { items: Choice[]; on: string[]; es: boolean; onToggle: (k: string) => void }) {
  return (
    <div className="db-prof-choices">
      {items.map((c) => {
        const checked = on.includes(c.key)
        return (
          <button key={c.key} type="button" role="checkbox" aria-checked={checked} className="db-prof-choice" onClick={() => onToggle(c.key)}>
            <span className="db-mm-box" aria-hidden>{checked && <CheckIcon size={12} />}</span>
            <span className="db-prof-cl">{es ? c.es : c.en}</span>
            <span className="db-prof-cd">{es ? c.esD : c.enD}</span>
          </button>
        )
      })}
    </div>
  )
}

function Chips({ items, onRemove, removeLabel, none }: { items: string[]; onRemove: (x: string) => void; removeLabel: string; none: string }) {
  if (!items.length) return none ? <p className="db-prof-note">{none}</p> : null
  return (
    <ul className="db-prof-chips">
      {items.map((x) => (
        <li key={x} className="db-prof-chip">
          <span>{x}</span>
          <button type="button" className="db-iconbtn" aria-label={`${removeLabel}: ${x}`} onClick={() => onRemove(x)}><CloseIcon size={12} /></button>
        </li>
      ))}
    </ul>
  )
}

function AddRow({ value, setValue, placeholder, label, onAdd }: { value: string; setValue: (v: string) => void; placeholder: string; label: string; onAdd: () => void }) {
  return (
    <div className="db-prof-add">
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }} />
      <button type="button" className="db-btn" onClick={onAdd} disabled={!value.trim()}>{label}</button>
    </div>
  )
}

// Company search, same service as the markets picker; adding pins the stock to the panel at once.
function StockSearch({ placeholder, addLabel, onAdded }: { placeholder: string; addLabel: string; onAdded: (s: { symbol: string; label: string }) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [hi, setHi] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const term = q.trim()
    if (!term) { setHits([]); return }
    let live = true
    const tm = setTimeout(async () => {
      try { const j = await (await fetch('/api/news/symbols?q=' + encodeURIComponent(term))).json(); if (live) { setHits(j.results || []); setHi(0) } } catch { /* ignore */ }
    }, 220)
    return () => { live = false; clearTimeout(tm) }
  }, [q])
  const shortName = useMemo(() => (n: string) => n.replace(/,?\s+(Corporation|Corp\.?|Incorporated|Inc\.?|Ltd\.?|Limited|PLC|Holdings?|Co\.?|Company|Group)\b\.?/g, '').trim(), [])
  async function add(h?: Hit) {
    const pick = h || hits[hi]
    if (!pick) return
    setBusy(true)
    try {
      const r = await post('/api/news/tickers', { symbol: pick.symbol, name: pick.name })
      if (r.ok) { onAdded({ symbol: pick.symbol, label: shortName(pick.name) || pick.symbol }); setQ(''); setHits([]) }
    } finally { setBusy(false) }
  }
  return (
    <div className="db-prof-stock">
      <div className="db-prof-add">
        <label className="db-prof-search">
          <SearchIcon size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} role="combobox"
            aria-expanded={hits.length > 0} aria-autocomplete="list" autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((k) => Math.min(k + 1, hits.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((k) => Math.max(k - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); void add() }
            }} />
        </label>
        <button type="button" className="db-btn" onClick={() => add()} disabled={busy || !hits.length}>{addLabel}</button>
      </div>
      {hits.length > 0 && (
        <ul className="db-prof-hits" role="listbox">
          {hits.map((h, k) => (
            <li key={h.symbol} role="option" aria-selected={k === hi}>
              <button type="button" className="db-mm-hit" onMouseEnter={() => setHi(k)} onClick={() => add(h)} disabled={busy}>
                <span className="db-mm-hit-s">{h.symbol}</span><span className="db-mm-hit-n">{h.name}</span><span className="db-mm-hit-x">{h.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
