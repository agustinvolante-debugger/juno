'use client'

// The Google Picker for "Let Juno edit a file" (page.tsx). Nothing from Google loads until the
// user taps "Choose files": then a drive.file-only token comes from /api/pen/drive/token, Google's
// api.js loads the Picker, and the files they choose are granted to Juno by Google itself.
// /api/pen/drive/picked only checks they open and returns names for the success screen.

import { useCallback, useRef, useState } from 'react'
import type { Lang } from '@/lib/pen/currency'

export type PickState = 'signed_out' | 'not_configured' | 'connect' | 'reconnect' | 'ready' | 'done'
type Picked = { id: string; name: string; kind: 'doc' | 'sheet'; url: string }
/** The chat this page was opened from (lib/pen/drive-continue.ts): the pick carries on the request there. */
export type Continue = { token: string; back: 'wa' | 'im' | 'web'; wa: string }
type Outcome = 'plain' | 'continued' | 'say_done'

/** The Google Cloud project number: the Picker grants files to the app with this id. */
const APP_ID = '1084424504862'
const API_JS = 'https://apis.google.com/js/api.js'
const CONNECT = '/api/pen/google-calendar/connect?want=drive'
const SIGN_IN = '/auth/signin?callbackUrl=%2Fpen%2Fdrive%2Fpick'

const EN = {
  brand: 'Juno · Google Docs & Sheets',
  title: 'Let Juno edit a file',
  lede: 'Choose a Google Doc or Sheet you made yourself, and Juno can add to it or change it when you ask in the chat.',
  steps: ['Tap “Choose files”.', 'Pick up to 5 Docs or Sheets in Google’s window.', 'Go back to the chat and tell Juno what to change.'],
  stepsCont: ['Tap “Choose files”.', 'Pick the file in Google’s window.', 'That’s all: Juno does what you asked, in your chat.'],
  contLine: 'Done — Juno is adding it now. You’ll see it in your chat.',
  sayDone: 'Go back to the chat and say “done”, and Juno will carry on.',
  backWeb: 'Back to your chat',
  backWa: 'Back to WhatsApp',
  backIm: 'You can close this page and go back to Messages.',
  privacy: 'Juno can open only the files you choose here and the ones it made. Nothing else in your Drive is visible to Juno.',
  account: (a: string) => `Uses the Google account ${a}.`,
  choose: 'Choose files',
  opening: 'Opening Google…',
  saving: 'One moment…',
  doneTitle: 'Done',
  doneLine: (n: number) => (n === 1 ? 'Juno can now edit this file:' : `Juno can now edit these ${n} files:`),
  doneNext: 'Go back to your chat and tell Juno what to change, for example “add this week’s prices to the price sheet”.',
  more: 'Choose more files',
  missing: 'Some files couldn’t be opened. Make sure they are Google Docs or Sheets, not Word or Excel files.',
  signedOutTitle: 'Sign in first',
  signedOut: 'Sign in to Juno with your account, then you can choose the files Juno may edit.',
  signIn: 'Sign in to Juno',
  notConfigured: 'Choosing files isn’t available yet. Please try again soon.',
  connectTitle: 'Connect Google Docs & Sheets first',
  connect: 'Juno needs one Google permission: to make files in your Drive and open only the ones it makes or you choose. After connecting, come back to this page.',
  connectBtn: 'Connect Google Docs & Sheets',
  reconnectTitle: 'Connect Google again',
  reconnect: 'Google stopped accepting Juno’s access. Connect again, then come back to this page.',
  reconnectBtn: 'Connect again',
  failed: 'That didn’t work. Please try again.',
  blocked: 'Google’s window didn’t open. If your browser blocks pop-ups, allow them for this site and try again.',
  doc: 'Doc',
  sheet: 'Sheet',
}
type T = typeof EN

