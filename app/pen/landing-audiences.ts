// The landing page's examples, one set per audience, in the three languages it is sold in.
//
// The page speaks to anyone who has conversations worth remembering: people who sell, students,
// families looking after someone's health, founders and teams. Picking an audience (the tabs,
// or ?for= in the URL) swaps every example on the page, from the hero cards to the WhatsApp
// thread, so a student never has to read a house viewing to see what it does for them.
//
// Same rules as landing-copy.ts: no em dashes, no claim the product cannot stand behind. The
// WhatsApp threads only show things the bot really does today (answers, to-dos, a draft sent on
// "send it", and reminders within the day, since WhatsApp only allows those within 24 hours).

import type { Lang, RoleDemo } from './landing-copy'

export type AudKey = 'sales' | 'students' | 'family' | 'founders'

/** ?for= values that pick each audience (read on the server in app/pen/page.tsx). The Orlando
 *  emails link with ?for=realtor. */
export const AUD_PARAM: Record<string, AudKey> = {
  sales: 'sales', realtor: 'sales', realtors: 'sales', realestate: 'sales',
  student: 'students', students: 'students',
  family: 'family', health: 'family', care: 'family',
  founder: 'founders', founders: 'founders', team: 'founders', teams: 'founders',
}

export type Kit = {
  key: AudKey
  tab: string
  short: string
  /** One line under the tabs: what it does for this person. */
  promise: string
  hero: { who: string; initials: string; role: string; todo: string; due: string; draftTitle: string }
  demo: RoleDemo
  /** The WhatsApp thread, top to bottom. `file` is the recording sent in. */
  wa: { file: string; fileMeta: string; msgs: ['me' | 'bot', string][] }
  today: { due: [string, string][]; waiting: [string, string][] }
  note: { title: string; summary: string; actions: [string, string, string]; people: [string, string][] }
  missed: [string, string][]
  email: { to: string; subject: string; body: string }
  /** The recording-to-note animation beside "How it works". */
  seq: { title: string; turns: [string, string][]; decided: string; missed: string }
}

export type Plus = {
  hero: { h1a: string; h1b: string; lede: string; seeWa: string; draft: string }
  aud: { h2: string; sub: string }
  film: { h2: string; sub: string; pause: string; play: string }
  how: { h2: string; steps: { h: string; p: string }[]; labels: { recording: string; decided: string; missed: string } }
  wa: { h2: string; sub: string; status: string }
  today: { h2: string; sub: string; title: string; due: string; waiting: string; mine: string; date: string }
  feat: {
    h2: string
    sub: string
    noteTitle: string
    noteCopy: string
    summary: string
    actions: string
    people: string
    missedTitle: string
    missedCopy: string
    emailTitle: string
    emailCopy: string
    to: string
    subject: string
    sendBtn: string
    ownBtn: string
  }
  priv: { h2: string; sub: string; question: string; agree: string; items: [string, string, string, string] }
  pen: { specs: [string, string, string, string]; allSpecs: string }
  faq: { h2: string; items: [string, string][] }
}

/* ================================================================ English */

