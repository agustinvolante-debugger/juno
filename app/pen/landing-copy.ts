// Every word on the landing page, in the three languages it is sold in.
//
// One layout, three copies of the words: a design change lands in all of them at once, and a
// translation can never drift into a different page. Spanish is neutral Latin American (tú);
// Portuguese is Brazilian. The demo scenes are localised, not just translated, so a Chilean
// reader sees a Chilean-sounding viewing rather than "Maple Avenue" in Spanish.
//
// Copy rules kept across all three: one label per call to action, no em dashes in anything a
// reader sees, and no claim the product cannot stand behind.

export type Lang = 'en' | 'es' | 'pt'
export type Currency = 'usd' | 'clp' | 'brl'
export type Market = { lang: Lang; currency: Currency }

/** Spanish-speaking Latin America (and Spain) gets Spanish; Brazil gets Portuguese. */
const SPANISH = new Set(['CL', 'AR', 'MX', 'CO', 'PE', 'UY', 'EC', 'BO', 'PY', 'VE', 'CR', 'PA', 'GT', 'SV', 'HN', 'NI', 'DO', 'PR', 'CU', 'ES'])

/**
 * The market for a visitor: an explicit choice (the corner switch, ?m=) wins, then the
 * country Vercel reports. Chile pays in CLP and Brazil in BRL; everyone else sees USD.
 * With no country (localhost), a Spanish preview assumes Chile and Portuguese assumes Brazil.
 */
export function marketFor(country: string | null | undefined, choice: string | null | undefined): Market {
  const c = (country ?? '').toUpperCase()
  const lang: Lang = choice === 'en' || choice === 'es' || choice === 'pt' ? choice : c === 'BR' ? 'pt' : SPANISH.has(c) ? 'es' : 'en'
  const currency: Currency =
    lang === 'pt' ? (c === '' || c === 'BR' ? 'brl' : 'usd') : lang === 'es' ? (c === '' || c === 'CL' ? 'clp' : 'usd') : 'usd'
  return { lang, currency }
}

/** Software-only prices in local money, set in Stripe as real prices in each currency. */
export const LOCAL_PRICES: Record<Exclude<Currency, 'usd'>, { monthly: number; halfyear: number }> = {
  clp: { monthly: 11990, halfyear: 49990 },
  brl: { monthly: 59.9, halfyear: 269 },
}

export function money(amount: number, currency: Currency): string {
  if (currency === 'clp') return `$${Math.round(amount).toLocaleString('es-CL')}`
  if (currency === 'brl') return `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`
  return `$${amount}`
}

export type RoleDemo = { tab: string; short: string; q: string; a: string; sources: { title: string; date: string }[] }

export type Copy = {
  nav: { features: string; pen: string; pricing: string; signIn: string; home: string }
  cta: { trialPen: (d: number) => string; trialOwn: (d: number) => string; yearly: string; halfyear: string; seeWhat: string }
  hero: { h1a: string; h1b: string; lede: string; offer: string; noPen: string; float: { detected: string; buyer: string; todo: string; due: string; draft: string; draftTitle: string; openGmail: string } }
  wa: { title: string; body: string; me1: string; reply: string; me2: string; replyTitle: string }
  audience: { h2: string; sub: string; ask: string; found: (n: number) => string; aria: string; roles: RoleDemo[] }
  features: {
    h2: string
    sub: string
    note: { title: string; copy: string; summaryLabel: string; summary: string; actionsLabel: string; actions: [string, string, string]; priority: string; decidedLabel: string; decided: string; transcriptLabel: string; turns: [string, string][] }
    people: { title: string; copy: string; name: string; meta: string; about: string; detected: string; pills: [string, string] }
    jot: { title: string; copy: string; jot: string; enh: string; button: string }
    email: { title: string; copy: string; to: string; subjectLabel: string; subject: string; body: string; gmail: string; outlook: string }
    missed: { title: string; copy: string; items: [string, string][] }
    home: { title: string; copy: string; stats: [string, string, string]; todos: [string, string] }
    privateTitle: string
    privateItems: [string, string, string, string]
  }
  how: { h2: string; steps: { h: string; p: string }[] }
  pen: { h2: string; sub: string; open: string; storageK: string; storageV: string; batteryK: string; batteryV: string; specs: { k: string; v: string }[]; inBox: string; soon: string; soonBody: string }
  pricing: {
    h2: string
    sub: string
    tabPen: string
    tabOwn: string
    tabAria: string
    ownSub: string
    includedTitle: string
    included: string[]
    monthly: string
    halfyear: string
    yearly: string
    perMonth: string
    perHalf: string
    perYear: string
    penLineMonthly: (trial: number, pen: string) => string
    penLineIncluded: (perMonth: string) => string
    ownLineMonthly: (trial: number) => string
    ownLineHalf: (perMonth: string) => string
    tradeMonthlyPen: string
    tradeHalfPen: string
    tradeYearPen: string
    tradeOwnMonthly: string
    tradeOwnHalf: string
    ribbonPen: string
    ribbonBest: string
    soonTitle: string
    soonBody: string
    soonCta: string
  }
  closing: { h2: string; sub: (trial: number) => string }
  footer: { consent: string; trademarks: string; privacy: string; terms: string }
  switcher: string
}