const COPY: Record<Lang, T> = {
  en: EN,
  es: {
    brand: 'Juno · Google Docs y Sheets',
    title: 'Deja que Juno edite un archivo',
    lede: 'Elige un Google Doc o Sheet que hiciste tú, y Juno podrá agregarle cosas o cambiarlo cuando se lo pidas en el chat.',
    steps: ['Toca “Elegir archivos”.', 'Elige hasta 5 Docs o Sheets en la ventana de Google.', 'Vuelve al chat y dile a Juno qué cambiar.'],
    stepsCont: ['Toca “Elegir archivos”.', 'Elige el archivo en la ventana de Google.', 'Eso es todo: Juno hace lo que pediste, en tu chat.'],
    contLine: 'Listo — Juno lo está agregando ahora. Lo verás en tu chat.',
    sayDone: 'Vuelve al chat y escribe “listo”, y Juno sigue.',
    backWeb: 'Volver a tu chat',
    backWa: 'Volver a WhatsApp',
    backIm: 'Puedes cerrar esta página y volver a Mensajes.',
    privacy: 'Juno solo puede abrir los archivos que elijas aquí y los que hizo él. Nada más de tu Drive es visible para Juno.',
    account: (a) => `Usa la cuenta de Google ${a}.`,
    choose: 'Elegir archivos',
    opening: 'Abriendo Google…',
    saving: 'Un momento…',
    doneTitle: 'Listo',
    doneLine: (n) => (n === 1 ? 'Juno ya puede editar este archivo:' : `Juno ya puede editar estos ${n} archivos:`),
    doneNext: 'Vuelve al chat y dile a Juno qué cambiar, por ejemplo “agrega los precios de esta semana a la planilla de precios”.',
    more: 'Elegir más archivos',
    missing: 'Algunos archivos no se pudieron abrir. Revisa que sean Google Docs o Sheets, no archivos de Word o Excel.',
    signedOutTitle: 'Primero inicia sesión',
    signedOut: 'Inicia sesión en Juno con tu cuenta y luego podrás elegir los archivos que Juno puede editar.',
    signIn: 'Iniciar sesión en Juno',
    notConfigured: 'Elegir archivos aún no está disponible. Inténtalo de nuevo pronto.',
    connectTitle: 'Primero conecta Google Docs y Sheets',
    connect: 'Juno necesita un permiso de Google: crear archivos en tu Drive y abrir solo los que hace él o los que tú elijas. Después de conectar, vuelve a esta página.',
    connectBtn: 'Conectar Google Docs y Sheets',
    reconnectTitle: 'Conecta Google de nuevo',
    reconnect: 'Google dejó de aceptar el acceso de Juno. Conéctalo de nuevo y vuelve a esta página.',
    reconnectBtn: 'Conectar de nuevo',
    failed: 'No funcionó. Inténtalo de nuevo.',
    blocked: 'La ventana de Google no se abrió. Si tu navegador bloquea ventanas emergentes, permítelas para este sitio e inténtalo de nuevo.',
    doc: 'Doc',
    sheet: 'Sheet',
  },
  pt: {
    brand: 'Juno · Google Docs e Planilhas',
    title: 'Deixe o Juno editar um arquivo',
    lede: 'Escolha um Google Doc ou Planilha que você mesmo fez, e o Juno pode acrescentar ou mudar o que você pedir no chat.',
    steps: ['Toque em “Escolher arquivos”.', 'Escolha até 5 Docs ou Planilhas na janela do Google.', 'Volte ao chat e diga ao Juno o que mudar.'],
    stepsCont: ['Toque em “Escolher arquivos”.', 'Escolha o arquivo na janela do Google.', 'Pronto: o Juno faz o que você pediu, no seu chat.'],
    contLine: 'Pronto — o Juno está adicionando agora. Você vai ver no seu chat.',
    sayDone: 'Volte ao chat e escreva “pronto”, e o Juno continua.',
    backWeb: 'Voltar para o seu chat',
    backWa: 'Voltar para o WhatsApp',
    backIm: 'Pode fechar esta página e voltar para o Mensagens.',
    privacy: 'O Juno só abre os arquivos que você escolher aqui e os que ele criou. Nada mais do seu Drive fica visível para o Juno.',
    account: (a) => `Usa a conta Google ${a}.`,
    choose: 'Escolher arquivos',
    opening: 'Abrindo o Google…',
    saving: 'Um momento…',
    doneTitle: 'Pronto',
    doneLine: (n) => (n === 1 ? 'O Juno já pode editar este arquivo:' : `O Juno já pode editar estes ${n} arquivos:`),
    doneNext: 'Volte ao chat e diga ao Juno o que mudar, por exemplo “coloque os preços desta semana na planilha de preços”.',
    more: 'Escolher mais arquivos',
    missing: 'Alguns arquivos não puderam ser abertos. Confira se são Google Docs ou Planilhas, não arquivos do Word ou Excel.',
    signedOutTitle: 'Entre primeiro',
    signedOut: 'Entre no Juno com a sua conta e depois escolha os arquivos que o Juno pode editar.',
    signIn: 'Entrar no Juno',
    notConfigured: 'Escolher arquivos ainda não está disponível. Tente de novo em breve.',
    connectTitle: 'Primeiro conecte o Google Docs e Planilhas',
    connect: 'O Juno precisa de uma permissão do Google: criar arquivos no seu Drive e abrir só os que ele cria ou que você escolhe. Depois de conectar, volte a esta página.',
    connectBtn: 'Conectar Google Docs e Planilhas',
    reconnectTitle: 'Conecte o Google de novo',
    reconnect: 'O Google parou de aceitar o acesso do Juno. Conecte de novo e volte a esta página.',
    reconnectBtn: 'Conectar de novo',
    failed: 'Não deu certo. Tente de novo.',
    blocked: 'A janela do Google não abriu. Se o seu navegador bloqueia pop-ups, permita para este site e tente de novo.',
    doc: 'Doc',
    sheet: 'Planilha',
  },
}

