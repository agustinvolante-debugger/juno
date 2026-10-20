import Image from 'next/image'
import { authedEmail } from '@/lib/news/auth'
import { appLangFor } from '../../app-lang'
import { BrandMark } from '../../brand-marks'
import Icon from '../../Icon'
import NotionPanel from '../notion/NotionPanel'
import GranolaPanel from '../granola/GranolaPanel'
import WhatsAppLink from '../whatsapp/WhatsAppLink'
import ConnItem, { MarkTile } from './ConnItem'
import GoogleAccounts from './GoogleAccounts'
import DocsSheets from './DocsSheets'
import LinkPrefs from './LinkPrefs'
import { loadConnections } from './data'

export const dynamic = 'force-dynamic'

// Settings → Connections (20 Oct): one page, organised by what people want to do, instead of a
// Settings item per company (Google, Email, Notion, Granola, WhatsApp). Every provider is listed
// with one honest line about what works today, so an Outlook user sees Outlook, not "Google".
// The old pages redirect here (lib/pen/settings-paths.ts). `?p=<panel>` carries a status back
// from a connect flow to the panel it belongs to.

const C = {
  en: {
    intro: 'The apps Juno works with. None is required: each one lets Juno do a little more for you.',
    mailCal: 'Email & calendar',
    mailCalLede: 'Where Juno sends your drafts from and adds the meetings you approve.',
    chat: 'Chat with Juno',
    chatLede: 'Send recordings, ask about any meeting, and get reminders, from the app you already text in.',
    docs: 'Notes & documents',
    docsLede: 'Where your notes and the documents Juno writes can go.',
    googleN: (n: number) => (n === 1 ? 'Gmail and Google Calendar · 1 address connected' : `Gmail and Google Calendar · ${n} addresses connected`),
    googleNone: 'Gmail and Google Calendar · not connected',
    outlook: 'Outlook / Microsoft 365',
    outlookLine: 'Drafts open in Outlook with one tap, and so do new events. Full connection coming soon.',
    apple: 'Apple Calendar & iCloud',
    appleLine: 'Events added with one tap.',
    yahoo: 'Yahoo & other email',
    yahooLine: 'Drafts open in Yahoo Mail or your mail app.',
    inUse: 'Yours',
    whatsapp: 'WhatsApp',
    imessage: 'iMessage',
    linked: (p: string) => `Linked to ${p}`,
    imLinked: (p: string) => `Text Juno from ${p}`,
    notLinked: 'Not linked',
    waOff: 'Not switched on yet',
    link: 'Link',
    testing: 'In testing',
    notion: 'Notion',
    notionOn: (w: string) => `Connected to ${w}`,
    notionAuto: 'new recordings added automatically',
    granola: 'Granola',
    granolaKey: 'Connected with an API key',
    granolaOauth: 'Connected with Granola sign-in',
    gdocs: 'Google Docs & Sheets',
    gdocsOn: (a: string | null) => (a ? `Connected through ${a}` : 'Connected through Google'),
    off: 'Not connected',
    needsAttention: 'Needs attention',
    connect: 'Connect',
    setUp: 'Set up',
    show: 'Show settings',
    hide: 'Hide settings',
  },
  es: {
    intro: 'Las apps con las que trabaja Juno. Ninguna es obligatoria: cada una le permite hacer un poco más por ti.',
    mailCal: 'Correo y calendario',
    mailCalLede: 'Desde dónde Juno envía tus borradores y dónde agrega las reuniones que apruebas.',
    chat: 'Chatea con Juno',
    chatLede: 'Envía grabaciones, pregunta por cualquier reunión y recibe recordatorios, desde la app donde ya escribes.',
    docs: 'Notas y documentos',
    docsLede: 'Adónde pueden ir tus notas y los documentos que escribe Juno.',
    googleN: (n: number) => (n === 1 ? 'Gmail y Google Calendar · 1 dirección conectada' : `Gmail y Google Calendar · ${n} direcciones conectadas`),
    googleNone: 'Gmail y Google Calendar · sin conectar',
    outlook: 'Outlook / Microsoft 365',
    outlookLine: 'Los borradores se abren en Outlook con un toque, y los eventos nuevos también. La conexión completa llega pronto.',
    apple: 'Calendario de Apple e iCloud',
    appleLine: 'Los eventos se agregan con un toque.',
    yahoo: 'Yahoo y otros correos',
    yahooLine: 'Los borradores se abren en Yahoo Mail o en tu app de correo.',
    inUse: 'El tuyo',
    whatsapp: 'WhatsApp',
    imessage: 'iMessage',
    linked: (p: string) => `Vinculado a ${p}`,
    imLinked: (p: string) => `Escríbele a Juno desde ${p}`,
    notLinked: 'Sin vincular',
    waOff: 'Aún no está activado',
    link: 'Vincular',
    testing: 'En prueba',
    notion: 'Notion',
    notionOn: (w: string) => `Conectado a ${w}`,
    notionAuto: 'las grabaciones nuevas se agregan solas',
    granola: 'Granola',
    granolaKey: 'Conectado con una clave de API',
    granolaOauth: 'Conectado con el inicio de sesión de Granola',
    gdocs: 'Google Docs y Sheets',
    gdocsOn: (a: string | null) => (a ? `Conectado con ${a}` : 'Conectado con Google'),
    off: 'Sin conectar',
    needsAttention: 'Requiere atención',
    connect: 'Conectar',
    setUp: 'Configurar',
    show: 'Mostrar ajustes',
    hide: 'Ocultar ajustes',
  },
  pt: {
    intro: 'Os apps com que o Juno trabalha. Nenhum é obrigatório: cada um deixa o Juno fazer um pouco mais por você.',
    mailCal: 'E-mail e agenda',
    mailCalLede: 'De onde o Juno envia seus rascunhos e onde adiciona as reuniões que você aprova.',
    chat: 'Converse com o Juno',
    chatLede: 'Envie gravações, pergunte sobre qualquer reunião e receba lembretes, no app em que você já conversa.',
    docs: 'Notas e documentos',
    docsLede: 'Para onde podem ir suas notas e os documentos que o Juno escreve.',
    googleN: (n: number) => (n === 1 ? 'Gmail e Google Agenda · 1 endereço conectado' : `Gmail e Google Agenda · ${n} endereços conectados`),
    googleNone: 'Gmail e Google Agenda · não conectado',
    outlook: 'Outlook / Microsoft 365',
    outlookLine: 'Os rascunhos abrem no Outlook com um toque, e os eventos novos também. A conexão completa chega em breve.',
    apple: 'Calendário da Apple e iCloud',
    appleLine: 'Os eventos são adicionados com um toque.',
    yahoo: 'Yahoo e outros e-mails',
    yahooLine: 'Os rascunhos abrem no Yahoo Mail ou no seu app de e-mail.',
    inUse: 'O seu',
    whatsapp: 'WhatsApp',
    imessage: 'iMessage',
    linked: (p: string) => `Vinculado a ${p}`,
    imLinked: (p: string) => `Mande mensagem para o Juno de ${p}`,
    notLinked: 'Não vinculado',
    waOff: 'Ainda não está ativado',
    link: 'Vincular',
    testing: 'Em teste',
    notion: 'Notion',
    notionOn: (w: string) => `Conectado a ${w}`,
    notionAuto: 'gravações novas adicionadas sozinhas',
    granola: 'Granola',
    granolaKey: 'Conectado com uma chave de API',
    granolaOauth: 'Conectado com o login do Granola',
    gdocs: 'Google Docs e Planilhas',
    gdocsOn: (a: string | null) => (a ? `Conectado por ${a}` : 'Conectado pelo Google'),
    off: 'Não conectado',
    needsAttention: 'Precisa de atenção',
    connect: 'Conectar',
    setUp: 'Configurar',
    show: 'Mostrar configurações',
    hide: 'Ocultar configurações',
  },
} as const

