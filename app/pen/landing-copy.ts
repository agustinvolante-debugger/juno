// The landing page's fixed words (nav, pricing, the pen, footer), in the three languages it is
// sold in. The examples that change with the chosen audience live in landing-audiences.ts.
//
// One layout, three copies of the words: a design change lands in all of them at once, and a
// translation can never drift into a different page. Spanish is neutral Latin American (tú);
// Portuguese is Brazilian. The demo scenes are localised, not just translated, so a Chilean
// reader sees a Chilean-sounding viewing rather than "Maple Avenue" in Spanish.
//
// Copy rules kept across all three: one label per call to action, no em dashes in anything a
// reader sees, and no claim the product cannot stand behind.

import type { Lang, Currency } from '@/lib/pen/currency'
export type { Lang, Currency } from '@/lib/pen/currency'
export { LOCAL_PRICES, money } from '@/lib/pen/currency'
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

export type RoleDemo = { tab: string; short: string; q: string; a: string; sources: { title: string; date: string }[] }

export type Copy = {
  nav: { features: string; pen: string; pricing: string; signIn: string; home: string }
  /** No free trial and no 6-month plan (15 Oct): `start` is the one "get it" label; the plan
   *  cards carry their own. */
  cta: { start: string; monthly: string; yearly: string; seeWhat: string }
  hero: { noPen: string }
  audience: { ask: string; found: (n: number) => string; aria: string }
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
    yearly: string
    perMonth: string
    perYear: string
    /** Under the price on a card with the pen: "+ $65 once for the pen". */
    plusPen: (pen: string) => string
    /** The pen, wherever it is offered on its own (specs, the scroll scene). */
    penLine: (pen: string) => string
    lineMonthly: string
    lineYearly: (perMonth: string) => string
    tradeMonthlyPen: string
    tradeYearPen: string
    tradeOwnMonthly: string
    tradeOwnYear: string
    ribbonBest: string
    soonTitle: string
    soonBody: string
    soonCta: string
  }
  closing: { h2: string; sub: string }
  footer: { consent: string; trademarks: string; privacy: string; terms: string }
  switcher: string
}