/* Google's Picker, typed as far as we use it. */
type PickerNS = {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (id: string) => { setMode(m: string): unknown; setIncludeFolders?(b: boolean): unknown }
  ViewId: { DOCUMENTS: string; SPREADSHEETS: string }
  DocsViewMode: { LIST: string }
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string }
  Response: { ACTION: string; DOCUMENTS: string }
  Action: { PICKED: string; CANCEL: string }
  Document: { ID: string; NAME: string }
}
type PickerBuilder = {
  addView(v: unknown): PickerBuilder
  setOAuthToken(t: string): PickerBuilder
  setDeveloperKey(k: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  enableFeature(f: string): PickerBuilder
  setMaxItems(n: number): PickerBuilder
  setLocale(l: string): PickerBuilder
  setOrigin(o: string): PickerBuilder
  setTitle(t: string): PickerBuilder
  setCallback(cb: (data: Record<string, unknown>) => void): PickerBuilder
  build(): { setVisible(v: boolean): void }
}
type W = Window & { gapi?: { load(name: string, cb: () => void): void }; google?: { picker?: PickerNS } }

let apiLoading: Promise<void> | null = null
function loadPickerApi(): Promise<PickerNS> {
  const w = window as W
  if (w.google?.picker) return Promise.resolve(w.google.picker)
  apiLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = API_JS
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { apiLoading = null; reject(new Error('api.js')) }
    document.head.appendChild(s)
  })
  return apiLoading.then(
    () =>
      new Promise<PickerNS>((resolve, reject) => {
        const g = (window as W).gapi
        if (!g) return reject(new Error('gapi'))
        g.load('picker', () => {
          const p = (window as W).google?.picker
          if (p) resolve(p)
          else reject(new Error('picker'))
        })
      }),
  )
}

const GoogleDriveMark = () => (
  <svg width="20" height="18" viewBox="0 0 87.3 78" aria-hidden="true">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
)