const EN: Copy = {
  nav: { features: 'What it does', pen: 'The pen', pricing: 'Pricing', signIn: 'Sign in', home: 'Juno Pen, home' },
  cta: { trialPen: (d) => `Start ${d} days free`, trialOwn: (d) => `Start ${d} days free`, yearly: 'Get the year', halfyear: 'Get 6 months', seeWhat: 'See what it does' },
  hero: {
    h1a: 'Focus on the conversation.',
    h1b: 'We’ll remember every word.',
    lede: 'A real pen that records. Plug it in and Juno Pen writes up who was there, what was decided, what you owe people, and the thing you nearly missed. Then it drafts the follow-up email.',
    offer: 'Unlimited recording. {yearly} a year with the pen included, or {own} a month with your own recorder.',
    noPen: 'No pen? Bring audio or transcripts from your phone, Plaud, Pocket or any recorder.',
    float: { detected: 'Detected on this call', buyer: 'buyer', todo: 'Send comps for Ridgewood', due: 'Due Friday', draft: 'Draft ready', draftTitle: 'Re: carport before Saturday', openGmail: 'Open in Gmail' },
  },
  wa: {
    title: 'Or just send it on WhatsApp',
    body: 'Plug the pen into your phone and send the recording to Juno Pen. The briefing comes back in the chat, and you can ask about any call from there.',
    me1: 'R20260922-213209.WAV',
    replyTitle: 'Maple Avenue viewing',
    reply: 'Sarah loved the kitchen; Tom balked at the price. Second viewing Saturday.',
    me2: 'What did Tom say about the garage?',
  },
  audience: {
    h2: 'For anyone who talks for a living.',
    sub: 'Ask anything across every call you have ever recorded. Every answer shows exactly where it was said.',
    ask: 'Ask across every recording',
    found: (n) => `${n} calls found`,
    aria: 'Who it is for',
    roles: [
      {
        tab: 'Realtors',
        short: 'Realtors',
        q: 'What has {Sarah} said about parking across all the viewings?',
        a: 'She has raised it at all three viewings [1][2][3]. At Oak Street she said they would not bid without covered parking [2], and at Ridgewood she called it the thing that decides it [3]. Tom has never objected to paying more for it [1].',
        sources: [
          { title: 'Maple Avenue viewing', date: 'Sep 9' },
          { title: 'Oak Street viewing', date: 'Sep 14' },
          { title: 'Ridgewood walk-through', date: 'Sep 21' },
        ],
      },
      {
        tab: 'Students',
        short: 'Students',
        q: 'What did Professor Ruiz say will be on the midterm?',
        a: 'One WACC question with a changing capital structure [2] and a bond pricing problem like problem set 3 [1]. She said most people lose marks on the tax shield, not the formula [2], and that a formula sheet is allowed [3].',
        sources: [
          { title: 'Corporate Finance, lecture 4', date: 'Sep 10' },
          { title: 'Corporate Finance, lecture 6', date: 'Sep 17' },
          { title: 'Office hours', date: 'Sep 19' },
        ],
      },
      {
        tab: 'Bankers',
        short: 'Bankers',
        q: 'Which clients raised covenant issues this quarter?',
        a: 'Two. Harbor Logistics said the board will not approve new facilities until leverage clears for two quarters [1]. Delta Foods asked to reset the interest cover test before renewal [3]. Meridian mentioned covenants but said it has headroom [2].',
        sources: [
          { title: 'Harbor Logistics review', date: 'Aug 4' },
          { title: 'Meridian quarterly', date: 'Aug 19' },
          { title: 'Delta Foods renewal call', date: 'Sep 2' },
        ],
      },
      {
        tab: 'Founders & CEOs',
        short: 'Founders',
        q: 'What did investors push back on most?',
        a: 'Market size, in three of four calls [1][2][4]. Northbeam wanted month-6 retention by channel instead [3], and two funds asked who else is in the round before taking it to a partner meeting [2][4].',
        sources: [
          { title: 'Harbor VC intro', date: 'Aug 28' },
          { title: 'Lattice Capital', date: 'Sep 3' },
          { title: 'Northbeam Ventures', date: 'Sep 11' },
          { title: 'Fieldstone seed call', date: 'Sep 16' },
        ],
      },
      {
        tab: 'Consultants',
        short: 'Consult',
        q: 'What did {Dana} commit to, and by when?',
        a: 'Three things. Discount data by rep before the workshop [1], the Q3 margin bridge by Friday [2], and bringing the CFO to the board-pack review on the 14th [3].',
        sources: [
          { title: 'Kickoff with the COO', date: 'Sep 1' },
          { title: 'Pricing workshop', date: 'Sep 12' },
          { title: 'Steering call', date: 'Sep 18' },
        ],
      },
    ],
  },
  features: {
    h2: 'Everything after the meeting, already done.',
    sub: 'The note, the people, the to-dos, the email, and an assistant that has read every conversation you have ever recorded.',
    note: {
      title: 'Written up for you',
      copy: 'Who said what, what was decided, and what happens next.',
      summaryLabel: 'Summary',
      summary: 'Third viewing with the Hendersons. Sarah led on the renovated kitchen; Tom went straight to price and flagged it as above their ceiling. They asked to return at the weekend with her mother.',
      actionsLabel: 'Next actions',
      actions: ['Send comps for the street', 'Check the HOA on the carport', 'Confirm Saturday with her mother'],
      priority: 'Priority',
      decidedLabel: 'Decided',
      decided: 'They will make an offer this week if the covered parking checks out.',
      transcriptLabel: 'Transcript',
      turns: [
        ['Sarah', 'We love the kitchen. The parking is the thing.'],
        ['You', 'There is a covered spot with the unit, round the back.'],
        ['Tom', 'Then we would want to move on it this week.'],
      ],
    },
    people: {
      title: 'Knows who was there',
      copy: 'It picks out the people it heard. One click saves them, with what they care about.',
      name: 'Sarah Henderson',
      meta: 'Buyer · 3 calls',
      about: 'Wants covered parking and a finished kitchen. Leads on design; defers to Tom on price.',
      detected: 'Detected on this call',
      pills: ['+ Tom · husband', '+ Maria · lender'],
    },
    jot: {
      title: 'Jot three words, get the whole story',
      copy: 'Type a quick note during the meeting. Press Enhance and it fills in what was actually said.',
      jot: 'no garage again',
      enh: 'Third property in a row without one. Sarah raised it in passing, which makes it a filter, not a preference.',
      button: 'Enhance',
    },
    email: {
      title: 'The follow-up, already written',
      copy: 'Pick any action and get the email. Open it in Gmail or Outlook, edit, send.',
      to: 'To',
      subjectLabel: 'Subject',
      subject: 'Carport before Saturday',
      body: 'Quick one before the second viewing: the HOA does allow the carport to be enclosed, so the garage question has an answer.',
      gmail: 'Open in Gmail',
      outlook: 'Outlook',
    },
    missed: {
      title: 'What you nearly missed',
      copy: 'The promise made in passing, the number nobody named.',
      items: [
        ['They asked to come back with her mother', 'The strongest buying signal, in the last thirty seconds.'],
        ['You promised to check the HOA', 'Said aloud, easy to forget by the weekend.'],
      ],
    },
    home: {
      title: 'On top of everything',
      copy: 'Every open action across every call, in one place.',
      stats: ['still to do', 'nearly missed', 'people'],
      todos: ['Send Priya the retention numbers', 'Email office hours by Wednesday'],
    },
    privateTitle: 'Private by design',
    privateItems: ['Encrypted in transit and at rest', 'Private to your account', 'Delete anything, anytime', 'Never sold'],
  },
  how: {
    h2: 'Three steps. Two of them are plugging in a cable.',
    steps: [
      { h: 'Record', p: 'Press once and put it in your pocket. In voice mode it skips the silences.' },
      { h: 'Plug it in', p: 'USB-C, straight into your laptop or phone. Juno Pen finds the new recordings, or send them on WhatsApp.' },
      { h: 'Read the note', p: 'Minutes later: the summary, the people, the actions, and the email to send. In the app or in the chat.' },
    ],
  },
  pen: {
    h2: 'A pen that hears the whole room.',
    sub: 'Clip it in a shirt pocket or leave it on the table. Clear audio, a battery that lasts the week, and room for years of meetings.',
    open: 'Open it at the ring and the USB-C plug is right there.',
    storageK: 'of storage',
    storageV: 'Over 7,000 hours of audio at the lowest bitrate. Years of meetings before it fills.',
    batteryK: 'of recording per charge',
    batteryV: 'A full working week of meetings between charges.',
    specs: [
      { k: '360° microphone', v: 'Picks up every side of the table, with noise reduction built in so voices come through clean.' },
      { k: 'USB-C built in', v: 'Plugs straight into a laptop, phone or tablet. No cable to lose, nothing to install.' },
      { k: 'One touch, voice activated', v: 'Press once to record. Voice mode pauses in the silences, so long meetings stay short to review.' },
      { k: 'Timestamped files', v: 'Every recording is named by when it started. Long ones split cleanly and rejoin in Juno Pen.' },
      { k: 'Never loses a take', v: 'If the battery runs low it saves the recording before it powers down.' },
      { k: 'It writes, too', v: 'A real ballpoint, refills in the box. Nobody asks what it is.' },
    ],
    inBox: 'In the box: the pen, a USB-C to USB-A cable, earphones, spare ink refills and a small screwdriver.',
    soon: '',
    soonBody: '',
  },
  pricing: {
    h2: 'Unlimited recording on every plan.',
    sub: 'With the Juno pen, or with the recorder you already have. Same notes, same search, same everything.',
    tabPen: 'With the Juno pen',
    tabOwn: 'Your own recorder',
    tabAria: 'Choose how you record',
    ownSub: 'Your phone, WhatsApp voice notes, Plaud, Pocket, or any recorder that gives you audio or a transcript.',
    includedTitle: 'Every plan includes',
    included: [
      'Unlimited recording (fair use: 100 hours a month)',
      'Full transcript with who said what',
      'Summary, decisions and action items',
      'People detected and remembered',
      'Ask across every recording with @',
      'Follow-up emails drafted for you',
      'A briefing in your inbox after each meeting',
      'Notes in the language you spoke',
    ],
    monthly: 'Monthly',
    halfyear: '6 months',
    yearly: 'Yearly',
    perMonth: 'a month',
    perHalf: 'every 6 months',
    perYear: 'a year',
    penLineMonthly: (t, pen) => `${t} days free · pen ${pen} once`,
    penLineIncluded: (pm) => `${pm} a month · pen included`,
    ownLineMonthly: (t) => `${t} days free`,
    ownLineHalf: (pm) => `${pm} a month · billed today`,
    tradeMonthlyPen: 'You buy the pen, and you can stop any month you like.',
    tradeHalfPen: 'The pen is on us, paid up front for half a year.',
    tradeYearPen: 'The pen is on us, and it works out cheapest.',
    tradeOwnMonthly: 'Record on your phone or any recorder and upload the file.',
    tradeOwnHalf: 'The same, paid up front for half a year.',
    ribbonPen: 'Pen included',
    ribbonBest: 'Best value',
    soonTitle: '',
    soonBody: '',
    soonCta: '',
  },
  closing: { h2: 'Your next meeting, remembered.', sub: (t) => `Try it free for ${t} days. The pen ships in the post.` },
  footer: {
    consent: 'Recording a conversation needs everyone’s permission in many places, Florida included. Juno Pen asks you to confirm consent before it processes anything.',
    trademarks: 'Plaud and Pocket are trademarks of their owners. Juno Pen is not affiliated with them.',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  switcher: 'Language',
}

const ES: Copy = {
  nav: { features: 'Qué hace', pen: 'El lápiz', pricing: 'Precios', signIn: 'Entrar', home: 'Juno Pen, inicio' },
  cta: { trialPen: (d) => `Prueba ${d} días gratis`, trialOwn: (d) => `Prueba ${d} días gratis`, yearly: 'Contratar el año', halfyear: 'Contratar 6 meses', seeWhat: 'Mira qué hace' },
  hero: {
    h1a: 'Mándale tu reunión a Juno por WhatsApp.',
    h1b: 'Te devuelve el resumen.',
    lede: 'Graba con el celular o con el lápiz, envía el audio por WhatsApp y recibe quién estuvo, qué se decidió, qué te toca hacer y lo que casi se te pasa. Después pregúntale lo que quieras.',
    offer: 'Grabación ilimitada desde {own} al mes, con el celular o cualquier grabadora.',
    noPen: '¿Sin lápiz? Funciona con audios o transcripciones de tu celular, Plaud, Pocket o cualquier grabadora.',
    float: { detected: 'Detectado en esta llamada', buyer: 'compradora', todo: 'Enviar tasaciones de Los Dominicos', due: 'Para el viernes', draft: 'Borrador listo', draftTitle: 'Re: estacionamiento antes del sábado', openGmail: 'Abrir en Gmail' },
  },
  wa: {
    title: 'Todo pasa en WhatsApp',
    body: 'Envía la grabación a Juno Pen como cualquier audio. El resumen vuelve al mismo chat, y desde ahí le puedes preguntar por cualquier reunión.',
    me1: 'reunion-directorio.m4a',
    replyTitle: 'Directorio, 42 min',
    reply: 'Aprobaron el presupuesto; Pedro manda la propuesta final el jueves. Falta pedir la cotización de las sillas.',
    me2: '¿Qué dijo Pedro del plazo?',
  },
  audience: {
    h2: 'Para cualquiera que trabaja conversando.',
    sub: 'Pregunta lo que quieras sobre todas tus conversaciones grabadas. Cada respuesta muestra exactamente dónde se dijo.',
    ask: 'Pregunta sobre todas tus grabaciones',
    found: (n) => `${n} reuniones encontradas`,
    aria: 'Para quién es',
    roles: [
      {
        tab: 'Corredores de propiedades',
        short: 'Corredores',
        q: '¿Qué ha dicho {Sofía} del estacionamiento en todas las visitas?',
        a: 'Lo mencionó en las tres visitas [1][2][3]. En Los Dominicos dijo que no ofertarían sin estacionamiento techado [2], y en Ñuñoa lo llamó lo que define la compra [3]. Tomás nunca se opuso a pagar más por eso [1].',
        sources: [
          { title: 'Visita Vitacura', date: '9 sep' },
          { title: 'Visita Los Dominicos', date: '14 sep' },
          { title: 'Recorrido Ñuñoa', date: '21 sep' },
        ],
      },
      {
        tab: 'Estudiantes',
        short: 'Estudiantes',
        q: '¿Qué dijo la profesora Ruiz que entra en la prueba?',
        a: 'Una pregunta de WACC con estructura de capital cambiante [2] y un ejercicio de valoración de bonos como la guía 3 [1]. Dijo que la mayoría pierde puntos en el escudo tributario, no en la fórmula [2], y que se permite hoja de fórmulas [3].',
        sources: [
          { title: 'Finanzas Corporativas, clase 4', date: '10 sep' },
          { title: 'Finanzas Corporativas, clase 6', date: '17 sep' },
          { title: 'Horario de consultas', date: '19 sep' },
        ],
      },
      {
        tab: 'Banca',
        short: 'Banca',
        q: '¿Qué clientes plantearon problemas de covenants este trimestre?',
        a: 'Dos. Logística Austral dijo que el directorio no aprobará nuevas líneas hasta que el apalancamiento baje dos trimestres seguidos [1]. Alimentos Delta pidió recalibrar la cobertura de intereses antes de renovar [3]. Meridian los mencionó, pero dijo que tiene holgura [2].',
        sources: [
          { title: 'Revisión Logística Austral', date: '4 ago' },
          { title: 'Trimestral Meridian', date: '19 ago' },
          { title: 'Renovación Alimentos Delta', date: '2 sep' },
        ],
      },
      {
        tab: 'Fundadores y CEOs',
        short: 'Fundadores',
        q: '¿En qué nos cuestionaron más los inversionistas?',
        a: 'El tamaño de mercado, en tres de cuatro reuniones [1][2][4]. Norte Ventures quería ver retención al mes 6 por canal [3], y dos fondos preguntaron quién más entra en la ronda antes de llevarla a comité [2][4].',
        sources: [
          { title: 'Intro con Austral VC', date: '28 ago' },
          { title: 'Lattice Capital', date: '3 sep' },
          { title: 'Norte Ventures', date: '11 sep' },
          { title: 'Reunión semilla Fieldstone', date: '16 sep' },
        ],
      },
      {
        tab: 'Consultores',
        short: 'Consultores',
        q: '¿A qué se comprometió {Daniela}, y para cuándo?',
        a: 'A tres cosas. Los descuentos por vendedor antes del taller [1], el puente de márgenes del Q3 para el viernes [2], y llevar al gerente de finanzas a la revisión del directorio el día 14 [3].',
        sources: [
          { title: 'Kickoff con el gerente general', date: '1 sep' },
          { title: 'Taller de precios', date: '12 sep' },
          { title: 'Comité de seguimiento', date: '18 sep' },
        ],
      },
    ],
  },
  features: {
    h2: 'Todo lo que viene después de la reunión, ya hecho.',
    sub: 'La minuta, las personas, las tareas, el correo, y un asistente que leyó todas tus conversaciones grabadas.',
    note: {
      title: 'La minuta, escrita para ti',
      copy: 'Quién dijo qué, qué se decidió y qué viene ahora.',
      summaryLabel: 'Resumen',
      summary: 'Tercera visita con los Henríquez. Sofía se enfocó en la cocina remodelada; Tomás fue directo al precio y dijo que está sobre su tope. Pidieron volver el fin de semana con la mamá de ella.',
      actionsLabel: 'Próximos pasos',
      actions: ['Enviar tasaciones de la calle', 'Consultar a la administración por el estacionamiento', 'Confirmar el sábado con su mamá'],
      priority: 'Prioridad',
      decidedLabel: 'Decidido',
      decided: 'Harán una oferta esta semana si el estacionamiento techado se confirma.',
      transcriptLabel: 'Transcripción',
      turns: [
        ['Sofía', 'Nos encanta la cocina. El tema es el estacionamiento.'],
        ['Tú', 'Viene con un estacionamiento techado, atrás.'],
        ['Tomás', 'Entonces querríamos avanzar esta semana.'],
      ],
    },
    people: {
      title: 'Sabe quién estuvo',
      copy: 'Reconoce a las personas que escuchó. Con un clic las guardas, con lo que les importa.',
      name: 'Sofía Henríquez',
      meta: 'Compradora · 3 reuniones',
      about: 'Quiere estacionamiento techado y cocina terminada. Decide el diseño; en el precio se apoya en Tomás.',
      detected: 'Detectado en esta reunión',
      pills: ['+ Tomás · esposo', '+ María · ejecutiva del banco'],
    },
    jot: {
      title: 'Anota tres palabras, recibe la historia completa',
      copy: 'Escribe una nota rápida durante la reunión. Presiona Completar y agrega lo que realmente se dijo.',
      jot: 'otra vez sin bodega',
      enh: 'Tercera propiedad seguida sin bodega. Sofía lo mencionó al pasar, lo que lo vuelve un filtro, no una preferencia.',
      button: 'Completar',
    },
    email: {
      title: 'El correo de seguimiento, ya escrito',
      copy: 'Elige cualquier tarea y recibe el correo. Ábrelo en Gmail u Outlook, edítalo y envíalo.',
      to: 'Para',
      subjectLabel: 'Asunto',
      subject: 'Estacionamiento antes del sábado',
      body: 'Una cosa antes de la segunda visita: la administración sí permite techar el estacionamiento, así que la duda tiene respuesta.',
      gmail: 'Abrir en Gmail',
      outlook: 'Outlook',
    },
    missed: {
      title: 'Lo que casi se te pasa',
      copy: 'La promesa hecha al pasar, el número que nadie dijo.',
      items: [
        ['Pidieron volver con la mamá de ella', 'La señal de compra más fuerte, en los últimos treinta segundos.'],
        ['Prometiste consultar a la administración', 'Lo dijiste en voz alta; fácil de olvidar para el fin de semana.'],
      ],
    },
    home: {
      title: 'Al día con todo',
      copy: 'Todas las tareas abiertas de todas tus reuniones, en un solo lugar.',
      stats: ['pendientes', 'casi se pasan', 'personas'],
      todos: ['Enviarle a Priya los números de retención', 'Escribir por el horario de consultas antes del miércoles'],
    },
    privateTitle: 'Privado desde el diseño',
    privateItems: ['Cifrado en tránsito y en reposo', 'Privado para tu cuenta', 'Borra lo que quieras, cuando quieras', 'Nunca se vende'],
  },
  how: {
    h2: 'Tres pasos, y el segundo es mandar un audio.',
    steps: [
      { h: 'Graba', p: 'Con el celular, una nota de voz o el lápiz. Lo que ya uses sirve.' },
      { h: 'Mándalo por WhatsApp', p: 'Envía el archivo a Juno Pen como cualquier audio. También puedes subirlo en la web.' },
      { h: 'Lee el resumen', p: 'Minutos después: el resumen, las personas, las tareas y el correo para enviar. En el chat o en la app.' },
    ],
  },
  pen: {
    h2: 'Un lápiz que escucha toda la sala.',
    sub: 'En el bolsillo de la camisa o sobre la mesa. Audio claro, batería para la semana y espacio para años de reuniones.',
    open: 'Se abre en el anillo y ahí está el conector USB-C.',
    storageK: 'de almacenamiento',
    storageV: 'Más de 7.000 horas de audio en la calidad más baja. Años de reuniones antes de llenarse.',
    batteryK: 'de grabación por carga',
    batteryV: 'Una semana completa de reuniones entre cargas.',
    specs: [
      { k: 'Micrófono 360°', v: 'Capta todos los lados de la mesa, con reducción de ruido para que las voces se escuchen claras.' },
      { k: 'USB-C integrado', v: 'Se conecta directo al computador, celular o tablet. Sin cables que perder, nada que instalar.' },
      { k: 'Un toque, activado por voz', v: 'Presiona una vez para grabar. El modo voz pausa en los silencios, así las reuniones largas se revisan rápido.' },
      { k: 'Archivos con fecha y hora', v: 'Cada grabación lleva la hora en que empezó. Las largas se dividen y Juno Pen las vuelve a unir.' },
      { k: 'No pierde grabaciones', v: 'Si la batería se agota, guarda la grabación antes de apagarse.' },
      { k: 'También escribe', v: 'Un lápiz pasta de verdad, con repuestos en la caja. Nadie pregunta qué es.' },
    ],
    inBox: 'En la caja: el lápiz, un cable USB-C a USB-A, audífonos, repuestos de tinta y un destornillador pequeño.',
    soon: 'Próximamente en Chile',
    soonBody: 'Estamos trayendo el lápiz. Mientras tanto, Juno funciona con tu celular o cualquier grabadora.',
  },
  pricing: {
    h2: 'Grabación ilimitada en todos los planes.',
    sub: 'Con tu celular o la grabadora que ya tienes. El lápiz llega pronto. Mismo resumen, misma búsqueda, todo igual.',
    tabPen: 'Con el lápiz Juno',
    tabOwn: 'Con tu celular o grabadora',
    tabAria: 'Elige cómo grabas',
    ownSub: 'Tu celular, notas de voz de WhatsApp, Plaud, Pocket o cualquier grabadora que te dé un audio o una transcripción.',
    includedTitle: 'Todos los planes incluyen',
    included: [
      'Grabación ilimitada (uso justo: 100 horas al mes)',
      'Transcripción completa con quién dijo qué',
      'Resumen, decisiones y tareas',
      'Personas detectadas y recordadas',
      'Pregunta sobre todas tus grabaciones con @',
      'Correos de seguimiento redactados',
      'El resumen en WhatsApp y en tu correo después de cada reunión',
      'Notas en el idioma en que hablaste',
    ],
    monthly: 'Mensual',
    halfyear: '6 meses',
    yearly: 'Anual',
    perMonth: 'al mes',
    perHalf: 'cada 6 meses',
    perYear: 'al año',
    penLineMonthly: (t, pen) => `${t} días gratis · lápiz ${pen} una vez`,
    penLineIncluded: (pm) => `${pm} al mes · lápiz incluido`,
    ownLineMonthly: (t) => `${t} días gratis`,
    ownLineHalf: (pm) => `${pm} al mes · se cobra hoy`,
    tradeMonthlyPen: 'Compras el lápiz y puedes cancelar cuando quieras.',
    tradeHalfPen: 'El lápiz va por nuestra cuenta, pagando medio año por adelantado.',
    tradeYearPen: 'El lápiz va por nuestra cuenta, y sale más barato.',
    tradeOwnMonthly: 'Graba con el celular o cualquier grabadora y mándalo por WhatsApp o súbelo.',
    tradeOwnHalf: 'Lo mismo, pagando medio año por adelantado.',
    ribbonPen: 'Lápiz incluido',
    ribbonBest: 'Mejor precio',
    soonTitle: 'El lápiz llega pronto',
    soonBody: 'Estamos trayendo el lápiz Juno a Chile. Déjanos tu correo y te avisamos apenas esté disponible. Mientras tanto, prueba Juno con tu celular.',
    soonCta: 'Avísame cuando llegue',
  },
  closing: { h2: 'Tu próxima reunión, recordada.', sub: (t) => `Pruébalo gratis por ${t} días, con tu celular o cualquier grabadora.` },
  footer: {
    consent: 'Grabar una conversación requiere el permiso de todos en muchos lugares. Juno Pen te pide confirmar el consentimiento antes de procesar cualquier cosa.',
    trademarks: 'Plaud y Pocket son marcas de sus respectivos dueños. Juno Pen no está afiliado a ellas.',
    privacy: 'Privacidad',
    terms: 'Términos',
  },
  switcher: 'Idioma',
}

const PT: Copy = {
  nav: { features: 'O que faz', pen: 'A caneta', pricing: 'Preços', signIn: 'Entrar', home: 'Juno Pen, início' },
  cta: { trialPen: (d) => `Teste ${d} dias grátis`, trialOwn: (d) => `Teste ${d} dias grátis`, yearly: 'Assinar o ano', halfyear: 'Assinar 6 meses', seeWhat: 'Veja o que faz' },
  hero: {
    h1a: 'Mande sua reunião para o Juno no WhatsApp.',
    h1b: 'Ele devolve o resumo.',
    lede: 'Grave com o celular ou com a caneta, envie o áudio pelo WhatsApp e receba quem estava, o que foi decidido, o que você precisa fazer e o que quase passou batido. Depois pergunte o que quiser.',
    offer: 'Gravação ilimitada a partir de {own} por mês, com o celular ou qualquer gravador.',
    noPen: 'Sem caneta? Funciona com áudios ou transcrições do seu celular, Plaud, Pocket ou qualquer gravador.',
    float: { detected: 'Detectado nesta reunião', buyer: 'compradora', todo: 'Enviar avaliações dos Jardins', due: 'Para sexta', draft: 'Rascunho pronto', draftTitle: 'Re: vaga antes de sábado', openGmail: 'Abrir no Gmail' },
  },
  wa: {
    title: 'Tudo acontece no WhatsApp',
    body: 'Envie a gravação para o Juno Pen como qualquer áudio. O resumo volta na mesma conversa, e dali você pode perguntar sobre qualquer reunião.',
    me1: 'reuniao-diretoria.m4a',
    replyTitle: 'Diretoria, 42 min',
    reply: 'Aprovaram o orçamento; Pedro envia a proposta final na quinta. Falta pedir o orçamento das cadeiras.',
    me2: 'O que o Pedro disse sobre o prazo?',
  },
  audience: {
    h2: 'Para quem trabalha conversando.',
    sub: 'Pergunte qualquer coisa sobre todas as conversas que você já gravou. Cada resposta mostra exatamente onde foi dito.',
    ask: 'Pergunte sobre todas as gravações',
    found: (n) => `${n} reuniões encontradas`,
    aria: 'Para quem é',
    roles: [
      {
        tab: 'Corretores de imóveis',
        short: 'Corretores',
        q: 'O que a {Sofia} falou sobre vaga de garagem em todas as visitas?',
        a: 'Ela mencionou nas três visitas [1][2][3]. Nos Jardins disse que não fariam proposta sem vaga coberta [2], e em Pinheiros chamou isso de decisivo [3]. O Tomás nunca se opôs a pagar mais por isso [1].',
        sources: [
          { title: 'Visita Vila Madalena', date: '9 set' },
          { title: 'Visita Jardins', date: '14 set' },
          { title: 'Visita Pinheiros', date: '21 set' },
        ],
      },
      {
        tab: 'Estudantes',
        short: 'Estudantes',
        q: 'O que a professora Ruiz disse que cai na prova?',
        a: 'Uma questão de WACC com estrutura de capital variável [2] e um exercício de precificação de títulos como a lista 3 [1]. Ela disse que a maioria perde pontos no benefício fiscal, não na fórmula [2], e que pode levar folha de fórmulas [3].',
        sources: [
          { title: 'Finanças Corporativas, aula 4', date: '10 set' },
          { title: 'Finanças Corporativas, aula 6', date: '17 set' },
          { title: 'Plantão de dúvidas', date: '19 set' },
        ],
      },
      {
        tab: 'Bancos',
        short: 'Bancos',
        q: 'Quais clientes levantaram problemas de covenants neste trimestre?',
        a: 'Dois. A Logística Sul disse que o conselho não aprova novas linhas até a alavancagem cair por dois trimestres [1]. A Alimentos Delta pediu para recalibrar o índice de cobertura de juros antes da renovação [3]. A Meridian citou covenants, mas disse que tem folga [2].',
        sources: [
          { title: 'Revisão Logística Sul', date: '4 ago' },
          { title: 'Trimestral Meridian', date: '19 ago' },
          { title: 'Renovação Alimentos Delta', date: '2 set' },
        ],
      },
      {
        tab: 'Fundadores e CEOs',
        short: 'Fundadores',
        q: 'Em que os investidores mais questionaram?',
        a: 'Tamanho de mercado, em três de quatro reuniões [1][2][4]. A Norte Ventures queria ver retenção no mês 6 por canal [3], e dois fundos perguntaram quem mais entra na rodada antes de levar ao comitê [2][4].',
        sources: [
          { title: 'Intro com Sul VC', date: '28 ago' },
          { title: 'Lattice Capital', date: '3 set' },
          { title: 'Norte Ventures', date: '11 set' },
          { title: 'Reunião seed Fieldstone', date: '16 set' },
        ],
      },
      {
        tab: 'Consultores',
        short: 'Consultores',
        q: 'Com o que a {Daniela} se comprometeu, e até quando?',
        a: 'Três coisas. Os descontos por vendedor antes do workshop [1], a ponte de margens do 3º trimestre até sexta [2], e levar o diretor financeiro à revisão do conselho no dia 14 [3].',
        sources: [
          { title: 'Kickoff com o diretor geral', date: '1 set' },
          { title: 'Workshop de preços', date: '12 set' },
          { title: 'Comitê de acompanhamento', date: '18 set' },
        ],
      },
    ],
  },
  features: {
    h2: 'Tudo o que vem depois da reunião, já feito.',
    sub: 'A ata, as pessoas, as tarefas, o e-mail, e um assistente que leu todas as conversas que você já gravou.',
    note: {
      title: 'A ata, escrita para você',
      copy: 'Quem disse o quê, o que foi decidido e o que vem agora.',
      summaryLabel: 'Resumo',
      summary: 'Terceira visita com os Henriques. Sofia focou na cozinha reformada; Tomás foi direto ao preço e disse que está acima do teto deles. Pediram para voltar no fim de semana com a mãe dela.',
      actionsLabel: 'Próximos passos',
      actions: ['Enviar avaliações da rua', 'Consultar o condomínio sobre a vaga', 'Confirmar sábado com a mãe dela'],
      priority: 'Prioridade',
      decidedLabel: 'Decidido',
      decided: 'Vão fazer uma proposta esta semana se a vaga coberta se confirmar.',
      transcriptLabel: 'Transcrição',
      turns: [
        ['Sofia', 'Amamos a cozinha. A questão é a vaga.'],
        ['Você', 'Tem uma vaga coberta com o apartamento, nos fundos.'],
        ['Tomás', 'Então queremos avançar esta semana.'],
      ],
    },
    people: {
      title: 'Sabe quem estava lá',
      copy: 'Identifica as pessoas que ouviu. Com um clique você salva, com o que importa para cada uma.',
      name: 'Sofia Henriques',
      meta: 'Compradora · 3 reuniões',
      about: 'Quer vaga coberta e cozinha pronta. Decide o design; no preço, confia no Tomás.',
      detected: 'Detectado nesta reunião',
      pills: ['+ Tomás · marido', '+ Maria · gerente do banco'],
    },
    jot: {
      title: 'Anote três palavras, receba a história inteira',
      copy: 'Escreva uma nota rápida durante a reunião. Aperte Completar e ele acrescenta o que foi dito de verdade.',
      jot: 'de novo sem depósito',
      enh: 'Terceiro imóvel seguido sem depósito. Sofia comentou de passagem, o que faz disso um filtro, não uma preferência.',
      button: 'Completar',
    },
    email: {
      title: 'O e-mail de acompanhamento, já escrito',
      copy: 'Escolha qualquer tarefa e receba o e-mail. Abra no Gmail ou Outlook, edite e envie.',
      to: 'Para',
      subjectLabel: 'Assunto',
      subject: 'Vaga antes de sábado',
      body: 'Uma coisa antes da segunda visita: o condomínio permite cobrir a vaga, então essa dúvida tem resposta.',
      gmail: 'Abrir no Gmail',
      outlook: 'Outlook',
    },
    missed: {
      title: 'O que quase passou batido',
      copy: 'A promessa feita de passagem, o número que ninguém disse.',
      items: [
        ['Pediram para voltar com a mãe dela', 'O sinal de compra mais forte, nos últimos trinta segundos.'],
        ['Você prometeu consultar o condomínio', 'Dito em voz alta, fácil de esquecer até o fim de semana.'],
      ],
    },
    home: {
      title: 'Em dia com tudo',
      copy: 'Todas as tarefas abertas de todas as reuniões, num só lugar.',
      stats: ['pendentes', 'quase passaram', 'pessoas'],
      todos: ['Mandar para a Priya os números de retenção', 'Escrever sobre o plantão de dúvidas até quarta'],
    },
    privateTitle: 'Privado desde o início',
    privateItems: ['Criptografado em trânsito e em repouso', 'Privado para a sua conta', 'Apague o que quiser, quando quiser', 'Nunca vendido'],
  },
  how: {
    h2: 'Três passos, e o segundo é mandar um áudio.',
    steps: [
      { h: 'Grave', p: 'Com o celular, uma mensagem de voz ou a caneta. O que você já usa serve.' },
      { h: 'Mande pelo WhatsApp', p: 'Envie o arquivo para o Juno Pen como qualquer áudio. Também dá para enviar pelo site.' },
      { h: 'Leia o resumo', p: 'Minutos depois: o resumo, as pessoas, as tarefas e o e-mail para enviar. Na conversa ou no app.' },
    ],
  },
  pen: {
    h2: 'Uma caneta que ouve a sala inteira.',
    sub: 'No bolso da camisa ou em cima da mesa. Áudio claro, bateria para a semana e espaço para anos de reuniões.',
    open: 'Abre no anel e o conector USB-C está ali.',
    storageK: 'de armazenamento',
    storageV: 'Mais de 7.000 horas de áudio na menor qualidade. Anos de reuniões antes de encher.',
    batteryK: 'de gravação por carga',
    batteryV: 'Uma semana inteira de reuniões entre cargas.',
    specs: [
      { k: 'Microfone 360°', v: 'Capta todos os lados da mesa, com redução de ruído para as vozes saírem limpas.' },
      { k: 'USB-C embutido', v: 'Conecta direto no computador, celular ou tablet. Sem cabo para perder, nada para instalar.' },
      { k: 'Um toque, ativado por voz', v: 'Aperte uma vez para gravar. O modo voz pausa nos silêncios, então reuniões longas ficam rápidas de revisar.' },
      { k: 'Arquivos com data e hora', v: 'Cada gravação leva o horário em que começou. As longas se dividem e o Juno Pen junta de novo.' },
      { k: 'Não perde gravações', v: 'Se a bateria acaba, salva a gravação antes de desligar.' },
      { k: 'Também escreve', v: 'Uma caneta esferográfica de verdade, com refis na caixa. Ninguém pergunta o que é.' },
    ],
    inBox: 'Na caixa: a caneta, um cabo USB-C para USB-A, fones de ouvido, refis de tinta e uma chave de fenda pequena.',
    soon: 'Em breve no Brasil',
    soonBody: 'Estamos trazendo a caneta. Enquanto isso, o Juno funciona com o seu celular ou qualquer gravador.',
  },
  pricing: {
    h2: 'Gravação ilimitada em todos os planos.',
    sub: 'Com o seu celular ou o gravador que você já tem. A caneta chega em breve. Mesmo resumo, mesma busca, tudo igual.',
    tabPen: 'Com a caneta Juno',
    tabOwn: 'Com seu celular ou gravador',
    tabAria: 'Escolha como você grava',
    ownSub: 'Seu celular, mensagens de voz do WhatsApp, Plaud, Pocket ou qualquer gravador que gere um áudio ou uma transcrição.',
    includedTitle: 'Todos os planos incluem',
    included: [
      'Gravação ilimitada (uso justo: 100 horas por mês)',
      'Transcrição completa com quem disse o quê',
      'Resumo, decisões e tarefas',
      'Pessoas identificadas e lembradas',
      'Pergunte sobre todas as gravações com @',
      'E-mails de acompanhamento redigidos',
      'O resumo no WhatsApp e no seu e-mail depois de cada reunião',
      'Notas no idioma em que você falou',
    ],
    monthly: 'Mensal',
    halfyear: '6 meses',
    yearly: 'Anual',
    perMonth: 'por mês',
    perHalf: 'a cada 6 meses',
    perYear: 'por ano',
    penLineMonthly: (t, pen) => `${t} dias grátis · caneta ${pen} uma vez`,
    penLineIncluded: (pm) => `${pm} por mês · caneta incluída`,
    ownLineMonthly: (t) => `${t} dias grátis`,
    ownLineHalf: (pm) => `${pm} por mês · cobrado hoje`,
    tradeMonthlyPen: 'Você compra a caneta e pode cancelar quando quiser.',
    tradeHalfPen: 'A caneta é por nossa conta, pagando meio ano adiantado.',
    tradeYearPen: 'A caneta é por nossa conta, e sai mais barato.',
    tradeOwnMonthly: 'Grave com o celular ou qualquer gravador e mande pelo WhatsApp ou envie pelo site.',
    tradeOwnHalf: 'O mesmo, pagando meio ano adiantado.',
    ribbonPen: 'Caneta incluída',
    ribbonBest: 'Melhor preço',
    soonTitle: 'A caneta chega em breve',
    soonBody: 'Estamos trazendo a caneta Juno para o Brasil. Deixe seu e-mail e avisamos assim que estiver disponível. Enquanto isso, teste o Juno com o seu celular.',
    soonCta: 'Avise-me quando chegar',
  },
  closing: { h2: 'Sua próxima reunião, lembrada.', sub: (t) => `Teste grátis por ${t} dias, com o celular ou qualquer gravador.` },
  footer: {
    consent: 'Gravar uma conversa exige a permissão de todos em muitos lugares. O Juno Pen pede que você confirme o consentimento antes de processar qualquer coisa.',
    trademarks: 'Plaud e Pocket são marcas de seus respectivos donos. O Juno Pen não é afiliado a elas.',
    privacy: 'Privacidade',
    terms: 'Termos',
  },
  switcher: 'Idioma',
}

export const COPY: Record<Lang, Copy> = { en: EN, es: ES, pt: PT }