const EN_KITS: Kit[] = [
  {
    key: 'sales',
    tab: 'Sales & real estate',
    short: 'Sales',
    promise: 'Every client’s must-haves remembered, and the follow-up written before you reach the car.',
    hero: { who: 'Mark Ellis', initials: 'ME', role: 'buyer', todo: 'Send comps for Ridgewood', due: 'Due Friday', draftTitle: 'Re: carport before Saturday' },
    demo: {
      tab: 'Sales & real estate',
      short: 'Sales',
      q: 'What has {Sarah} said about parking across all the viewings?',
      a: 'She has raised it at all three viewings [1][2][3]. At Oak Street she said they would not bid without covered parking [2], and at Ridgewood she called it the thing that decides it [3]. Tom has never objected to paying more for it [1].',
      sources: [
        { title: 'Maple Avenue viewing', date: 'Sep 9' },
        { title: 'Oak Street viewing', date: 'Sep 14' },
        { title: 'Ridgewood walk-through', date: 'Sep 21' },
      ],
    },
    wa: {
      file: 'R20260922-213209.WAV',
      fileMeta: '38 min',
      msgs: [
        ['bot', '*Maple Avenue viewing*\nSarah loved the kitchen; Tom balked at the price. Second viewing Saturday.'],
        ['me', 'What do I still owe the Hendersons?'],
        ['bot', '• Send comps for the street (Friday)\n• Check the HOA on the carport'],
        ['me', 'Draft a follow-up to Tom about the carport'],
        ['bot', '✉️ *To:* Tom Henderson\n*Subject:* Carport before Saturday\n\nQuick one before the second viewing: the HOA allows the carport to be enclosed.'],
        ['me', 'send it'],
        ['bot', 'Sent to Tom. A copy is in your inbox, and replies come to you.'],
        ['me', 'Remind me at 5 to call the lender'],
        ['bot', '⏰ Done. I’ll remind you at 5:00 pm.'],
      ],
    },
    today: {
      due: [['Send comps for Ridgewood', 'Today'], ['Confirm Saturday’s viewing', 'Overdue · Tue']],
      waiting: [['The offer letter draft', 'Sarah Henderson'], ['Proof of funds', 'Maria, lender']],
    },
    note: {
      title: 'Maple Avenue viewing',
      summary: 'Third viewing with the Hendersons. Sarah led on the renovated kitchen; Tom went straight to price and flagged it as above their ceiling. They asked to return at the weekend with her mother.',
      actions: ['Send comps for the street', 'Check the HOA on the carport', 'Confirm Saturday with her mother'],
      people: [['Sarah Henderson', 'buyer'], ['Tom Henderson', 'buyer'], ['Maria', 'lender']],
    },
    missed: [
      ['They asked to come back with her mother', 'The strongest buying signal, in the last thirty seconds.'],
      ['You promised to check the HOA', 'Said aloud, easy to forget by the weekend.'],
    ],
    email: { to: 'tom.henderson@gmail.com', subject: 'Carport before Saturday', body: 'Quick one before the second viewing: the HOA does allow the carport to be enclosed, so the garage question has an answer.' },
    seq: { title: 'Ridgewood walk-through', turns: [['A', 'We love the kitchen. The parking is the thing.'], ['B', 'There is a covered spot with the unit, round the back.'], ['A', 'Then we would want to move on it this week.']], decided: 'They will offer this week, subject to seeing the covered parking.', missed: 'Covered parking has now come up at all three viewings.' },
  },
  {
    key: 'students',
    tab: 'Students',
    short: 'Students',
    promise: 'Listen in the lecture. Ask later what will be on the exam.',
    hero: { who: 'Prof. Ruiz', initials: 'PR', role: 'lecturer', todo: 'Redo problem set 3', due: 'Before Thursday', draftTitle: 'Re: office hours before the midterm' },
    demo: {
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
    wa: {
      file: 'corporate-finance-lecture-6.m4a',
      fileMeta: '74 min',
      msgs: [
        ['bot', '*Corporate Finance, lecture 6*\nWACC with a changing capital structure. Midterm on the 24th; formula sheet allowed.'],
        ['me', 'What will be on the midterm?'],
        ['bot', 'One WACC question and a bond pricing problem like problem set 3. Most people lose marks on the tax shield.'],
        ['me', 'Draft an email to Prof. Ruiz about office hours'],
        ['bot', '✉️ *To:* Prof. Ruiz\n*Subject:* Office hours before the midterm\n\nCould I come by on Wednesday to go over the tax shield example?'],
        ['me', 'send it'],
        ['bot', 'Sent to Prof. Ruiz. A copy is in your inbox.'],
        ['me', 'Remind me at 8 tonight to redo problem set 3'],
        ['bot', '⏰ Done. I’ll remind you at 8:00 pm.'],
      ],
    },
    today: {
      due: [['Redo problem set 3', 'Today'], ['Read chapter 9 before the lecture', 'Tomorrow']],
      waiting: [['Slides for the group project', 'Ana and Leo'], ['Lab report corrections', 'Dr. Kim']],
    },
    note: {
      title: 'Corporate Finance, lecture 6',
      summary: 'WACC when the capital structure changes over time. Professor Ruiz worked two examples and said the midterm will look like the second one. Formula sheet and calculators allowed.',
      actions: ['Redo problem set 3', 'Read chapter 9', 'Email Ruiz about office hours'],
      people: [['Prof. Ruiz', 'lecturer'], ['Ana', 'study group']],
    },
    missed: [
      ['The midterm moved to the 24th', 'Mentioned once, while everyone was packing up.'],
      ['Problem 4 is optional', 'Said in passing: skip it if you are short on time.'],
    ],
    email: { to: 'ruiz@university.edu', subject: 'Office hours before the midterm', body: 'Hi Professor Ruiz, could I come by your office hours on Wednesday to go over the tax shield example from lecture 6? Thank you.' },
    seq: { title: 'Corporate Finance, lecture 6', turns: [['Ruiz', 'The midterm will look like this second example.'], ['Ana', 'Can we bring a formula sheet?'], ['Ruiz', 'Yes, one page. And the exam moved to the 24th.']], decided: 'Midterm on the 24th, one-page formula sheet allowed.', missed: 'The date change was said once, at the very end.' },
  },
  {
    key: 'family',
    tab: 'Family & health',
    short: 'Family',
    promise: 'What the doctor said, in plain words on WhatsApp, with a reminder when it matters.',
    hero: { who: 'Dr. Patel', initials: 'DP', role: 'cardiologist', todo: 'Take the new dose with food', due: 'Every morning', draftTitle: 'What Dr. Patel said today' },
    demo: {
      tab: 'Family & health',
      short: 'Family',
      q: 'What did the doctor say about the new dose?',
      a: 'Take 5 mg every morning with food, starting Monday [2]. Dizziness in the first week is normal, but call the clinic if it lasts more than three days [2]. Blood test again in six weeks [3], and no grapefruit while on it [1].',
      sources: [
        { title: 'Cardiology check-up', date: 'Aug 30' },
        { title: 'Follow-up with Dr. Patel', date: 'Sep 20' },
        { title: 'Call with the clinic', date: 'Sep 22' },
      ],
    },
    wa: {
      file: 'doctor-visit.m4a',
      fileMeta: '22 min',
      msgs: [
        ['bot', '*Follow-up with Dr. Patel*\nNew dose: 5 mg every morning with food. Blood test in six weeks.'],
        ['me', 'What did the doctor say about feeling dizzy?'],
        ['bot', 'It is normal in the first week. Call the clinic if it lasts more than three days.'],
        ['me', 'Send my daughter a summary of what the doctor said'],
        ['bot', '✉️ *To:* Laura\n*Subject:* What Dr. Patel said today\n\nThe new dose is 5 mg every morning with food, from Monday. Blood test in six weeks.'],
        ['me', 'send it'],
        ['bot', 'Sent to Laura. A copy is in your inbox.'],
        ['me', 'Remind me in an hour to call the pharmacy'],
        ['bot', '⏰ Done. I’ll remind you at 11:30 am.'],
      ],
    },
    today: {
      due: [['Take the new dose with food', 'Today, 8:00 am'], ['Call the pharmacy about the refill', 'Today']],
      waiting: [['The blood test results', 'Dr. Patel'], ['How the visit went', 'Laura, daughter']],
    },
    note: {
      title: 'Follow-up with Dr. Patel',
      summary: 'Blood pressure is better but not there yet. Dr. Patel raised the dose to 5 mg, every morning with food, starting Monday. Some dizziness in the first week is expected.',
      actions: ['Start 5 mg on Monday, with food', 'Book the blood test in six weeks', 'Call if dizzy for more than three days'],
      people: [['Dr. Patel', 'cardiologist'], ['Laura', 'daughter']],
    },
    missed: [
      ['No grapefruit while on this medicine', 'Said once, at the very end of the visit.'],
      ['Bring the old pills to the next visit', 'Easy to forget in six weeks.'],
    ],
    email: { to: 'laura@gmail.com', subject: 'What Dr. Patel said today', body: 'Hi Laura, the visit went well. The new dose is 5 mg every morning with food, from Monday, and the blood test is in six weeks. I will call you tonight.' },
    seq: { title: 'Follow-up with Dr. Patel', turns: [['Dr. Patel', 'Let’s go up to 5 mg, every morning with food.'], ['You', 'And if I feel dizzy?'], ['Dr. Patel', 'Normal for a week. Call us if it lasts longer.']], decided: '5 mg every morning with food, from Monday.', missed: 'No grapefruit while on it. She said it once, at the door.' },
  },
  {
    key: 'founders',
    tab: 'Founders & teams',
    short: 'Founders',
    promise: 'Every commitment from every call, with who promised it and by when.',
    hero: { who: 'Priya Shah', initials: 'PS', role: 'investor', todo: 'Send month-6 retention', due: 'Due Wednesday', draftTitle: 'Re: retention numbers' },
    demo: {
      tab: 'Founders & teams',
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
    wa: {
      file: 'northbeam-partner-call.m4a',
      fileMeta: '41 min',
      msgs: [
        ['bot', '*Northbeam Ventures*\nThey liked the traction and want month-6 retention by channel before Monday’s partner meeting.'],
        ['me', 'What do I owe Priya?'],
        ['bot', '• Month-6 retention by channel (Wednesday)\n• The intro to our design partner'],
        ['me', 'Draft a follow-up to Priya with the next steps'],
        ['bot', '✉️ *To:* Priya Shah\n*Subject:* Retention numbers\n\nThanks for today. Month-6 retention by channel will be with you by Wednesday.'],
        ['me', 'send it'],
        ['bot', 'Sent to Priya. A copy is in your inbox, and replies come to you.'],
        ['me', 'Remind me in 2 hours to pull the cohort data'],
        ['bot', '⏰ Done. I’ll remind you at 4:00 pm.'],
      ],
    },
    today: {
      due: [['Send month-6 retention by channel', 'Today'], ['Update the data room', 'Overdue · Mon']],
      waiting: [['The intro to our design partner', 'Priya Shah'], ['The pricing proposal', 'Dana, Acme']],
    },
    note: {
      title: 'Northbeam Ventures, partner call',
      summary: 'Strong interest after the demo. Priya pushed on market size and asked for month-6 retention by channel. She wants to take it to Monday’s partner meeting.',
      actions: ['Send retention by channel', 'Intro to the design partner', 'Share the updated deck'],
      people: [['Priya Shah', 'investor'], ['Tom Reid', 'partner']],
    },
    missed: [
      ['She asked who else is in the round', 'The question a partner meeting turns on.'],
      ['You promised the deck by Friday', 'Said while wrapping up.'],
    ],
    email: { to: 'priya@northbeam.vc', subject: 'Retention numbers', body: 'Thanks for today, Priya. Month-6 retention by channel will be with you by Wednesday, and I will send the intro to our design partner tomorrow.' },
    seq: { title: 'Northbeam Ventures', turns: [['Priya', 'Market size is the question for our partners.'], ['You', 'We can show retention by channel.'], ['Priya', 'Send month-6 by Wednesday and I’ll take it Monday.']], decided: 'Retention by channel to Priya by Wednesday.', missed: 'She asked who else is in the round. Nobody answered.' },
  },
]

const EN_PLUS: Plus = {
  hero: {
    h1a: 'Say it once.',
    h1b: 'Juno remembers it.',
    lede: 'Record any conversation with the pen or your phone: a meeting, a lecture, a doctor’s visit. You get the notes, your to-dos and the follow-up, in the app or on WhatsApp.',
    seeWa: 'See it on WhatsApp',
    draft: 'Draft ready',
  },
  film: { h2: 'Fifteen seconds, start to finish.', sub: 'Click, talk, and the notes are on your phone before you reach the car.', pause: 'Pause', play: 'Play' },
  aud: { h2: 'Made for whoever you talk to.', sub: 'Pick yours. Every example on this page changes with it.' },
  how: {
    h2: 'Three steps. Nothing to set up.',
    steps: [
      { h: 'Record', p: 'Press once on the pen and put it in your pocket. Or use your phone, or any recorder you already have.' },
      { h: 'Send it in', p: 'Plug the pen in, upload the file, or send it on WhatsApp like any voice note.' },
      { h: 'Read, then ask', p: 'Minutes later: the note, your to-dos and the follow-up. Ask it anything after that.' },
    ],
    labels: { recording: 'recording', decided: 'Decided', missed: 'Nearly missed' },
  },
  wa: {
    h2: 'It lives in your WhatsApp.',
    sub: 'Send the recording like any voice note. Then ask what you owe, send the follow-up and set a reminder, all from the chat. No app to learn.',
    status: 'online',
  },
  today: {
    h2: 'Open it and know what today needs.',
    sub: 'What is due, and who is waiting on you. Only your own to-dos, not everything everyone else promised.',
    title: 'Today',
    due: 'Due',
    waiting: 'Waiting on you',
    mine: 'Only yours',
    date: 'Tuesday, Sep 30',
  },
  feat: {
    h2: 'After every conversation, already written.',
    sub: 'The note, the thing you nearly missed, and the email to send.',
    noteTitle: 'Written up for you',
    noteCopy: 'Who was there, what was decided, and what you do next.',
    summary: 'Summary',
    actions: 'Your next actions',
    people: 'Who was there',
    missedTitle: 'What you nearly missed',
    missedCopy: 'The promise made in passing, the detail said once.',
    emailTitle: 'The follow-up, already written',
    emailCopy: 'Send it from Juno, or open it in your own email.',
    to: 'To',
    subject: 'Subject',
    sendBtn: 'Send it',
    ownBtn: 'Open in my email',
  },
  priv: {
    h2: 'It asks before it listens.',
    sub: 'Nothing is processed until you confirm everyone agreed to be recorded. After that, it stays yours.',
    question: 'Did everyone on this recording agree to be recorded?',
    agree: 'Everyone agreed',
    items: ['Encrypted in transit and at rest', 'Private to your account', 'Delete anything, anytime', 'Never sold'],
  },
  pen: { specs: ['360° microphone', 'USB-C built in', 'One touch, voice activated', 'A real ballpoint'], allSpecs: 'All the specs' },
  faq: {
    h2: 'Questions',
    items: [
      ['Do I need the pen?', 'No. The own-recorder plan works with your phone, WhatsApp voice notes, Plaud, Pocket, or any recorder that gives you an audio file or a transcript.'],
      ['Is it legal to record a conversation?', 'It depends where you are. Many places, Florida included, need everyone’s permission. Juno Pen asks you to confirm consent before it processes anything, so asking becomes part of the habit.'],
      ['What languages does it understand?', 'It transcribes English, Spanish, Portuguese and many other languages. The app, the emails and WhatsApp work in English, Spanish and Portuguese, and notes come back in the language you spoke unless you pick another.'],
      ['How long until the notes are ready?', 'Usually a few minutes after the recording arrives. They land in the app and your inbox, and back in WhatsApp if you sent it there.'],
      ['Who can hear my recordings?', 'Only you. Recordings are encrypted in transit and at rest, private to your account, and never sold. Delete one and it is gone, including the transcription service’s copy.'],
      ['Can I cancel?', 'Yes, any time, from Settings. Monthly plans can also be paused for 30, 60 or 90 days.'],
    ],
  },
}

/* ================================================================ Español */

const ES_KITS: Kit[] = [
  {
    key: 'sales',
    tab: 'Ventas y propiedades',
    short: 'Ventas',
    promise: 'Lo que cada cliente necesita, recordado, y el correo de seguimiento escrito antes de llegar al auto.',
    hero: { who: 'Sofía Rojas', initials: 'SR', role: 'compradora', todo: 'Enviar tasaciones de Los Dominicos', due: 'Para el viernes', draftTitle: 'Re: estacionamiento antes del sábado' },
    demo: {
      tab: 'Ventas y propiedades',
      short: 'Ventas',
      q: '¿Qué ha dicho {Sofía} del estacionamiento en todas las visitas?',
      a: 'Lo mencionó en las tres visitas [1][2][3]. En Los Dominicos dijo que no ofertarían sin estacionamiento techado [2], y en Ñuñoa lo llamó lo que define la compra [3]. Tomás nunca se opuso a pagar más por eso [1].',
      sources: [
        { title: 'Visita Vitacura', date: '9 sep' },
        { title: 'Visita Los Dominicos', date: '14 sep' },
        { title: 'Recorrido Ñuñoa', date: '21 sep' },
      ],
    },
    wa: {
      file: 'visita-vitacura.m4a',
      fileMeta: '38 min',
      msgs: [
        ['bot', '*Visita Vitacura*\nA Sofía le encantó la cocina; a Tomás le pareció caro. Segunda visita el sábado.'],
        ['me', '¿Qué le debo todavía a los Rojas?'],
        ['bot', '• Enviar tasaciones de la calle (viernes)\n• Consultar a la administración por el estacionamiento'],
        ['me', 'Redacta un seguimiento a Tomás sobre el estacionamiento'],
        ['bot', '✉️ *Para:* Tomás Rojas\n*Asunto:* Estacionamiento antes del sábado\n\nAntes de la segunda visita: la administración sí permite techar el estacionamiento.'],
        ['me', 'envíalo'],
        ['bot', 'Enviado a Tomás. Tienes una copia en tu correo y las respuestas te llegan a ti.'],
        ['me', 'Recuérdame a las 5 llamar al banco'],
        ['bot', '⏰ Listo. Te aviso a las 17:00.'],
      ],
    },
    today: {
      due: [['Enviar tasaciones de Los Dominicos', 'Hoy'], ['Confirmar la visita del sábado', 'Atrasado · mar']],
      waiting: [['El borrador de la oferta', 'Sofía Rojas'], ['El certificado de preaprobación', 'María, banco']],
    },
    note: {
      title: 'Visita Vitacura',
      summary: 'Tercera visita con los Rojas. Sofía se enfocó en la cocina remodelada; Tomás fue directo al precio y dijo que supera su tope. Pidieron volver el fin de semana con la mamá de Sofía.',
      actions: ['Enviar tasaciones de la calle', 'Consultar a la administración por el estacionamiento', 'Confirmar el sábado con su mamá'],
      people: [['Sofía Rojas', 'compradora'], ['Tomás Rojas', 'comprador'], ['María', 'banco']],
    },
    missed: [
      ['Pidieron volver con la mamá de Sofía', 'La señal de compra más fuerte, en los últimos treinta segundos.'],
      ['Prometiste consultar a la administración', 'Lo dijiste en voz alta; fácil de olvidar para el fin de semana.'],
    ],
    email: { to: 'tomas.rojas@gmail.com', subject: 'Estacionamiento antes del sábado', body: 'Antes de la segunda visita: la administración sí permite techar el estacionamiento, así que lo del garaje tiene solución.' },
    seq: { title: 'Recorrido Ñuñoa', turns: [['A', 'Nos encanta la cocina. El tema es el estacionamiento.'], ['B', 'Tiene uno techado, en la parte de atrás.'], ['A', 'Entonces queremos avanzar esta semana.']], decided: 'Ofertan esta semana, si el estacionamiento techado se confirma.', missed: 'El estacionamiento ya salió en las tres visitas.' },
  },
  {
    key: 'students',
    tab: 'Estudiantes',
    short: 'Estudiantes',
    promise: 'Escucha en clase. Pregunta después qué entra en la prueba.',
    hero: { who: 'Prof. Ruiz', initials: 'PR', role: 'profesora', todo: 'Rehacer la guía 3', due: 'Antes del jueves', draftTitle: 'Re: consultas antes de la prueba' },
    demo: {
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
    wa: {
      file: 'finanzas-clase-6.m4a',
      fileMeta: '74 min',
      msgs: [
        ['bot', '*Finanzas Corporativas, clase 6*\nWACC con estructura de capital cambiante. Prueba el 24; se permite hoja de fórmulas.'],
        ['me', '¿Qué entra en la prueba?'],
        ['bot', 'Una pregunta de WACC y un ejercicio de bonos como la guía 3. La mayoría pierde puntos en el escudo tributario.'],
        ['me', 'Redacta un correo a la profesora Ruiz pidiendo consulta'],
        ['bot', '✉️ *Para:* Prof. Ruiz\n*Asunto:* Consulta antes de la prueba\n\n¿Podría pasar el miércoles a revisar el ejemplo del escudo tributario?'],
        ['me', 'envíalo'],
        ['bot', 'Enviado a la profesora Ruiz. Tienes una copia en tu correo.'],
        ['me', 'Recuérdame a las 8 de la noche rehacer la guía 3'],
        ['bot', '⏰ Listo. Te aviso a las 20:00.'],
      ],
    },
    today: {
      due: [['Rehacer la guía 3', 'Hoy'], ['Leer el capítulo 9 antes de clase', 'Mañana']],
      waiting: [['Las diapositivas del trabajo en grupo', 'Ana y Leo'], ['Las correcciones del informe', 'Dr. Kim']],
    },
    note: {
      title: 'Finanzas Corporativas, clase 6',
      summary: 'WACC cuando la estructura de capital cambia en el tiempo. La profesora Ruiz hizo dos ejemplos y dijo que la prueba se parecerá al segundo. Se permiten hoja de fórmulas y calculadora.',
      actions: ['Rehacer la guía 3', 'Leer el capítulo 9', 'Escribirle a Ruiz por consulta'],
      people: [['Prof. Ruiz', 'profesora'], ['Ana', 'grupo de estudio']],
    },
    missed: [
      ['La prueba se cambió al 24', 'Lo dijo una vez, mientras todos guardaban sus cosas.'],
      ['El ejercicio 4 es opcional', 'De pasada: sáltatelo si no te alcanza el tiempo.'],
    ],
    email: { to: 'ruiz@universidad.cl', subject: 'Consulta antes de la prueba', body: 'Hola profesora Ruiz, ¿podría pasar a su horario de consultas el miércoles para revisar el ejemplo del escudo tributario de la clase 6? Muchas gracias.' },
    seq: { title: 'Finanzas Corporativas, clase 6', turns: [['Ruiz', 'La prueba se va a parecer a este segundo ejemplo.'], ['Ana', '¿Podemos llevar hoja de fórmulas?'], ['Ruiz', 'Sí, una plana. Y la prueba se cambió al 24.']], decided: 'Prueba el 24, se permite una hoja de fórmulas.', missed: 'El cambio de fecha lo dijo una vez, al final.' },
  },
  {
    key: 'family',
    tab: 'Familia y salud',
    short: 'Familia',
    promise: 'Lo que dijo el médico, en palabras simples por WhatsApp, con un recordatorio cuando importa.',
    hero: { who: 'Dra. Pérez', initials: 'DP', role: 'cardióloga', todo: 'Tomar la dosis nueva con comida', due: 'Cada mañana', draftTitle: 'Lo que dijo hoy la Dra. Pérez' },
    demo: {
      tab: 'Familia y salud',
      short: 'Familia',
      q: '¿Qué dijo la doctora de la dosis nueva?',
      a: 'Tomar 5 mg cada mañana con comida, desde el lunes [2]. Es normal sentir mareos la primera semana, pero hay que llamar a la clínica si duran más de tres días [2]. Examen de sangre en seis semanas [3], y nada de pomelo mientras la tome [1].',
      sources: [
        { title: 'Control de cardiología', date: '30 ago' },
        { title: 'Control con la Dra. Pérez', date: '20 sep' },
        { title: 'Llamada con la clínica', date: '22 sep' },
      ],
    },
    wa: {
      file: 'control-medico.m4a',
      fileMeta: '22 min',
      msgs: [
        ['bot', '*Control con la Dra. Pérez*\nDosis nueva: 5 mg cada mañana con comida. Examen de sangre en seis semanas.'],
        ['me', '¿Qué dijo la doctora de los mareos?'],
        ['bot', 'Son normales la primera semana. Llama a la clínica si duran más de tres días.'],
        ['me', 'Mándale a mi hija un resumen de lo que dijo la doctora'],
        ['bot', '✉️ *Para:* Laura\n*Asunto:* Lo que dijo hoy la Dra. Pérez\n\nLa dosis nueva es 5 mg cada mañana con comida, desde el lunes. Examen de sangre en seis semanas.'],
        ['me', 'envíalo'],
        ['bot', 'Enviado a Laura. Tienes una copia en tu correo.'],
        ['me', 'Recuérdame en una hora llamar a la farmacia'],
        ['bot', '⏰ Listo. Te aviso a las 11:30.'],
      ],
    },
    today: {
      due: [['Tomar la dosis nueva con comida', 'Hoy, 8:00'], ['Llamar a la farmacia por la receta', 'Hoy']],
      waiting: [['Los resultados del examen', 'Dra. Pérez'], ['Cómo me fue en el control', 'Laura, hija']],
    },
    note: {
      title: 'Control con la Dra. Pérez',
      summary: 'La presión está mejor, pero todavía no en el objetivo. La Dra. Pérez subió la dosis a 5 mg, cada mañana con comida, desde el lunes. Algo de mareo la primera semana es esperable.',
      actions: ['Empezar 5 mg el lunes, con comida', 'Agendar el examen en seis semanas', 'Llamar si el mareo dura más de tres días'],
      people: [['Dra. Pérez', 'cardióloga'], ['Laura', 'hija']],
    },
    missed: [
      ['Nada de pomelo con este remedio', 'Lo dijo una vez, al final del control.'],
      ['Llevar los remedios antiguos al próximo control', 'Fácil de olvidar en seis semanas.'],
    ],
    email: { to: 'laura@gmail.com', subject: 'Lo que dijo hoy la Dra. Pérez', body: 'Hola Laura, el control salió bien. La dosis nueva es 5 mg cada mañana con comida, desde el lunes, y el examen de sangre es en seis semanas. Te llamo en la noche.' },
    seq: { title: 'Control con la Dra. Pérez', turns: [['Dra. Pérez', 'Subamos a 5 mg, cada mañana con comida.'], ['Tú', '¿Y si me mareo?'], ['Dra. Pérez', 'Es normal una semana. Si dura más, nos llama.']], decided: '5 mg cada mañana con comida, desde el lunes.', missed: 'Nada de pomelo mientras lo tome. Lo dijo una vez, en la puerta.' },
  },
  {
    key: 'founders',
    tab: 'Fundadores y equipos',
    short: 'Fundadores',
    promise: 'Cada compromiso de cada reunión, con quién lo prometió y para cuándo.',
    hero: { who: 'Priya Shah', initials: 'PS', role: 'inversionista', todo: 'Enviar retención al mes 6', due: 'Para el miércoles', draftTitle: 'Re: números de retención' },
    demo: {
      tab: 'Fundadores y equipos',
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
    wa: {
      file: 'norte-ventures.m4a',
      fileMeta: '41 min',
      msgs: [
        ['bot', '*Norte Ventures*\nLes gustó la tracción y quieren retención al mes 6 por canal antes del comité del lunes.'],
        ['me', '¿Qué le debo a Priya?'],
        ['bot', '• Retención al mes 6 por canal (miércoles)\n• La intro con nuestro cliente piloto'],
        ['me', 'Redacta un seguimiento a Priya con los próximos pasos'],
        ['bot', '✉️ *Para:* Priya Shah\n*Asunto:* Números de retención\n\nGracias por hoy. La retención al mes 6 por canal te llega el miércoles.'],
        ['me', 'envíalo'],
        ['bot', 'Enviado a Priya. Tienes una copia en tu correo y las respuestas te llegan a ti.'],
        ['me', 'Recuérdame en 2 horas sacar los datos de cohortes'],
        ['bot', '⏰ Listo. Te aviso a las 16:00.'],
      ],
    },
    today: {
      due: [['Enviar retención al mes 6 por canal', 'Hoy'], ['Actualizar el data room', 'Atrasado · lun']],
      waiting: [['La intro con el cliente piloto', 'Priya Shah'], ['La propuesta de precios', 'Daniela, Acme']],
    },
    note: {
      title: 'Norte Ventures, reunión con socios',
      summary: 'Mucho interés después de la demo. Priya cuestionó el tamaño de mercado y pidió retención al mes 6 por canal. Quiere llevarlo al comité del lunes.',
      actions: ['Enviar retención por canal', 'Intro con el cliente piloto', 'Compartir el deck actualizado'],
      people: [['Priya Shah', 'inversionista'], ['Tomás Reid', 'socio']],
    },
    missed: [
      ['Preguntó quién más entra en la ronda', 'La pregunta de la que depende el comité.'],
      ['Prometiste el deck para el viernes', 'Lo dijiste al cerrar la reunión.'],
    ],
    email: { to: 'priya@norteventures.vc', subject: 'Números de retención', body: 'Gracias por hoy, Priya. La retención al mes 6 por canal te llega el miércoles, y mañana te mando la intro con nuestro cliente piloto.' },
    seq: { title: 'Norte Ventures', turns: [['Priya', 'El tamaño de mercado es la pregunta del comité.'], ['Tú', 'Podemos mostrar retención por canal.'], ['Priya', 'Mándame el mes 6 el miércoles y lo llevo el lunes.']], decided: 'Retención por canal a Priya para el miércoles.', missed: 'Preguntó quién más entra en la ronda. Nadie respondió.' },
  },
]

const ES_PLUS: Plus = {
  hero: {
    h1a: 'Dilo una vez.',
    h1b: 'Juno lo recuerda.',
    lede: 'Graba cualquier conversación con el celular o con el lápiz: una reunión, una clase, un control médico. Recibe las notas, tus pendientes y el correo de seguimiento, en la app o por WhatsApp.',
    seeWa: 'Míralo en WhatsApp',
    draft: 'Borrador listo',
  },
  film: { h2: 'Quince segundos, de principio a fin.', sub: 'Un clic, conversas, y las notas llegan a tu celular antes de salir.', pause: 'Pausar', play: 'Reproducir' },
  aud: { h2: 'Hecho para quien sea que converses.', sub: 'Elige el tuyo. Todos los ejemplos de esta página cambian con él.' },
  how: {
    h2: 'Tres pasos. Nada que configurar.',
    steps: [
      { h: 'Graba', p: 'Con el celular, una nota de voz, cualquier grabadora o el lápiz. Lo que ya uses sirve.' },
      { h: 'Envíalo', p: 'Mándalo por WhatsApp como cualquier audio, o súbelo en la web.' },
      { h: 'Lee, y pregunta', p: 'Minutos después: las notas, tus pendientes y el correo de seguimiento. Después pregúntale lo que quieras.' },
    ],
    labels: { recording: 'grabando', decided: 'Decidido', missed: 'Casi se pasa' },
  },
  wa: {
    h2: 'Vive en tu WhatsApp.',
    sub: 'Manda la grabación como cualquier audio. Después pregunta qué te falta, envía el seguimiento y deja un recordatorio, todo desde el chat. Sin apps nuevas.',
    status: 'en línea',
  },
  today: {
    h2: 'Ábrelo y sabes qué pide el día.',
    sub: 'Lo que vence y quién espera algo de ti. Solo tus pendientes, no todo lo que prometieron los demás.',
    title: 'Hoy',
    due: 'Vence',
    waiting: 'Esperan algo de ti',
    mine: 'Solo los tuyos',
    date: 'martes 30 de septiembre',
  },
  feat: {
    h2: 'Después de cada conversación, ya escrito.',
    sub: 'Las notas, lo que casi se te pasa y el correo para enviar.',
    noteTitle: 'Escrito por ti',
    noteCopy: 'Quién estuvo, qué se decidió y qué te toca hacer.',
    summary: 'Resumen',
    actions: 'Tus próximos pasos',
    people: 'Quiénes estuvieron',
    missedTitle: 'Lo que casi se te pasa',
    missedCopy: 'La promesa hecha de pasada, el detalle dicho una sola vez.',
    emailTitle: 'El seguimiento, ya escrito',
    emailCopy: 'Envíalo desde Juno, o ábrelo en tu propio correo.',
    to: 'Para',
    subject: 'Asunto',
    sendBtn: 'Envíalo',
    ownBtn: 'Abrir en mi correo',
  },
  priv: {
    h2: 'Pregunta antes de escuchar.',
    sub: 'No se procesa nada hasta que confirmas que todos aceptaron ser grabados. Después, sigue siendo tuyo.',
    question: '¿Todos en esta grabación aceptaron ser grabados?',
    agree: 'Todos aceptaron',
    items: ['Cifrado en tránsito y en reposo', 'Privado para tu cuenta', 'Borra lo que quieras, cuando quieras', 'Nunca se vende'],
  },
  pen: { specs: ['Micrófono 360°', 'USB-C integrado', 'Un toque, activado por voz', 'Un lápiz de verdad'], allSpecs: 'Todas las especificaciones' },
  faq: {
    h2: 'Preguntas',
    items: [
      ['¿Necesito el lápiz?', 'No. El plan con tu propia grabadora funciona con el celular, notas de voz de WhatsApp, Plaud, Pocket o cualquier grabadora que te dé un audio o una transcripción.'],
      ['¿Es legal grabar una conversación?', 'Depende de dónde estés. En muchos lugares se necesita el permiso de todos. Juno Pen te pide confirmar el consentimiento antes de procesar nada, para que preguntar se vuelva costumbre.'],
      ['¿Qué idiomas entiende?', 'Transcribe español, inglés, portugués y muchos otros idiomas. La app, los correos y WhatsApp funcionan en español, inglés y portugués, y las notas vuelven en el idioma en que hablaste, salvo que elijas otro.'],
      ['¿Cuánto se demoran las notas?', 'Normalmente unos minutos después de que llega la grabación. Te llegan a la app y al correo, y de vuelta a WhatsApp si la mandaste por ahí.'],
      ['¿Quién puede escuchar mis grabaciones?', 'Solo tú. Las grabaciones van cifradas en tránsito y en reposo, son privadas para tu cuenta y nunca se venden. Si borras una, desaparece, incluida la copia del servicio de transcripción.'],
      ['¿Puedo cancelar?', 'Sí, cuando quieras, desde Configuración. Los planes mensuales también se pueden pausar 30, 60 o 90 días.'],
    ],
  },
}

/* ============================================================== Português */

const PT_KITS: Kit[] = [
  {
    key: 'sales',
    tab: 'Vendas e imóveis',
    short: 'Vendas',
    promise: 'O que cada cliente precisa, lembrado, e o e-mail de follow-up escrito antes de você chegar ao carro.',
    hero: { who: 'Sofia Lima', initials: 'SL', role: 'compradora', todo: 'Enviar avaliações dos Jardins', due: 'Para sexta', draftTitle: 'Re: vaga antes de sábado' },
    demo: {
      tab: 'Vendas e imóveis',
      short: 'Vendas',
      q: 'O que a {Sofia} falou sobre vaga de garagem em todas as visitas?',
      a: 'Ela mencionou nas três visitas [1][2][3]. Nos Jardins disse que não fariam proposta sem vaga coberta [2], e em Pinheiros chamou isso de decisivo [3]. O Tomás nunca se opôs a pagar mais por isso [1].',
      sources: [
        { title: 'Visita Vila Madalena', date: '9 set' },
        { title: 'Visita Jardins', date: '14 set' },
        { title: 'Visita Pinheiros', date: '21 set' },
      ],
    },
    wa: {
      file: 'visita-vila-madalena.m4a',
      fileMeta: '38 min',
      msgs: [
        ['bot', '*Visita Vila Madalena*\nA Sofia adorou a cozinha; o Tomás achou caro. Segunda visita no sábado.'],
        ['me', 'O que ainda devo aos Lima?'],
        ['bot', '• Enviar avaliações da rua (sexta)\n• Consultar o condomínio sobre a vaga'],
        ['me', 'Escreva um follow-up para o Tomás sobre a vaga'],
        ['bot', '✉️ *Para:* Tomás Lima\n*Assunto:* Vaga antes de sábado\n\nAntes da segunda visita: o condomínio permite cobrir a vaga.'],
        ['me', 'enviar'],
        ['bot', 'Enviado para o Tomás. Uma cópia está no seu e-mail e as respostas vão para você.'],
        ['me', 'Me lembre às 5 de ligar para o banco'],
        ['bot', '⏰ Pronto. Aviso você às 17:00.'],
      ],
    },
    today: {
      due: [['Enviar avaliações dos Jardins', 'Hoje'], ['Confirmar a visita de sábado', 'Atrasado · ter']],
      waiting: [['O rascunho da proposta', 'Sofia Lima'], ['A carta de crédito', 'Maria, banco']],
    },
    note: {
      title: 'Visita Vila Madalena',
      summary: 'Terceira visita com os Lima. A Sofia focou na cozinha reformada; o Tomás foi direto ao preço e disse que passa do teto deles. Pediram para voltar no fim de semana com a mãe da Sofia.',
      actions: ['Enviar avaliações da rua', 'Consultar o condomínio sobre a vaga', 'Confirmar sábado com a mãe dela'],
      people: [['Sofia Lima', 'compradora'], ['Tomás Lima', 'comprador'], ['Maria', 'banco']],
    },
    missed: [
      ['Pediram para voltar com a mãe da Sofia', 'O sinal de compra mais forte, nos últimos trinta segundos.'],
      ['Você prometeu consultar o condomínio', 'Dito em voz alta, fácil de esquecer até o fim de semana.'],
    ],
    email: { to: 'tomas.lima@gmail.com', subject: 'Vaga antes de sábado', body: 'Antes da segunda visita: o condomínio permite cobrir a vaga, então a questão da garagem tem solução.' },
    seq: { title: 'Visita Pinheiros', turns: [['A', 'Adoramos a cozinha. A questão é a vaga.'], ['B', 'Tem uma vaga coberta, nos fundos.'], ['A', 'Então queremos avançar esta semana.']], decided: 'Fazem proposta esta semana, se a vaga coberta se confirmar.', missed: 'A vaga já apareceu nas três visitas.' },
  },
  {
    key: 'students',
    tab: 'Estudantes',
    short: 'Estudantes',
    promise: 'Preste atenção na aula. Pergunte depois o que cai na prova.',
    hero: { who: 'Prof. Ruiz', initials: 'PR', role: 'professora', todo: 'Refazer a lista 3', due: 'Antes de quinta', draftTitle: 'Re: plantão antes da prova' },
    demo: {
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
    wa: {
      file: 'financas-aula-6.m4a',
      fileMeta: '74 min',
      msgs: [
        ['bot', '*Finanças Corporativas, aula 6*\nWACC com estrutura de capital variável. Prova no dia 24; pode levar folha de fórmulas.'],
        ['me', 'O que cai na prova?'],
        ['bot', 'Uma questão de WACC e um exercício de títulos como a lista 3. A maioria perde pontos no benefício fiscal.'],
        ['me', 'Escreva um e-mail para a professora Ruiz pedindo plantão'],
        ['bot', '✉️ *Para:* Prof. Ruiz\n*Assunto:* Plantão antes da prova\n\nPosso passar na quarta para revisar o exemplo do benefício fiscal?'],
        ['me', 'enviar'],
        ['bot', 'Enviado para a professora Ruiz. Uma cópia está no seu e-mail.'],
        ['me', 'Me lembre às 8 da noite de refazer a lista 3'],
        ['bot', '⏰ Pronto. Aviso você às 20:00.'],
      ],
    },
    today: {
      due: [['Refazer a lista 3', 'Hoje'], ['Ler o capítulo 9 antes da aula', 'Amanhã']],
      waiting: [['Os slides do trabalho em grupo', 'Ana e Leo'], ['As correções do relatório', 'Dr. Kim']],
    },
    note: {
      title: 'Finanças Corporativas, aula 6',
      summary: 'WACC quando a estrutura de capital muda ao longo do tempo. A professora Ruiz fez dois exemplos e disse que a prova vai parecer com o segundo. Pode levar folha de fórmulas e calculadora.',
      actions: ['Refazer a lista 3', 'Ler o capítulo 9', 'Escrever para a Ruiz sobre o plantão'],
      people: [['Prof. Ruiz', 'professora'], ['Ana', 'grupo de estudo']],
    },
    missed: [
      ['A prova mudou para o dia 24', 'Dito uma vez, enquanto todos guardavam as coisas.'],
      ['O exercício 4 é opcional', 'De passagem: pule se faltar tempo.'],
    ],
    email: { to: 'ruiz@universidade.br', subject: 'Plantão antes da prova', body: 'Olá professora Ruiz, posso passar no seu plantão na quarta para revisar o exemplo do benefício fiscal da aula 6? Obrigado.' },
    seq: { title: 'Finanças Corporativas, aula 6', turns: [['Ruiz', 'A prova vai parecer com este segundo exemplo.'], ['Ana', 'Podemos levar folha de fórmulas?'], ['Ruiz', 'Sim, uma folha. E a prova mudou para o dia 24.']], decided: 'Prova no dia 24, pode levar uma folha de fórmulas.', missed: 'A mudança de data foi dita uma vez, no final.' },
  },
  {
    key: 'family',
    tab: 'Família e saúde',
    short: 'Família',
    promise: 'O que o médico disse, em palavras simples no WhatsApp, com um lembrete na hora certa.',
    hero: { who: 'Dra. Souza', initials: 'DS', role: 'cardiologista', todo: 'Tomar a dose nova com comida', due: 'Toda manhã', draftTitle: 'O que a Dra. Souza disse hoje' },
    demo: {
      tab: 'Família e saúde',
      short: 'Família',
      q: 'O que a médica disse sobre a dose nova?',
      a: 'Tomar 5 mg toda manhã com comida, a partir de segunda [2]. Tontura na primeira semana é normal, mas é preciso ligar para a clínica se durar mais de três dias [2]. Exame de sangue em seis semanas [3], e nada de toranja enquanto tomar [1].',
      sources: [
        { title: 'Consulta de cardiologia', date: '30 ago' },
        { title: 'Retorno com a Dra. Souza', date: '20 set' },
        { title: 'Ligação com a clínica', date: '22 set' },
      ],
    },
    wa: {
      file: 'consulta-medica.m4a',
      fileMeta: '22 min',
      msgs: [
        ['bot', '*Retorno com a Dra. Souza*\nDose nova: 5 mg toda manhã com comida. Exame de sangue em seis semanas.'],
        ['me', 'O que a médica disse sobre a tontura?'],
        ['bot', 'É normal na primeira semana. Ligue para a clínica se durar mais de três dias.'],
        ['me', 'Mande para minha filha um resumo do que a médica disse'],
        ['bot', '✉️ *Para:* Laura\n*Assunto:* O que a Dra. Souza disse hoje\n\nA dose nova é 5 mg toda manhã com comida, a partir de segunda. Exame de sangue em seis semanas.'],
        ['me', 'enviar'],
        ['bot', 'Enviado para a Laura. Uma cópia está no seu e-mail.'],
        ['me', 'Me lembre daqui a uma hora de ligar para a farmácia'],
        ['bot', '⏰ Pronto. Aviso você às 11:30.'],
      ],
    },
    today: {
      due: [['Tomar a dose nova com comida', 'Hoje, 8:00'], ['Ligar para a farmácia sobre a receita', 'Hoje']],
      waiting: [['Os resultados do exame', 'Dra. Souza'], ['Como foi a consulta', 'Laura, filha']],
    },
    note: {
      title: 'Retorno com a Dra. Souza',
      summary: 'A pressão melhorou, mas ainda não chegou no alvo. A Dra. Souza aumentou a dose para 5 mg, toda manhã com comida, a partir de segunda. Um pouco de tontura na primeira semana é esperado.',
      actions: ['Começar 5 mg na segunda, com comida', 'Marcar o exame em seis semanas', 'Ligar se a tontura durar mais de três dias'],
      people: [['Dra. Souza', 'cardiologista'], ['Laura', 'filha']],
    },
    missed: [
      ['Nada de toranja com este remédio', 'Dito uma vez, bem no final da consulta.'],
      ['Levar os remédios antigos no próximo retorno', 'Fácil de esquecer em seis semanas.'],
    ],
    email: { to: 'laura@gmail.com', subject: 'O que a Dra. Souza disse hoje', body: 'Oi Laura, a consulta foi boa. A dose nova é 5 mg toda manhã com comida, a partir de segunda, e o exame de sangue é em seis semanas. Te ligo à noite.' },
    seq: { title: 'Retorno com a Dra. Souza', turns: [['Dra. Souza', 'Vamos subir para 5 mg, toda manhã com comida.'], ['Você', 'E se eu sentir tontura?'], ['Dra. Souza', 'É normal por uma semana. Se durar mais, ligue.']], decided: '5 mg toda manhã com comida, a partir de segunda.', missed: 'Nada de toranja enquanto tomar. Ela disse uma vez, na porta.' },
  },
  {
    key: 'founders',
    tab: 'Fundadores e equipes',
    short: 'Fundadores',
    promise: 'Cada compromisso de cada reunião, com quem prometeu e para quando.',
    hero: { who: 'Priya Shah', initials: 'PS', role: 'investidora', todo: 'Enviar retenção do mês 6', due: 'Para quarta', draftTitle: 'Re: números de retenção' },
    demo: {
      tab: 'Fundadores e equipes',
      short: 'Fundadores',
      q: 'Em que os investidores mais questionaram?',
      a: 'Tamanho de mercado, em três de quatro reuniões [1][2][4]. A Norte Ventures queria ver retenção no mês 6 por canal [3], e dois fundos perguntaram quem mais entra na rodada antes de levar ao comitê [2][4].',
      sources: [
        { title: 'Intro com a Sul VC', date: '28 ago' },
        { title: 'Lattice Capital', date: '3 set' },
        { title: 'Norte Ventures', date: '11 set' },
        { title: 'Reunião seed Fieldstone', date: '16 set' },
      ],
    },
    wa: {
      file: 'norte-ventures.m4a',
      fileMeta: '41 min',
      msgs: [
        ['bot', '*Norte Ventures*\nGostaram da tração e querem retenção no mês 6 por canal antes do comitê de segunda.'],
        ['me', 'O que eu devo para a Priya?'],
        ['bot', '• Retenção no mês 6 por canal (quarta)\n• A intro com nosso cliente piloto'],
        ['me', 'Escreva um follow-up para a Priya com os próximos passos'],
        ['bot', '✉️ *Para:* Priya Shah\n*Assunto:* Números de retenção\n\nObrigado por hoje. A retenção no mês 6 por canal chega até quarta.'],
        ['me', 'enviar'],
        ['bot', 'Enviado para a Priya. Uma cópia está no seu e-mail e as respostas vão para você.'],
        ['me', 'Me lembre daqui a 2 horas de puxar os dados de coorte'],
        ['bot', '⏰ Pronto. Aviso você às 16:00.'],
      ],
    },
    today: {
      due: [['Enviar retenção no mês 6 por canal', 'Hoje'], ['Atualizar o data room', 'Atrasado · seg']],
      waiting: [['A intro com o cliente piloto', 'Priya Shah'], ['A proposta de preços', 'Dana, Acme']],
    },
    note: {
      title: 'Norte Ventures, reunião com sócios',
      summary: 'Muito interesse depois da demo. A Priya questionou o tamanho de mercado e pediu retenção no mês 6 por canal. Quer levar ao comitê de segunda.',
      actions: ['Enviar retenção por canal', 'Intro com o cliente piloto', 'Compartilhar o deck atualizado'],
      people: [['Priya Shah', 'investidora'], ['Tom Reid', 'sócio']],
    },
    missed: [
      ['Ela perguntou quem mais entra na rodada', 'A pergunta da qual o comitê depende.'],
      ['Você prometeu o deck até sexta', 'Dito ao encerrar a reunião.'],
    ],
    email: { to: 'priya@norteventures.vc', subject: 'Números de retenção', body: 'Obrigado por hoje, Priya. A retenção no mês 6 por canal chega até quarta, e amanhã envio a intro com nosso cliente piloto.' },
    seq: { title: 'Norte Ventures', turns: [['Priya', 'Tamanho de mercado é a pergunta do comitê.'], ['Você', 'Podemos mostrar retenção por canal.'], ['Priya', 'Mande o mês 6 até quarta e eu levo na segunda.']], decided: 'Retenção por canal para a Priya até quarta.', missed: 'Ela perguntou quem mais entra na rodada. Ninguém respondeu.' },
  },
]

const PT_PLUS: Plus = {
  hero: {
    h1a: 'Diga uma vez.',
    h1b: 'O Juno lembra.',
    lede: 'Grave qualquer conversa com o celular ou com a caneta: uma reunião, uma aula, uma consulta médica. Receba as notas, suas tarefas e o e-mail de follow-up, no app ou pelo WhatsApp.',
    seeWa: 'Veja no WhatsApp',
    draft: 'Rascunho pronto',
  },
  film: { h2: 'Quinze segundos, do começo ao fim.', sub: 'Um clique, você conversa, e as notas chegam no celular antes de você sair.', pause: 'Pausar', play: 'Reproduzir' },
  aud: { h2: 'Feito para quem você conversa.', sub: 'Escolha o seu. Todos os exemplos desta página mudam com ele.' },
  how: {
    h2: 'Três passos. Nada para configurar.',
    steps: [
      { h: 'Grave', p: 'Com o celular, uma mensagem de voz, qualquer gravador ou a caneta. O que você já usa serve.' },
      { h: 'Envie', p: 'Mande pelo WhatsApp como qualquer áudio, ou envie pelo site.' },
      { h: 'Leia, e pergunte', p: 'Minutos depois: as notas, suas tarefas e o e-mail de follow-up. Depois pergunte o que quiser.' },
    ],
    labels: { recording: 'gravando', decided: 'Decidido', missed: 'Quase passou' },
  },
  wa: {
    h2: 'Mora no seu WhatsApp.',
    sub: 'Mande a gravação como qualquer áudio. Depois pergunte o que falta, envie o follow-up e peça um lembrete, tudo pela conversa. Sem app novo para aprender.',
    status: 'online',
  },
  today: {
    h2: 'Abra e saiba o que o dia pede.',
    sub: 'O que vence e quem está esperando por você. Só as suas tarefas, não tudo o que os outros prometeram.',
    title: 'Hoje',
    due: 'Vence',
    waiting: 'Esperando por você',
    mine: 'Só as suas',
    date: 'terça, 30 de setembro',
  },
  feat: {
    h2: 'Depois de cada conversa, já escrito.',
    sub: 'As notas, o que quase passou batido e o e-mail para enviar.',
    noteTitle: 'Escrito para você',
    noteCopy: 'Quem estava, o que foi decidido e o que você faz depois.',
    summary: 'Resumo',
    actions: 'Seus próximos passos',
    people: 'Quem estava',
    missedTitle: 'O que quase passou batido',
    missedCopy: 'A promessa feita de passagem, o detalhe dito uma vez só.',
    emailTitle: 'O follow-up, já escrito',
    emailCopy: 'Envie pelo Juno, ou abra no seu próprio e-mail.',
    to: 'Para',
    subject: 'Assunto',
    sendBtn: 'Enviar',
    ownBtn: 'Abrir no meu e-mail',
  },
  priv: {
    h2: 'Pergunta antes de ouvir.',
    sub: 'Nada é processado até você confirmar que todos concordaram em ser gravados. Depois disso, continua sendo seu.',
    question: 'Todos nesta gravação concordaram em ser gravados?',
    agree: 'Todos concordaram',
    items: ['Criptografado em trânsito e em repouso', 'Privado para a sua conta', 'Apague o que quiser, quando quiser', 'Nunca vendido'],
  },
  pen: { specs: ['Microfone 360°', 'USB-C embutido', 'Um toque, ativado por voz', 'Uma caneta de verdade'], allSpecs: 'Todas as especificações' },
  faq: {
    h2: 'Perguntas',
    items: [
      ['Preciso da caneta?', 'Não. O plano com seu próprio gravador funciona com o celular, mensagens de voz do WhatsApp, Plaud, Pocket ou qualquer gravador que gere um áudio ou uma transcrição.'],
      ['É legal gravar uma conversa?', 'Depende de onde você está. Em muitos lugares é preciso a permissão de todos. O Juno Pen pede para você confirmar o consentimento antes de processar qualquer coisa, para que perguntar vire hábito.'],
      ['Quais idiomas ele entende?', 'Transcreve português, inglês, espanhol e muitos outros idiomas. O app, os e-mails e o WhatsApp funcionam em português, inglês e espanhol, e as notas voltam no idioma em que você falou, a menos que escolha outro.'],
      ['Quanto tempo até as notas ficarem prontas?', 'Normalmente alguns minutos depois que a gravação chega. Elas aparecem no app e no seu e-mail, e voltam no WhatsApp se você mandou por lá.'],
      ['Quem pode ouvir minhas gravações?', 'Só você. As gravações são criptografadas em trânsito e em repouso, privadas para a sua conta e nunca vendidas. Apague uma e ela some, incluindo a cópia do serviço de transcrição.'],
      ['Posso cancelar?', 'Sim, quando quiser, em Configurações. Os planos mensais também podem ser pausados por 30, 60 ou 90 dias.'],
    ],
  },
}

export const KITS: Record<Lang, Kit[]> = { en: EN_KITS, es: ES_KITS, pt: PT_KITS }
export const PLUS: Record<Lang, Plus> = { en: EN_PLUS, es: ES_PLUS, pt: PT_PLUS }