const EN: Copy = {
  nav: { features: 'What it does', pen: 'The pen', pricing: 'Pricing', signIn: 'Sign in', home: 'Juno Pen, home' },
  cta: { start: 'Get Juno Pen', monthly: 'Start monthly', yearly: 'Get the year', seeWhat: 'See what it does' },
  hero: {
    noPen: 'No pen? Bring audio or transcripts from your phone, Plaud, Pocket or any recorder.',
  },
  audience: {
    ask: 'Ask across every recording',
    found: (n) => `${n} calls found`,
    aria: 'Who it is for',
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
    sub: 'The software is one price. The pen is an optional add-on, paid once, with either plan.',
    tabPen: 'Software + pen',
    tabOwn: 'Software only',
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
    yearly: 'Yearly',
    perMonth: 'a month',
    perYear: 'a year',
    plusPen: (pen) => `+ ${pen} once for the pen`,
    penLine: (pen) => `The pen: ${pen} once, with either plan`,
    lineMonthly: 'Cancel any month',
    lineYearly: (pm) => `${pm} a month · paid upfront`,
    tradeMonthlyPen: 'We ship the pen to your address. Cancel the plan any month.',
    tradeYearPen: 'A year paid upfront, the pen shipped to your address.',
    tradeOwnMonthly: 'Record on your phone or any recorder and upload the file.',
    tradeOwnYear: 'The same, a year at a time, and it works out cheapest.',
    ribbonBest: 'Best value',
    soonTitle: '',
    soonBody: '',
    soonCta: '',
  },
  closing: { h2: 'Your next meeting, remembered.', sub: 'Start on your phone today. Add the pen whenever you like.' },
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
  cta: { start: 'Empieza ahora', monthly: 'Empezar mensual', yearly: 'Contratar el año', seeWhat: 'Mira qué hace' },
  hero: {
    noPen: '¿Sin lápiz? Funciona con audios o transcripciones de tu celular, Plaud, Pocket o cualquier grabadora.',
  },
  audience: {
    ask: 'Pregunta sobre todas tus grabaciones',
    found: (n) => `${n} reuniones encontradas`,
    aria: 'Para quién es',
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
    yearly: 'Anual',
    perMonth: 'al mes',
    perYear: 'al año',
    plusPen: (pen) => `+ ${pen} una vez por el lápiz`,
    penLine: (pen) => `El lápiz: ${pen} una vez, con cualquier plan`,
    lineMonthly: 'Cancela cuando quieras',
    lineYearly: (pm) => `${pm} al mes · pago por adelantado`,
    tradeMonthlyPen: 'Te enviamos el lápiz a tu dirección. Cancela el plan cuando quieras.',
    tradeYearPen: 'Un año pagado por adelantado, y el lápiz enviado a tu dirección.',
    tradeOwnMonthly: 'Graba con el celular o cualquier grabadora y mándalo por WhatsApp o súbelo.',
    tradeOwnYear: 'Lo mismo, pagando un año, y sale más barato.',
    ribbonBest: 'Mejor precio',
    soonTitle: 'El lápiz llega pronto',
    soonBody: 'Estamos trayendo el lápiz Juno a Chile. Déjanos tu correo y te avisamos apenas esté disponible. Mientras tanto, prueba Juno con tu celular.',
    soonCta: 'Avísame cuando llegue',
  },
  closing: { h2: 'Tu próxima reunión, recordada.', sub: 'Empieza hoy con tu celular o cualquier grabadora.' },
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
  cta: { start: 'Comece agora', monthly: 'Assinar mensal', yearly: 'Assinar o ano', seeWhat: 'Veja o que faz' },
  hero: {
    noPen: 'Sem caneta? Funciona com áudios ou transcrições do seu celular, Plaud, Pocket ou qualquer gravador.',
  },
  audience: {
    ask: 'Pergunte sobre todas as gravações',
    found: (n) => `${n} reuniões encontradas`,
    aria: 'Para quem é',
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
    yearly: 'Anual',
    perMonth: 'por mês',
    perYear: 'por ano',
    plusPen: (pen) => `+ ${pen} uma vez pela caneta`,
    penLine: (pen) => `A caneta: ${pen} uma vez, com qualquer plano`,
    lineMonthly: 'Cancele quando quiser',
    lineYearly: (pm) => `${pm} por mês · pago adiantado`,
    tradeMonthlyPen: 'Enviamos a caneta para o seu endereço. Cancele o plano quando quiser.',
    tradeYearPen: 'Um ano pago adiantado, e a caneta enviada para o seu endereço.',
    tradeOwnMonthly: 'Grave com o celular ou qualquer gravador e mande pelo WhatsApp ou envie pelo site.',
    tradeOwnYear: 'O mesmo, pagando um ano, e sai mais barato.',
    ribbonBest: 'Melhor preço',
    soonTitle: 'A caneta chega em breve',
    soonBody: 'Estamos trazendo a caneta Juno para o Brasil. Deixe seu e-mail e avisamos assim que estiver disponível. Enquanto isso, teste o Juno com o seu celular.',
    soonCta: 'Avise-me quando chegar',
  },
  closing: { h2: 'Sua próxima reunião, lembrada.', sub: 'Comece hoje com o celular ou qualquer gravador.' },
  footer: {
    consent: 'Gravar uma conversa exige a permissão de todos em muitos lugares. O Juno Pen pede que você confirme o consentimento antes de processar qualquer coisa.',
    trademarks: 'Plaud e Pocket são marcas de seus respectivos donos. O Juno Pen não é afiliado a elas.',
    privacy: 'Privacidade',
    terms: 'Termos',
  },
  switcher: 'Idioma',
}

export const COPY: Record<Lang, Copy> = { en: EN, es: ES, pt: PT }
