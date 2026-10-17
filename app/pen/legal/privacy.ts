// Juno Pen privacy policy, EN / ES / PT.
//
// Every statement here was checked against the code on 27 Sep 2026. Before changing a claim,
// check what the code does: in particular deletion (lib/pen/store.ts deleteSession), what goes
// to which provider, and what /api/track records. Placeholders like [ENTITY] are filled in
// config.ts.

import type { Lang, LegalDoc } from './types'

export const PRIVACY: Record<Lang, LegalDoc> = {
  en: {
    title: 'Privacy Policy',
    lede: 'Juno Pen turns recordings of your conversations into transcripts, notes and answers. That means we handle sensitive material: your voice, other people’s voices, and what everyone said. This page explains what we collect, who helps us process it, how long we keep it, and what you can do about it.',
    sections: [
      {
        h: 'Who we are',
        body: [
          'Juno Pen is run by [ENTITY], [ADDRESS] (“Juno”, “we”, “us”). We decide how your account information is used. For the content of your recordings, we process it on your behalf and on your instructions.',
          'For anything about privacy, write to [CONTACT EMAIL].',
        ],
      },
      {
        h: 'The short version',
        body: [
          {
            list: [
              'Your recordings, transcripts and notes are private to your account.',
              'They are encrypted in transit and at rest.',
              'You can delete any recording at any time.',
              'We never sell your data, and we don’t share it for advertising.',
              'A small number of service providers help us run Juno Pen (listed below). They process your data only to provide their service to us.',
            ],
          },
        ],
      },
      {
        h: 'What we collect',
        body: [
          {
            list: [
              'Account: your email address, and your name and profile picture if you sign in with Google.',
              'Signup: your name, email, phone number (optional), your role, any note you write and, if we post you a pen, your shipping address.',
              'Profile: what you tell us in Settings, such as your role, your organisation, the languages you speak, words you use often and how you want your notes written.',
              'Recordings: the audio files you upload or send on WhatsApp, their name, date and length, and any transcripts you paste in.',
              'What we make from them: transcripts, speaker names, notes, summaries, to-dos, translations, chat answers and documents, plus any edits you make.',
              'People: the names, email addresses, roles and short descriptions of people you add, or that you accept from our suggestions.',
              'Names heard: personal names said in your recordings, when they were said, who said them and a few words of context, and, for recordings of events, the separate conversations in them. They are found automatically so you can search them and pick who was who. Nobody becomes a contact unless you choose them.',
              'WhatsApp and iMessage: your phone number once you link it, the messages and files you send to Juno Pen, and our replies, including the reminders and briefs we send you.',
              'Google Calendar (only if you connect it): the events on calendars you own (title, time, place, attendees and description) and the events Juno Pen adds for you.',
              'Payments: your plan, trial and renewal dates, and purchase records. Your card is collected and held by Stripe. We never see or store your full card number.',
              'Usage: the pages you visit on our site, the page that sent you, your browser type and an approximate location (country and city) supplied by our hosting provider. We don’t store your IP address in our own database; our providers keep standard server logs.',
            ],
          },
        ],
      },
      {
        h: 'How we use it',
        body: [
          {
            list: [
              'To run Juno Pen: transcribe recordings, write notes, answer your questions, send you briefings by email or WhatsApp, and keep your archive searchable.',
              'To message you first on WhatsApp or iMessage with reminders, briefs and suggestions from your meetings, such as a follow-up you promised or a meeting someone proposed. Juno Pen asks before acting on any of them. Reply STOP to turn these messages off and START to turn them back on.',
              'To run your account and billing, post your pen, and send service emails (welcome, trial ending, payment problems).',
              'To keep the service secure and working, fix problems and prevent abuse.',
              'To understand, in aggregate, how the site is used, so we can improve it.',
              'To meet legal obligations, such as tax and accounting records.',
            ],
          },
          'We don’t use your recordings for advertising, and we don’t sell or rent your data.',
        ],
      },
      {
        h: 'The people in your recordings',
        body: [
          'Your recordings usually include other people. You decide what to record and upload, and you are responsible for having their permission where the law requires it. In many places, Florida and California among them, everyone in the conversation must agree. Juno Pen asks you to confirm consent before it processes a recording, and a recording without that confirmation is not processed.',
          'Juno Pen also lists the names said in a recording, including people who are only mentioned. They stay in your account, are never shown to anyone else, and are deleted with the recording.',
          'People who appear in a recording can write to [CONTACT EMAIL]. We will usually need to involve the account holder to respond.',
        ],
      },
      {
        h: 'Who helps us',
        body: [
          'We share data with these providers only so they can do their job for us:',
          {
            list: [
              'Supabase (database and file storage): your account data, recordings, transcripts and notes.',
              'AssemblyAI (transcription and translation): the audio of your recordings, plus names and words from your profile and people list that help it spell them correctly.',
              'Anthropic (the AI models that write notes, correct transcripts, answer questions and draft emails): transcripts, notes, your profile and your questions.',
              'Meta (WhatsApp, if you use it): your phone number, messages and files.',
              'Sendblue (iMessage, if you use it): your phone number, messages and files.',
              'Google Calendar (only if you connect it): we read and add events on your own calendar, as described under “Google Calendar” below.',
              'Stripe (payments): your email, plan and payment details.',
              'Notion (only if you connect it): the notes of your recordings, sent to your own Notion workspace. Notion’s own terms and privacy policy apply there.',
              'Resend (email delivery): your email address and the emails we send you, including meeting briefings, which contain your notes.',
              'Google (sign-in): your Google name, email and picture. We are also notified of new signups at a Google email account.',
              'Vercel (hosting): all traffic to the site passes through it.',
            ],
          },
          'We may also disclose data when the law requires it, to protect someone’s safety or our rights, or as part of a merger or sale of the business, in which case this policy keeps applying to your data.',
        ],
      },
      {
        h: 'Google Calendar',
        body: [
          'If you connect Google Calendar, Juno Pen asks Google for permission to see, add and change events on the calendars you own. We use it for three things only:',
          {
            list: [
              'To add events you approve. When a recording mentions a meeting, Juno Pen asks you first, on WhatsApp, iMessage or the website. It adds the event only after you say yes, and it never changes or deletes an event you didn’t ask it to.',
              'To prepare you for meetings. We read your events for the next 7 days (title, time, place, attendees and description) so we can send you a short brief before a meeting, using your notes from past conversations with the same people.',
              'To change or delete an event when you ask. If you ask Juno Pen to move or delete an event, or add a video link to it, it looks that event up by name (from yesterday to 60 days ahead).',
            ],
          },
          'To write a brief or a reminder, the details of that event are sent to Anthropic, which writes the text for us and does not train its models on data sent through its API. We don’t sell calendar data, use it for advertising, or use it to train AI models, ours or anyone else’s. Nobody at Juno Pen reads it unless you ask us to, it’s needed for security, or the law requires it.',
          'You can disconnect Google Calendar in Settings, or at myaccount.google.com/permissions. We then revoke our access and delete the calendar data and tokens we hold. When you ask us to delete your account, we do the same.',
          'Juno Pen’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy (https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.',
        ],
      },
      {
        h: 'Google Docs and Sheets',
        body: [
          'If you connect Google Docs and Sheets, Juno Pen asks Google for one permission (drive.file): to create files in your Google Drive and open only the files Juno Pen created. Juno Pen cannot see any other file in your Drive.',
          'Juno Pen creates a Doc or a Sheet only when you ask (a recording’s notes, a plan you approved, your to-dos or contacts), inside a “Juno Pen” folder. We store only a sealed access token, shared with Google Calendar if both are connected.',
          'You can disconnect in Settings → Google. Files Juno Pen made stay in your Drive and remain yours.',
        ],
      },
      {
        h: 'Granola',
        body: [
          'If you connect Granola, Juno Pen stores your Granola API key or sign-in token encrypted and uses it only to read the meetings you choose to import (title, date, attendees, transcript, summary and your own notes). Disconnect in Settings → Granola to delete it.',
        ],
      },
      {
        h: 'AI and model training',
        body: [
          {
            list: [
              'We don’t train AI models of our own on your recordings.',
              'Anthropic’s commercial terms say it does not train its models on data sent through its API by default.',
              'AssemblyAI’s terms allow it to use certain files to improve its models, after a process designed to remove personal information, unless the customer has opted out.',
            ],
          },
          'AI makes mistakes. Check notes and answers before relying on them.',
        ],
      },
      {
        h: 'How long we keep it',
        body: [
          {
            list: [
              'Transcripts, notes and everything else from a recording: until you delete them, or ask us to delete your account.',
              'Audio files: We delete the audio file of each recording 90 days after you upload it, unless you choose Keep this audio. The transcript, notes and everything else stay until you delete the recording.',
              'When you delete a recording, we remove it and its notes from our database, its audio from our storage, and the transcript AssemblyAI made of it. Copies can remain in our providers’ backups for a limited time.',
              'Otherwise, AssemblyAI’s standard policy is to delete audio within about 48 hours and the transcripts it keeps within about 30 days. Recordings sent on WhatsApp are not kept in our own file storage; we keep their transcript and notes.',
              'WhatsApp messages you send us: kept with your account until you ask us to delete them.',
              'Google Calendar: we read upcoming events when a brief or suggestion needs them. We keep only the events Juno Pen added for you and the briefs it wrote. When you disconnect Google Calendar or ask us to delete your account, we revoke our access and delete your Google tokens and the calendar data we hold.',
              'Payment and billing records: as long as tax and accounting law requires.',
              'If your plan ends, your account stays read-only for 12 months so you can come back, and then we delete it with its recordings, transcripts and notes. Ask us and we delete them sooner.',
            ],
          },
        ],
      },
      {
        h: 'Your rights',
        body: [
          'Wherever you live, you can ask us to:',
          {
            list: [
              'tell you what data we hold about you, and give you a copy in a portable format;',
              'correct it;',
              'delete it, including your whole account;',
              'stop or limit a particular use of it;',
              'withdraw any consent you gave, without affecting what happened before.',
            ],
          },
          'Write to [CONTACT EMAIL]. We aim to reply within 15 days, and we won’t treat you differently for asking.',
        ],
      },
      {
        h: 'Brazil (LGPD)',
        body: [
          'We process your data to perform our contract with you (your account and the service), for our legitimate interests (security, preventing fraud, improving the service), to meet legal obligations (such as tax records) and, where we ask for it, with your consent.',
          'You have the rights in Article 18 of the LGPD, including confirmation that we process your data, access, correction, anonymisation, blocking or deletion of unnecessary data, portability, information about who we share it with, and review of decisions made only by automated means. You can also complain to the Autoridade Nacional de Proteção de Dados (ANPD).',
          'Our data protection contact (encarregado) is reachable at [CONTACT EMAIL].',
        ],
      },
      {
        h: 'Chile',
        body: [
          'We process personal data in line with Law 19.628 and, from 1 December 2026, the new personal data protection law (Law 21.719). You can exercise your rights of access, rectification, deletion, objection, portability and blocking by writing to [CONTACT EMAIL]. From 1 December 2026 you can also complain to the Agencia de Protección de Datos Personales.',
        ],
      },
      {
        h: 'United States',
        body: [
          'We don’t sell your personal information, and we don’t share it for cross-context behavioural advertising. Residents of California and other states with privacy laws can use the rights above to know, access, correct and delete their data, including through an authorised agent. We won’t discriminate against you for using them.',
        ],
      },
      {
        h: 'International transfers',
        body: [
          'Most of our providers are based in the United States, so your data is processed there and possibly in other countries where they operate. When data moves from Brazil, Chile or anywhere else, we rely on our providers’ contractual commitments, including their data processing terms, to protect it.',
        ],
      },
      {
        h: 'Security',
        body: [
          'Data is encrypted in transit (HTTPS) and at rest. In the app, your recordings are visible only to your account. A small number of people at Juno can access our systems in order to run them; we look at your content only when you ask us to (for example, for support), to keep the service secure, or when the law requires it. No system is perfectly secure. If a breach affects your data, we’ll tell you and the authorities as the law requires.',
        ],
      },
      {
        h: 'Cookies',
        body: [
          'We use a cookie to keep you signed in and one to remember your language. The app also saves small settings in your browser, such as whether you’ve seen the tour. We don’t use advertising cookies or third-party trackers.',
        ],
      },
      {
        h: 'Age',
        body: ['Juno Pen is for adults. You must be 18 or older to use it, and we don’t knowingly collect data from children through accounts.'],
      },
      {
        h: 'Changes',
        body: ['If we change this policy in a meaningful way, we’ll tell you by email or in the app before the change takes effect. The date at the top shows the current version.'],
      },
    ],
  },

  es: {
    title: 'Política de privacidad',
    lede: 'Juno Pen convierte las grabaciones de tus conversaciones en transcripciones, notas y respuestas. Eso significa que manejamos material sensible: tu voz, la voz de otras personas y lo que dijo cada una. Esta página explica qué recopilamos, quién nos ayuda a procesarlo, cuánto tiempo lo guardamos y qué puedes hacer al respecto.',
    sections: [
      {
        h: 'Quiénes somos',
        body: [
          'Juno Pen es operado por [ENTITY], [ADDRESS] («Juno», «nosotros»). Decidimos cómo se usa la información de tu cuenta. El contenido de tus grabaciones lo procesamos por cuenta tuya y según tus instrucciones.',
          'Para cualquier tema de privacidad, escribe a [CONTACT EMAIL].',
        ],
      },
      {
        h: 'En resumen',
        body: [
          {
            list: [
              'Tus grabaciones, transcripciones y notas son privadas de tu cuenta.',
              'Están cifradas en tránsito y en reposo.',
              'Puedes borrar cualquier grabación cuando quieras.',
              'Nunca vendemos tus datos ni los compartimos para publicidad.',
              'Un pequeño grupo de proveedores nos ayuda a operar Juno Pen (los listamos abajo). Procesan tus datos solo para prestarnos su servicio.',
            ],
          },
        ],
      },
      {
        h: 'Qué recopilamos',
        body: [
          {
            list: [
              'Cuenta: tu correo, y tu nombre y foto de perfil si inicias sesión con Google.',
              'Registro: tu nombre, correo, teléfono (opcional), tu rol, la nota que escribas y, si te enviamos un lápiz, tu dirección de envío.',
              'Perfil: lo que nos cuentas en Ajustes, como tu rol, tu organización, los idiomas que hablas, palabras que usas seguido y cómo quieres tus notas.',
              'Grabaciones: los archivos de audio que subes o envías por WhatsApp, su nombre, fecha y duración, y las transcripciones que pegas.',
              'Lo que generamos a partir de ellas: transcripciones, nombres de quién habla, notas, resúmenes, tareas, traducciones, respuestas del chat y documentos, además de lo que edites.',
              'Personas: nombres, correos, roles y descripciones breves de las personas que agregas o que aceptas de nuestras sugerencias.',
              'Nombres escuchados: los nombres de personas dichos en tus grabaciones, cuándo se dijeron, quién los dijo y unas palabras de contexto y, en grabaciones de eventos, las distintas conversaciones que contienen. Se detectan automáticamente para que puedas buscarlos y elegir quién era quién. Nadie pasa a tus contactos a menos que tú lo elijas.',
              'WhatsApp e iMessage: tu número cuando lo vinculas, los mensajes y archivos que envías a Juno Pen, y nuestras respuestas, incluidos los recordatorios y resúmenes que te enviamos.',
              'Google Calendar (solo si lo conectas): los eventos de los calendarios que son tuyos (título, hora, lugar, invitados y descripción) y los eventos que Juno Pen agrega por ti.',
              'Pagos: tu plan, las fechas de prueba y renovación, y los registros de compra. Tu tarjeta la recibe y guarda Stripe. Nunca vemos ni guardamos el número completo.',
              'Uso: las páginas que visitas en nuestro sitio, la página desde la que llegaste, tu tipo de navegador y una ubicación aproximada (país y ciudad) que entrega nuestro proveedor de hosting. No guardamos tu dirección IP en nuestra base de datos; nuestros proveedores mantienen registros estándar de servidor.',
            ],
          },
        ],
      },
      {
        h: 'Cómo lo usamos',
        body: [
          {
            list: [
              'Para operar Juno Pen: transcribir grabaciones, escribir notas, responder tus preguntas, enviarte resúmenes por correo o WhatsApp y mantener tu archivo buscable.',
              'Para escribirte primero por WhatsApp o iMessage con recordatorios, resúmenes y sugerencias de tus reuniones, como un seguimiento que prometiste o una reunión que alguien propuso. Juno Pen te pregunta antes de actuar sobre cualquiera de ellas. Responde STOP para desactivar estos mensajes y START para volver a activarlos.',
              'Para gestionar tu cuenta y tus pagos, enviarte el lápiz y mandarte correos del servicio (bienvenida, fin de la prueba, problemas de pago).',
              'Para mantener el servicio seguro y funcionando, corregir problemas y evitar abusos.',
              'Para entender, en conjunto, cómo se usa el sitio y mejorarlo.',
              'Para cumplir obligaciones legales, como los registros tributarios y contables.',
            ],
          },
          'No usamos tus grabaciones para publicidad, y no vendemos ni arrendamos tus datos.',
        ],
      },
      {
        h: 'Las personas en tus grabaciones',
        body: [
          'Tus grabaciones casi siempre incluyen a otras personas. Tú decides qué grabar y subir, y eres responsable de contar con su permiso cuando la ley lo exige. En muchos lugares, como Florida y California, todas las personas de la conversación deben estar de acuerdo. Juno Pen te pide confirmar el consentimiento antes de procesar una grabación, y una grabación sin esa confirmación no se procesa.',
          'Juno Pen también anota los nombres dichos en una grabación, incluidas las personas que solo se mencionan. Quedan en tu cuenta, nunca se muestran a nadie más y se borran junto con la grabación.',
          'Quien aparezca en una grabación puede escribir a [CONTACT EMAIL]. Normalmente tendremos que involucrar al titular de la cuenta para responder.',
        ],
      },
      {
        h: 'Quién nos ayuda',
        body: [
          'Compartimos datos con estos proveedores solo para que hagan su trabajo para nosotros:',
          {
            list: [
              'Supabase (base de datos y almacenamiento de archivos): los datos de tu cuenta, grabaciones, transcripciones y notas.',
              'AssemblyAI (transcripción y traducción): el audio de tus grabaciones, y nombres y palabras de tu perfil y tu lista de personas que le ayudan a escribirlos bien.',
              'Anthropic (los modelos de IA que escriben notas, corrigen transcripciones, responden preguntas y redactan correos): transcripciones, notas, tu perfil y tus preguntas.',
              'Meta (WhatsApp, si lo usas): tu número, mensajes y archivos.',
              'Sendblue (iMessage, si lo usas): tu número, mensajes y archivos.',
              'Google Calendar (solo si lo conectas): leemos y agregamos eventos en tu propio calendario, como se explica más abajo en “Google Calendar”.',
              'Stripe (pagos): tu correo, plan y datos de pago.',
              'Notion (solo si lo conectas): las notas de tus grabaciones, enviadas a tu propio espacio de Notion. Ahí aplican los términos y la política de privacidad de Notion.',
              'Resend (envío de correos): tu correo y los correos que te enviamos, incluidos los resúmenes de reuniones, que contienen tus notas.',
              'Google (inicio de sesión): tu nombre, correo y foto de Google. También recibimos un aviso de cada registro nuevo en una cuenta de correo de Google.',
              'Vercel (hosting): todo el tráfico del sitio pasa por ahí.',
            ],
          },
          'También podemos revelar datos cuando la ley lo exija, para proteger la seguridad de alguien o nuestros derechos, o como parte de una fusión o venta del negocio; en ese caso, esta política sigue aplicándose a tus datos.',
        ],
      },
      {
        h: 'Google Calendar',
        body: [
          'Si conectas Google Calendar, Juno Pen le pide permiso a Google para ver, agregar y cambiar eventos en los calendarios que son tuyos. Lo usamos solo para tres cosas:',
          {
            list: [
              'Agregar los eventos que apruebas. Cuando una grabación menciona una reunión, Juno Pen te pregunta primero, por WhatsApp, iMessage o en el sitio. Agrega el evento solo después de que digas que sí, y nunca cambia ni borra un evento que no le pediste.',
              'Prepararte para tus reuniones. Leemos tus eventos de los próximos 7 días (título, hora, lugar, invitados y descripción) para enviarte un resumen breve antes de una reunión, con tus notas de conversaciones anteriores con las mismas personas.',
              'Cambiar o borrar un evento cuando lo pides. Si le pides a Juno Pen mover o borrar un evento, o agregarle un enlace de videollamada, lo busca por su nombre (desde ayer hasta 60 días adelante).',
            ],
          },
          'Para escribir un resumen o un recordatorio, los datos de ese evento se envían a Anthropic, que escribe el texto por nosotros y no entrena sus modelos con datos enviados por su API. No vendemos los datos de tu calendario, no los usamos para publicidad ni para entrenar modelos de IA, propios ni de terceros. Nadie en Juno Pen los lee salvo que tú nos lo pidas, sea necesario por seguridad o lo exija la ley.',
          'Puedes desconectar Google Calendar en Ajustes o en myaccount.google.com/permissions. En ese momento revocamos nuestro acceso y borramos los datos de calendario y los tokens que tengamos. Cuando nos pides borrar tu cuenta, hacemos lo mismo.',
          'El uso que Juno Pen hace de la información recibida de las API de Google, y su transferencia a cualquier otra app, se ajustará a la Política de datos de usuario de los servicios de API de Google (https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de Uso limitado.',
        ],
      },
      {
        h: 'Google Docs y Sheets',
        body: [
          'Si conectas Google Docs y Sheets, Juno Pen le pide a Google un solo permiso (drive.file): crear archivos en tu Google Drive y abrir solo los que Juno Pen creó. Juno Pen no puede ver ningún otro archivo de tu Drive.',
          'Juno Pen crea un Doc o una hoja solo cuando lo pides (las notas de una grabación, un plan que aprobaste, tus pendientes o contactos), dentro de una carpeta “Juno Pen”. Solo guardamos un token de acceso cifrado, compartido con Google Calendar si conectas ambos.',
          'Puedes desconectarlo en Ajustes → Google. Los archivos que hizo Juno Pen se quedan en tu Drive y son tuyos.',
        ],
      },
      {
        h: 'Granola',
        body: [
          'Si conectas Granola, Juno Pen guarda cifrada tu clave API o tu sesión de Granola y la usa solo para leer las reuniones que elijas importar (título, fecha, asistentes, transcripción, resumen y tus notas). Desconéctalo en Ajustes → Granola para borrarla.',
        ],
      },
      {
        h: 'IA y entrenamiento de modelos',
        body: [
          {
            list: [
              'No entrenamos modelos de IA propios con tus grabaciones.',
              'Los términos comerciales de Anthropic dicen que, por defecto, no entrena sus modelos con datos enviados a través de su API.',
              'Los términos de AssemblyAI le permiten usar ciertos archivos para mejorar sus modelos, después de un proceso pensado para eliminar la información personal, salvo que el cliente se haya excluido.',
            ],
          },
          'La IA se equivoca. Revisa las notas y respuestas antes de confiar en ellas.',
        ],
      },
      {
        h: 'Cuánto tiempo lo guardamos',
        body: [
          {
            list: [
              'Transcripciones, notas y todo lo demás de una grabación: hasta que las borres o nos pidas borrar tu cuenta.',
              'Archivos de audio: Eliminamos el archivo de audio de cada grabación 90 días después de que la subes, salvo que elijas Conservar este audio. La transcripción, las notas y todo lo demás se quedan hasta que borres la grabación.',
              'Cuando borras una grabación, la eliminamos junto con sus notas de nuestra base de datos, su audio de nuestro almacenamiento y la transcripción que hizo AssemblyAI. Pueden quedar copias en los respaldos de nuestros proveedores por un tiempo limitado.',
              'Si no la borras, la política estándar de AssemblyAI es borrar el audio en unas 48 horas y las transcripciones que guarda en unos 30 días. Las grabaciones enviadas por WhatsApp no se guardan en nuestro almacenamiento de archivos; guardamos su transcripción y sus notas.',
              'Mensajes de WhatsApp que nos envías: se guardan con tu cuenta hasta que nos pidas borrarlos.',
              'Google Calendar: leemos los próximos eventos cuando un resumen o una sugerencia los necesita. Solo guardamos los eventos que Juno Pen agregó por ti y los resúmenes que escribió. Cuando desconectas Google Calendar o nos pides borrar tu cuenta, revocamos nuestro acceso y borramos tus tokens de Google y los datos de calendario que tengamos.',
              'Registros de pagos y facturación: el tiempo que exija la ley tributaria y contable.',
              'Si tu plan termina, tu cuenta queda solo de lectura durante 12 meses para que puedas volver, y luego la eliminamos con sus grabaciones, transcripciones y notas. Si nos lo pides, las borramos antes.',
            ],
          },
        ],
      },
      {
        h: 'Tus derechos',
        body: [
          'Vivas donde vivas, puedes pedirnos:',
          {
            list: [
              'saber qué datos tenemos sobre ti y recibir una copia en un formato portable;',
              'corregirlos;',
              'borrarlos, incluida tu cuenta completa;',
              'dejar de usarlos, o limitar un uso en particular;',
              'retirar un consentimiento que hayas dado, sin afectar lo ocurrido antes.',
            ],
          },
          'Escribe a [CONTACT EMAIL]. Intentamos responder en un plazo de 15 días, y no te trataremos distinto por pedirlo.',
        ],
      },
      {
        h: 'Brasil (LGPD)',
        body: [
          'Tratamos tus datos para cumplir nuestro contrato contigo (tu cuenta y el servicio), por nuestro interés legítimo (seguridad, prevención de fraude, mejora del servicio), para cumplir obligaciones legales (como los registros tributarios) y, cuando lo pedimos, con tu consentimiento.',
          'Tienes los derechos del artículo 18 de la LGPD, entre ellos la confirmación del tratamiento, acceso, corrección, anonimización, bloqueo o eliminación de datos innecesarios, portabilidad, información sobre con quién los compartimos y revisión de decisiones tomadas solo por medios automatizados. También puedes reclamar ante la Autoridade Nacional de Proteção de Dados (ANPD).',
          'Nuestro encargado de protección de datos responde en [CONTACT EMAIL].',
        ],
      },
      {
        h: 'Chile',
        body: [
          'Tratamos los datos personales conforme a la Ley 19.628 y, desde el 1 de diciembre de 2026, a la nueva ley de protección de datos personales (Ley 21.719). Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, portabilidad y bloqueo escribiendo a [CONTACT EMAIL]. Desde el 1 de diciembre de 2026 también puedes reclamar ante la Agencia de Protección de Datos Personales.',
        ],
      },
      {
        h: 'Estados Unidos',
        body: [
          'No vendemos tu información personal ni la compartimos para publicidad conductual entre contextos. Los residentes de California y de otros estados con leyes de privacidad pueden ejercer los derechos de arriba para conocer, acceder, corregir y borrar sus datos, también mediante un agente autorizado. No te discriminaremos por ejercerlos.',
        ],
      },
      {
        h: 'Transferencias internacionales',
        body: [
          'La mayoría de nuestros proveedores está en Estados Unidos, así que tus datos se procesan ahí y posiblemente en otros países donde operan. Cuando los datos salen de Brasil, Chile u otro país, nos apoyamos en los compromisos contractuales de nuestros proveedores, incluidos sus términos de tratamiento de datos, para protegerlos.',
        ],
      },
      {
        h: 'Seguridad',
        body: [
          'Los datos están cifrados en tránsito (HTTPS) y en reposo. En la app, tus grabaciones solo son visibles para tu cuenta. Un pequeño número de personas en Juno puede acceder a nuestros sistemas para operarlos; miramos tu contenido solo cuando nos lo pides (por ejemplo, para soporte), para mantener el servicio seguro o cuando la ley lo exige. Ningún sistema es perfectamente seguro. Si una filtración afecta tus datos, te avisaremos a ti y a las autoridades según lo exija la ley.',
        ],
      },
      {
        h: 'Cookies',
        body: [
          'Usamos una cookie para mantener tu sesión iniciada y otra para recordar tu idioma. La app también guarda pequeños ajustes en tu navegador, como si ya viste el recorrido. No usamos cookies publicitarias ni rastreadores de terceros.',
        ],
      },
      {
        h: 'Edad',
        body: ['Juno Pen es para adultos. Debes tener 18 años o más para usarlo, y no recopilamos a sabiendas datos de menores mediante cuentas.'],
      },
      {
        h: 'Cambios',
        body: ['Si cambiamos esta política de forma importante, te avisaremos por correo o en la app antes de que el cambio entre en vigor. La fecha de arriba indica la versión vigente.'],
      },
    ],
  },

  pt: {
    title: 'Política de privacidade',
    lede: 'O Juno Pen transforma gravações das suas conversas em transcrições, notas e respostas. Isso significa que lidamos com material sensível: a sua voz, a voz de outras pessoas e o que cada uma disse. Esta página explica o que coletamos, quem nos ajuda a processar, por quanto tempo guardamos e o que você pode fazer a respeito.',
    sections: [
      {
        h: 'Quem somos',
        body: [
          'O Juno Pen é operado por [ENTITY], [ADDRESS] (“Juno”, “nós”). Somos o controlador das informações da sua conta. O conteúdo das suas gravações nós tratamos em seu nome e conforme as suas instruções.',
          'Para qualquer assunto de privacidade, escreva para [CONTACT EMAIL].',
        ],
      },
      {
        h: 'Em resumo',
        body: [
          {
            list: [
              'Suas gravações, transcrições e notas são privadas da sua conta.',
              'Elas são criptografadas em trânsito e em repouso.',
              'Você pode apagar qualquer gravação quando quiser.',
              'Nunca vendemos seus dados nem os compartilhamos para publicidade.',
              'Um pequeno grupo de fornecedores nos ajuda a operar o Juno Pen (listados abaixo). Eles tratam seus dados apenas para nos prestar o serviço deles.',
            ],
          },
        ],
      },
      {
        h: 'O que coletamos',
        body: [
          {
            list: [
              'Conta: seu e-mail, e seu nome e foto de perfil se você entrar com o Google.',
              'Cadastro: seu nome, e-mail, telefone (opcional), sua função, a observação que você escrever e, se enviarmos uma caneta, seu endereço de entrega.',
              'Perfil: o que você informa em Configurações, como sua função, sua organização, os idiomas que fala, palavras que usa com frequência e como quer suas notas.',
              'Gravações: os arquivos de áudio que você envia pelo site ou pelo WhatsApp, o nome, a data e a duração deles, e as transcrições que você cola.',
              'O que geramos a partir delas: transcrições, nomes de quem fala, notas, resumos, tarefas, traduções, respostas do chat e documentos, além das suas edições.',
              'Pessoas: nomes, e-mails, funções e descrições curtas das pessoas que você adiciona ou aceita das nossas sugestões.',
              'Nomes ouvidos: os nomes de pessoas ditos nas suas gravações, quando foram ditos, quem os disse e algumas palavras de contexto e, em gravações de eventos, as diferentes conversas que elas contêm. São detectados automaticamente para você poder buscá-los e escolher quem era quem. Ninguém vira contato a menos que você escolha.',
              'WhatsApp e iMessage: seu número quando você o vincula, as mensagens e arquivos que você envia ao Juno Pen e as nossas respostas, incluindo os lembretes e resumos que enviamos.',
              'Google Agenda (só se você conectar): os eventos das agendas que são suas (título, horário, local, convidados e descrição) e os eventos que o Juno Pen adiciona para você.',
              'Pagamentos: seu plano, as datas de teste e renovação e os registros de compra. Seu cartão é coletado e guardado pela Stripe. Nunca vemos nem guardamos o número completo.',
              'Uso: as páginas que você visita no site, a página de onde você veio, o tipo de navegador e uma localização aproximada (país e cidade) informada pelo nosso provedor de hospedagem. Não guardamos seu endereço IP no nosso banco de dados; nossos fornecedores mantêm registros padrão de servidor.',
            ],
          },
        ],
      },
      {
        h: 'Como usamos',
        body: [
          {
            list: [
              'Para operar o Juno Pen: transcrever gravações, escrever notas, responder às suas perguntas, enviar resumos por e-mail ou WhatsApp e manter seu arquivo pesquisável.',
              'Para te mandar mensagens primeiro pelo WhatsApp ou iMessage com lembretes, resumos e sugestões das suas reuniões, como um retorno que você prometeu ou uma reunião que alguém propôs. O Juno Pen pergunta antes de agir sobre qualquer uma delas. Responda STOP para desativar essas mensagens e START para ativá-las de novo.',
              'Para gerenciar sua conta e seus pagamentos, enviar sua caneta e mandar e-mails do serviço (boas-vindas, fim do teste, problemas de pagamento).',
              'Para manter o serviço seguro e funcionando, corrigir problemas e evitar abusos.',
              'Para entender, de forma agregada, como o site é usado e melhorá-lo.',
              'Para cumprir obrigações legais, como registros fiscais e contábeis.',
            ],
          },
          'Não usamos suas gravações para publicidade e não vendemos nem alugamos seus dados.',
        ],
      },
      {
        h: 'As pessoas nas suas gravações',
        body: [
          'Suas gravações quase sempre incluem outras pessoas. Você decide o que gravar e enviar, e é responsável por ter a permissão delas quando a lei exigir. Em muitos lugares, como a Flórida e a Califórnia, todos na conversa precisam concordar. O Juno Pen pede que você confirme o consentimento antes de processar uma gravação, e uma gravação sem essa confirmação não é processada.',
          'O Juno Pen também anota os nomes ditos em uma gravação, incluindo pessoas que são só mencionadas. Ficam na sua conta, nunca são mostrados a mais ninguém e são apagados junto com a gravação.',
          'Quem aparece em uma gravação pode escrever para [CONTACT EMAIL]. Normalmente precisaremos envolver o titular da conta para responder.',
        ],
      },
      {
        h: 'Quem nos ajuda',
        body: [
          'Compartilhamos dados com estes fornecedores apenas para que façam o trabalho deles para nós:',
          {
            list: [
              'Supabase (banco de dados e armazenamento de arquivos): os dados da sua conta, gravações, transcrições e notas.',
              'AssemblyAI (transcrição e tradução): o áudio das suas gravações, e nomes e palavras do seu perfil e da sua lista de pessoas que a ajudam a escrevê-los corretamente.',
              'Anthropic (os modelos de IA que escrevem notas, corrigem transcrições, respondem perguntas e redigem e-mails): transcrições, notas, seu perfil e suas perguntas.',
              'Meta (WhatsApp, se você usar): seu número, mensagens e arquivos.',
              'Sendblue (iMessage, se você usar): seu número, mensagens e arquivos.',
              'Google Agenda (só se você conectar): lemos e adicionamos eventos na sua própria agenda, como explicado abaixo em “Google Agenda”.',
              'Stripe (pagamentos): seu e-mail, plano e dados de pagamento.',
              'Notion (só se você conectar): as notas das suas gravações, enviadas para o seu próprio espaço no Notion. Lá valem os termos e a política de privacidade do Notion.',
              'Resend (envio de e-mails): seu e-mail e os e-mails que enviamos a você, incluindo os resumos de reuniões, que contêm suas notas.',
              'Google (login): seu nome, e-mail e foto do Google. Também recebemos um aviso de cada novo cadastro em uma conta de e-mail do Google.',
              'Vercel (hospedagem): todo o tráfego do site passa por ela.',
            ],
          },
          'Também podemos divulgar dados quando a lei exigir, para proteger a segurança de alguém ou os nossos direitos, ou como parte de uma fusão ou venda do negócio; nesse caso, esta política continua valendo para os seus dados.',
        ],
      },
      {
        h: 'Google Agenda',
        body: [
          'Se você conectar o Google Agenda, o Juno Pen pede permissão ao Google para ver, adicionar e alterar eventos nas agendas que são suas. Usamos isso só para três coisas:',
          {
            list: [
              'Adicionar os eventos que você aprova. Quando uma gravação menciona uma reunião, o Juno Pen pergunta primeiro, pelo WhatsApp, iMessage ou pelo site. Ele só adiciona o evento depois que você disser sim, e nunca altera nem apaga um evento que você não pediu.',
              'Te preparar para reuniões. Lemos seus eventos dos próximos 7 dias (título, horário, local, convidados e descrição) para te mandar um resumo curto antes de uma reunião, com suas notas de conversas anteriores com as mesmas pessoas.',
              'Alterar ou apagar um evento quando você pede. Se você pedir ao Juno Pen para mover ou apagar um evento, ou adicionar um link de videochamada, ele procura esse evento pelo nome (de ontem até 60 dias à frente).',
            ],
          },
          'Para escrever um resumo ou um lembrete, os dados desse evento são enviados à Anthropic, que escreve o texto para nós e não treina seus modelos com dados enviados pela sua API. Não vendemos os dados da sua agenda, não os usamos para publicidade nem para treinar modelos de IA, nossos ou de terceiros. Ninguém no Juno Pen os lê, a não ser que você peça, que seja necessário por segurança ou que a lei exija.',
          'Você pode desconectar o Google Agenda em Configurações ou em myaccount.google.com/permissions. Nesse momento revogamos nosso acesso e apagamos os dados de agenda e os tokens que tivermos. Quando você nos pede para apagar sua conta, fazemos o mesmo.',
          'O uso e a transferência, para qualquer outro app, de informações recebidas das APIs do Google pelo Juno Pen seguirão a Política de Dados do Usuário dos Serviços de API do Google (https://developers.google.com/terms/api-services-user-data-policy), incluindo os requisitos de Uso Limitado.',
        ],
      },
      {
        h: 'Google Docs e Planilhas',
        body: [
          'Se você conectar o Google Docs e Planilhas, o Juno Pen pede ao Google uma única permissão (drive.file): criar arquivos no seu Google Drive e abrir só os que o Juno Pen criou. O Juno Pen não vê nenhum outro arquivo do seu Drive.',
          'O Juno Pen cria um Doc ou uma planilha só quando você pede (as notas de uma gravação, um plano que você aprovou, suas tarefas ou contatos), numa pasta “Juno Pen”. Guardamos só um token de acesso criptografado, compartilhado com o Google Agenda se os dois estiverem conectados.',
          'Você pode desconectar em Configurações → Google. Os arquivos que o Juno Pen criou continuam no seu Drive e são seus.',
        ],
      },
      {
        h: 'Granola',
        body: [
          'Se você conectar o Granola, o Juno Pen guarda criptografada sua chave de API ou sessão do Granola e a usa só para ler as reuniões que você escolher importar (título, data, participantes, transcrição, resumo e suas notas). Desconecte em Configurações → Granola para apagá-la.',
        ],
      },
      {
        h: 'IA e treinamento de modelos',
        body: [
          {
            list: [
              'Não treinamos modelos de IA próprios com as suas gravações.',
              'Os termos comerciais da Anthropic dizem que, por padrão, ela não treina seus modelos com dados enviados pela API.',
              'Os termos da AssemblyAI permitem que ela use certos arquivos para melhorar seus modelos, após um processo feito para remover informações pessoais, a menos que o cliente tenha optado por não participar.',
            ],
          },
          'A IA erra. Confira as notas e respostas antes de confiar nelas.',
        ],
      },
      {
        h: 'Por quanto tempo guardamos',
        body: [
          {
            list: [
              'Transcrições, notas e todo o resto de uma gravação: até você apagá-las ou nos pedir para apagar sua conta.',
              'Arquivos de áudio: Apagamos o arquivo de áudio de cada gravação 90 dias após o envio, a menos que você escolha Manter este áudio. A transcrição, as notas e todo o resto ficam até você apagar a gravação.',
              'Quando você apaga uma gravação, removemos a gravação e as notas do nosso banco de dados, o áudio do nosso armazenamento e a transcrição feita pela AssemblyAI. Podem restar cópias nos backups dos nossos fornecedores por um tempo limitado.',
              'Se você não apagar, a política padrão da AssemblyAI é apagar o áudio em cerca de 48 horas e as transcrições que ela guarda em cerca de 30 dias. As gravações enviadas pelo WhatsApp não ficam no nosso armazenamento de arquivos; guardamos a transcrição e as notas.',
              'Mensagens de WhatsApp que você nos envia: ficam com a sua conta até você pedir para apagá-las.',
              'Google Agenda: lemos os próximos eventos quando um resumo ou uma sugestão precisa deles. Guardamos só os eventos que o Juno Pen adicionou para você e os resumos que escreveu. Quando você desconecta o Google Agenda ou nos pede para apagar sua conta, revogamos nosso acesso e apagamos seus tokens do Google e os dados de agenda que tivermos.',
              'Registros de pagamento e faturamento: pelo tempo que a legislação fiscal e contábil exigir.',
              'Se o seu plano terminar, sua conta fica somente leitura por 12 meses para você poder voltar, e depois a excluímos com as gravações, transcrições e notas. Se pedir, apagamos antes.',
            ],
          },
        ],
      },
      {
        h: 'Seus direitos',
        body: [
          'Onde quer que você more, pode nos pedir para:',
          {
            list: [
              'informar quais dados temos sobre você e entregar uma cópia em formato portável;',
              'corrigi-los;',
              'apagá-los, incluindo a conta inteira;',
              'parar de usá-los ou limitar um uso específico;',
              'revogar um consentimento que você deu, sem afetar o que aconteceu antes.',
            ],
          },
          'Escreva para [CONTACT EMAIL]. Procuramos responder em até 15 dias, e você não será tratado de forma diferente por pedir.',
        ],
      },
      {
        h: 'Brasil (LGPD)',
        body: [
          'Tratamos seus dados para executar o nosso contrato com você (sua conta e o serviço), com base no nosso legítimo interesse (segurança, prevenção de fraudes, melhoria do serviço), para cumprir obrigações legais (como registros fiscais) e, quando pedirmos, com o seu consentimento.',
          'Você tem os direitos do artigo 18 da LGPD, entre eles confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários, portabilidade, informação sobre com quem compartilhamos e revisão de decisões tomadas unicamente com base em tratamento automatizado. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
          'Nosso encarregado pelo tratamento de dados pessoais atende em [CONTACT EMAIL].',
        ],
      },
      {
        h: 'Chile',
        body: [
          'Tratamos dados pessoais conforme a Lei 19.628 e, a partir de 1º de dezembro de 2026, a nova lei de proteção de dados pessoais (Lei 21.719). Você pode exercer seus direitos de acesso, retificação, exclusão, oposição, portabilidade e bloqueio escrevendo para [CONTACT EMAIL]. A partir de 1º de dezembro de 2026 você também pode reclamar à Agencia de Protección de Datos Personales.',
        ],
      },
      {
        h: 'Estados Unidos',
        body: [
          'Não vendemos suas informações pessoais nem as compartilhamos para publicidade comportamental entre contextos. Moradores da Califórnia e de outros estados com leis de privacidade podem usar os direitos acima para conhecer, acessar, corrigir e apagar seus dados, inclusive por meio de um agente autorizado. Você não será discriminado por usá-los.',
        ],
      },
      {
        h: 'Transferências internacionais',
        body: [
          'A maioria dos nossos fornecedores fica nos Estados Unidos, então seus dados são tratados lá e possivelmente em outros países onde eles operam. Quando os dados saem do Brasil, do Chile ou de outro país, contamos com os compromissos contratuais dos nossos fornecedores, incluindo seus termos de tratamento de dados, para protegê-los.',
        ],
      },
      {
        h: 'Segurança',
        body: [
          'Os dados são criptografados em trânsito (HTTPS) e em repouso. No app, suas gravações são visíveis apenas para a sua conta. Um pequeno número de pessoas na Juno pode acessar nossos sistemas para operá-los; olhamos o seu conteúdo apenas quando você pede (por exemplo, para suporte), para manter o serviço seguro ou quando a lei exige. Nenhum sistema é perfeitamente seguro. Se um incidente afetar seus dados, avisaremos você e as autoridades conforme a lei exigir.',
        ],
      },
      {
        h: 'Cookies',
        body: [
          'Usamos um cookie para manter você conectado e outro para lembrar seu idioma. O app também salva pequenas configurações no seu navegador, como se você já viu o tour. Não usamos cookies de publicidade nem rastreadores de terceiros.',
        ],
      },
      {
        h: 'Idade',
        body: ['O Juno Pen é para adultos. É preciso ter 18 anos ou mais para usá-lo, e não coletamos intencionalmente dados de menores por meio de contas.'],
      },
      {
        h: 'Alterações',
        body: ['Se mudarmos esta política de forma relevante, avisaremos você por e-mail ou no app antes de a mudança valer. A data no topo indica a versão atual.'],
      },
    ],
  },
}