/** "+56 9 1234 5678"-ish: the digits with a plus, grouped for reading. */
function pretty(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return `+${d.replace(/(\d{1,3})(?=(\d{4})+$)/, '$1 ').replace(/(\d{4})(?=\d)/g, '$1 ')}`.trim()
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = (await authedEmail())!
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null)
  const [lang, d] = await Promise.all([appLangFor(email), loadConnections(email)])
  const T = C[lang]
  const p = one('p')
  const at = (panel: string) => (p === panel ? one : () => null)
  const fold = { show: T.show, hide: T.hide }

  const g = d.google
  const live = g.accounts.filter((a) => !a.broken).length
  const gWarn = g.accounts.some((a) => a.broken)
  const mail = d.links.mail
  const cal = d.links.cal
  const chatOn = d.chat.ready || Boolean(d.chat.imessage)
  const phone = d.chat.phone
  const nConn = d.notion.conn
  const grConn = d.granola.conn

  return (
    <div className="pen-conn">
      <p className="pen-conn-intro">{T.intro}</p>

      <section className="pen-set-card pen-conn-sec" aria-labelledby="conn-mail">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2" id="conn-mail">{T.mailCal}</h2>
          <p className="pen-set-lede">{T.mailCalLede}</p>
        </div>
        <ul className="pen-conn-list">
          <ConnItem
            id="google"
            fixed
            state={gWarn ? 'warn' : live ? 'on' : 'off'}
            marks={<><MarkTile><BrandMark name="gmail" size={20} /></MarkTile><MarkTile><BrandMark name="googlecalendar" size={19} /></MarkTile></>}
            name="Google"
            status={gWarn ? T.needsAttention : g.accounts.length ? T.googleN(g.accounts.length) : T.googleNone}
          >
            <GoogleAccounts
              configured={g.configured}
              gmailOn={g.gmailOn}
              readAllowed={g.readAllowed}
              accounts={g.accounts}
              calCount={g.calCount}
              status={{
                p: p === 'email' || p === 'google' ? p : null,
                connected: p === 'email' || p === 'google' ? one('connected') : null,
                read: at('email')('read'),
                cal: at('email')('cal'),
                disconnected: at('google')('disconnected'),
                gone: at('google')('gone'),
                error: p === 'email' || p === 'google' ? one('error') : null,
              }}
            />
          </ConnItem>
          <ConnItem
            id="outlook"
            state="links"
            marks={<MarkTile><Image src="/brands/outlook.png" alt="" width={20} height={20} className="pen-conn-img" /></MarkTile>}
            name={T.outlook}
            badge={mail === 'outlook' || cal === 'outlook' ? T.inUse : null}
            status={T.outlookLine}
          />
          <ConnItem
            id="apple"
            state="links"
            marks={<MarkTile><BrandMark name="apple" size={19} /></MarkTile>}
            name={T.apple}
            badge={cal === 'apple' ? T.inUse : null}
            status={T.appleLine}
          />
          <ConnItem
            id="yahoo"
            state="links"
            marks={<MarkTile><Icon name="mail" size={19} /></MarkTile>}
            name={T.yahoo}
            badge={mail === 'yahoo' || mail === 'other' ? T.inUse : null}
            status={T.yahooLine}
          />
        </ul>
        <LinkPrefs mail={mail} mailGuessed={d.links.mailGuessed} cal={cal} calGuessed={d.links.calGuessed} />
      </section>

      {chatOn && (
        <section className="pen-set-card pen-conn-sec" aria-labelledby="conn-chat">
          <div className="pen-set-card-head">
            <h2 className="pen-set-h2" id="conn-chat">{T.chat}</h2>
            <p className="pen-set-lede">{T.chatLede}</p>
          </div>
          <ul className="pen-conn-list">
            <ConnItem
              id="whatsapp"
              state={phone ? 'on' : 'off'}
              open={p === 'whatsapp'}
              marks={<MarkTile><BrandMark name="whatsapp" size={20} /></MarkTile>}
              name={T.whatsapp}
              status={!d.chat.ready ? T.waOff : phone ? T.linked(pretty(phone)) : T.notLinked}
              openLabel={d.chat.ready && !phone ? T.link : undefined}
              toggleLabel={fold}
            >
              <WhatsAppLink part="whatsapp" messages={false} initialPhone={phone} number={d.chat.number} ready={d.chat.ready} loadError={d.chat.loadError} prefs={{ off: false, offKinds: [] }} imessage={d.chat.imessage} />
            </ConnItem>
            {d.chat.imessage && (
              <ConnItem
                id="imessage"
                state={phone ? 'on' : 'off'}
                marks={<MarkTile><BrandMark name="imessage" size={20} /></MarkTile>}
                name={T.imessage}
                badge={T.testing}
                status={phone ? T.imLinked(pretty(phone)) : T.notLinked}
                openLabel={!phone ? T.link : undefined}
                toggleLabel={fold}
              >
                <WhatsAppLink part="imessage" messages={false} initialPhone={phone} number={d.chat.number} ready={d.chat.ready} loadError={null} prefs={{ off: false, offKinds: [] }} imessage={d.chat.imessage} />
              </ConnItem>
            )}
          </ul>
        </section>
      )}

      <section className="pen-set-card pen-conn-sec" aria-labelledby="conn-docs">
        <div className="pen-set-card-head">
          <h2 className="pen-set-h2" id="conn-docs">{T.docs}</h2>
          <p className="pen-set-lede">{T.docsLede}</p>
        </div>
        <ul className="pen-conn-list">
          {d.notion.configured && (
            <ConnItem
              id="notion"
              state={nConn?.last_error ? 'warn' : nConn ? 'on' : 'off'}
              open={p === 'notion'}
              marks={<MarkTile><BrandMark name="notion" size={19} /></MarkTile>}
              name={T.notion}
              status={nConn?.last_error ? T.needsAttention : nConn ? `${T.notionOn(nConn.workspace_name ?? 'Notion')}${nConn.auto ? ` · ${T.notionAuto}` : ''}` : T.off}
              action={nConn ? undefined : <a className="pen-btn" href="/api/pen/notion/connect">{T.connect}</a>}
              toggleLabel={fold}
            >
              <NotionPanel configured={d.notion.configured} conn={nConn} justConnected={p === 'notion' && one('connected') === '1'} error={at('notion')('error')} />
            </ConnItem>
          )}
          {d.granola.available && (
            <ConnItem
              id="granola"
              state={grConn?.last_error ? 'warn' : grConn ? 'on' : 'off'}
              open={p === 'granola'}
              marks={<MarkTile><Image src="/brands/granola.png" alt="" width={20} height={20} className="pen-conn-img" /></MarkTile>}
              name={T.granola}
              status={grConn?.last_error ? T.needsAttention : grConn ? (grConn.kind === 'api' ? T.granolaKey : T.granolaOauth) : T.off}
              openLabel={grConn ? undefined : T.setUp}
              toggleLabel={fold}
            >
              <GranolaPanel available={d.granola.available} conn={grConn} justConnected={p === 'granola' && one('connected') === '1'} error={at('granola')('error')} />
            </ConnItem>
          )}
          {g.configured && (
            <ConnItem
              id="docs"
              state={g.docs.on ? (g.docs.broken ? 'warn' : 'on') : 'off'}
              open={p === 'docs' || (p === 'google' && (one('connected') === 'drive' || one('disconnected') === 'drive'))}
              marks={<><MarkTile><BrandMark name="googledocs" size={19} /></MarkTile><MarkTile><BrandMark name="googlesheets" size={19} /></MarkTile></>}
              name={T.gdocs}
              status={g.docs.on ? (g.docs.broken ? T.needsAttention : T.gdocsOn(g.docs.address)) : T.off}
              action={g.docs.on ? undefined : <a className="pen-btn" href="/api/pen/google-calendar/connect?want=drive">{T.connect}</a>}
              toggleLabel={fold}
            >
              <DocsSheets
                configured={g.configured}
                on={g.docs.on}
                calendarToo={g.docs.calendarToo}
                address={g.docs.address}
                broken={g.docs.broken}
                anyGoogle={g.accounts.length > 0}
                status={{ connected: p === 'google' || p === 'docs' ? one('connected') : null, disconnected: p === 'google' || p === 'docs' ? one('disconnected') : null }}
              />
            </ConnItem>
          )}
        </ul>
      </section>
    </div>
  )
}