export default function PickClient({ lang, state, account, pickerKey, previewDone, cont, signIn }: { lang: Lang; state: PickState; account: string | null; pickerKey: string; previewDone?: Outcome | null; cont?: Continue | null; signIn?: string }) {
  const L = COPY[lang] ?? EN
  const [phase, setPhase] = useState<'idle' | 'opening' | 'saving' | 'done'>(previewDone ? 'done' : 'idle')
  const [outcome, setOutcome] = useState<Outcome>(previewDone ?? 'plain')
  // The token goes with the first pick only: it is single use.
  const token = useRef<string | null>(cont?.token ?? null)
  const [view, setView] = useState<PickState>(state)
  const [err, setErr] = useState<string | null>(null)
  const [files, setFiles] = useState<Picked[]>(
    previewDone
      ? [
          { id: 'preview-doc', name: 'Price list 2026', kind: 'doc', url: '#' },
          { id: 'preview-sheet', name: 'Clients — October', kind: 'sheet', url: '#' },
        ]
      : [],
  )
  const [missing, setMissing] = useState(0)
  const busy = useRef(false)

  const onPicked = useCallback(async (ids: string[]) => {
    setPhase('saving')
    try {
      const sent = token.current
      const r = await fetch('/api/pen/drive/picked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: ids.map((id) => ({ id })), ...(sent ? { token: sent } : {}) }) })
      const j = (await r.json().catch(() => ({}))) as { files?: Picked[]; missing?: number; connect?: boolean; continued?: boolean; reason?: string }
      if (r.status === 409 || j.connect) { setView('connect'); setPhase('idle'); return }
      if (!r.ok || !j.files) throw new Error('picked')
      setFiles(j.files)
      setMissing(j.missing ?? 0)
      if (sent && j.files.length) token.current = null
      setOutcome(sent && j.continued ? 'continued' : sent && j.reason === 'window' ? 'say_done' : 'plain')
      setPhase(j.files.length ? 'done' : 'idle')
      if (!j.files.length) setErr(L.missing)
    } catch {
      setErr(L.failed)
      setPhase('idle')
    }
  }, [L])

  const choose = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setErr(null)
    setPhase('opening')
    try {
      const r = await fetch('/api/pen/drive/token', { cache: 'no-store' })
      const t = (await r.json().catch(() => ({}))) as { accessToken?: string; connect?: boolean }
      if (r.status === 401) { setView('signed_out'); setPhase('idle'); return }
      if (r.status === 409 || (t.connect && !t.accessToken)) { setView(r.status === 502 ? 'reconnect' : 'connect'); setPhase('idle'); return }
      if (!r.ok || !t.accessToken) throw new Error('token')
      let P: PickerNS
      try {
        P = await loadPickerApi()
      } catch {
        setErr(L.blocked)
        setPhase('idle')
        return
      }
      const docs = new P.DocsView(P.ViewId.DOCUMENTS)
      docs.setMode(P.DocsViewMode.LIST)
      const sheets = new P.DocsView(P.ViewId.SPREADSHEETS)
      sheets.setMode(P.DocsViewMode.LIST)
      const picker = new P.PickerBuilder()
        .addView(docs)
        .addView(sheets)
        .setOAuthToken(t.accessToken)
        .setDeveloperKey(pickerKey)
        .setAppId(APP_ID)
        .enableFeature(P.Feature.MULTISELECT_ENABLED)
        .enableFeature(P.Feature.SUPPORT_DRIVES)
        .setMaxItems(5)
        .setLocale(lang === 'pt' ? 'pt-BR' : lang)
        .setOrigin(window.location.origin)
        .setTitle(L.title)
        .setCallback((data) => {
          const action = data[P.Response.ACTION]
          if (action === P.Action.PICKED) {
            const docsOut = (data[P.Response.DOCUMENTS] as Record<string, unknown>[] | undefined) ?? []
            const ids = docsOut.map((d) => String(d[P.Document.ID] ?? '')).filter(Boolean).slice(0, 5)
            if (ids.length) void onPicked(ids)
            else setPhase('idle')
          } else if (action === P.Action.CANCEL) {
            setPhase('idle')
          }
        })
        .build()
      picker.setVisible(true)
    } catch {
      setErr(L.failed)
      setPhase('idle')
    } finally {
      busy.current = false
    }
  }, [L, lang, onPicked, pickerKey])

  const head = (title: string) => (
    <>
      <div className="pen-drive-mark"><GoogleDriveMark /><span>{L.brand}</span></div>
      <h1>{title}</h1>
    </>
  )

  let body: React.ReactNode
  if (view === 'signed_out') {
    body = (<>{head(L.signedOutTitle)}<p>{L.signedOut}</p><div className="pen-drive-actions"><a className="pen-drive-btn" href={signIn ?? SIGN_IN}>{L.signIn}</a></div></>)
  } else if (view === 'not_configured') {
    body = (<>{head(L.title)}<p>{L.notConfigured}</p></>)
  } else if (view === 'connect' || view === 'reconnect') {
    const re = view === 'reconnect'
    body = (<>{head(re ? L.reconnectTitle : L.connectTitle)}<p>{re ? L.reconnect : L.connect}</p><div className="pen-drive-actions"><a className="pen-drive-btn" href={CONNECT}>{re ? L.reconnectBtn : L.connectBtn}</a></div><p className="pen-drive-fine">{L.privacy}</p></>)
  } else if (phase === 'done') {
    body = (
      <>
        {head(L.doneTitle)}
        <div className="pen-drive-ok" role="status">{outcome === 'continued' ? L.contLine : L.doneLine(files.length)}</div>
        <ul className="pen-drive-files">
          {files.map((f) => (
            <li key={f.id}>
              <span className={`pen-drive-kind ${f.kind}`} aria-label={f.kind === 'doc' ? L.doc : L.sheet}>{f.kind === 'doc' ? 'D' : 'S'}</span>
              <a href={f.url} target="_blank" rel="noreferrer">{f.name || (f.kind === 'doc' ? L.doc : L.sheet)}</a>
            </li>
          ))}
        </ul>
        {missing > 0 && <p className="pen-drive-fine">{L.missing}</p>}
        {outcome === 'plain' && <p>{L.doneNext}</p>}
        {outcome === 'say_done' && <p>{L.sayDone}</p>}
        {outcome !== 'plain' && cont && (
          cont.back === 'web' ? (
            <div className="pen-drive-actions"><a className="pen-drive-btn" href="/pen?view=chats">{L.backWeb}</a></div>
          ) : cont.back === 'wa' && cont.wa ? (
            <div className="pen-drive-actions"><a className="pen-drive-btn" href={`https://wa.me/${cont.wa}`}>{L.backWa}</a></div>
          ) : (
            <p className="pen-drive-fine">{cont.back === 'im' ? L.backIm : `${L.backWa}.`}</p>
          )
        )}
        {outcome === 'plain' && <div className="pen-drive-actions"><button type="button" className="pen-drive-btn quiet" onClick={() => { setPhase('idle'); void choose() }}>{L.more}</button></div>}
      </>
    )
  } else {
    body = (
      <>
        {head(L.title)}
        <p>{L.lede}</p>
        <ol className="pen-drive-steps">{(cont ? L.stepsCont : L.steps).map((s) => <li key={s}>{s}</li>)}</ol>
        {err && <div className="pen-drive-err" role="alert">{err}</div>}
        <div className="pen-drive-actions">
          <button type="button" className="pen-drive-btn" onClick={() => void choose()} disabled={phase !== 'idle'}>
            {phase === 'opening' ? L.opening : phase === 'saving' ? L.saving : L.choose}
          </button>
        </div>
        {account && <p className="pen-drive-fine">{L.account(account)}</p>}
        <p className="pen-drive-fine">{L.privacy}</p>
      </>
    )
  }

  return <div className="pen-drive-card">{body}</div>
}
