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
              'Account: your name, email address and profile picture from Google sign-in.',
              'Signup: your name, email, phone number (optional), your role, any note you write and, if we post you a pen, your shipping address.',
              'Profile: what you tell us in Settings, such as your role, your organisation, the languages you speak, words you use often and how you want your notes written.',
              'Recordings: the audio files you upload or send on WhatsApp, their name, date and length, and any transcripts you paste in.',
              'What we make from them: transcripts, speaker names, notes, summaries, to-dos, translations, chat answers and documents, plus any edits you make.',
              'People: the names, email addresses, roles and short descriptions of people you add, or that you accept from our suggestions.',
              'WhatsApp: your phone number once you link it, the messages and files you send to Juno Pen, and our replies.',
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
              'Vonage and Meta (WhatsApp, if you use it): your phone number, messages and files.',
              'Stripe (payments): your email, plan and payment details.',
              'Resend (email delivery): your email address and the emails we send you, including meeting briefings, which contain your notes.',
              'Google (sign-in): your Google name, email and picture. We are also notified of new signups at a Google email account.',
              'Vercel (hosting): all traffic to the site passes through it.',
            ],
          },
          'We may also disclose data when the law requires it, to protect someone’s safety or our rights, or as part of a merger or sale of the business, in which case this policy keeps applying to your data.',
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
              'Recordings, transcripts and notes: until you delete them, or ask us to delete your account.',
              'When you delete a recording, we remove it and its notes from our database and its audio from our storage. Copies can remain in our providers’ backups for a limited time.',
              'AssemblyAI’s standard policy is to delete audio within about 48 hours and the transcripts it keeps within about 30 days. Recordings sent on WhatsApp are not kept in our own file storage; we keep their transcript and notes.',
              'WhatsApp messages you send us: kept with your account until you ask us to delete them.',
              'Payment and billing records: as long as tax and accounting law requires.',
              'If your subscription ends, we keep your recordings so you can come back, unless you ask us to delete them.',
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
              'Cuenta: tu nombre, correo y foto de perfil desde el inicio de sesión con Google.',
              'Registro: tu nombre, correo, teléfono (opcional), tu rol, la nota que escribas y, si te enviamos un lápiz, tu dirección de envío.',
              'Perfil: lo que nos cuentas en Ajustes, como tu rol, tu organización, los idiomas que hablas, palabras que usas seguido y cómo quieres tus notas.',
              'Grabaciones: los archivos de audio que subes o envías por WhatsApp, su nombre, fecha y duración, y las transcripciones que pegas.',
              'Lo que generamos a partir de ellas: transcripciones, nombres de quién habla, notas, resúmenes, tareas, traducciones, respuestas del chat y documentos, además de lo que edites.',
              'Personas: nombres, correos, roles y descripciones breves de las personas que agregas o que aceptas de nuestras sugerencias.',
              'WhatsApp: tu número cuando lo vinculas, los mensajes y archivos que envías a Juno Pen, y nuestras respuestas.',
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
              'Vonage y Meta (WhatsApp, si lo usas): tu número, mensajes y archivos.',
              'Stripe (pagos): tu correo, plan y datos de pago.',
              'Resend (envío de correos): tu correo y los correos que te enviamos, incluidos los resúmenes de reuniones, que contienen tus notas.',
              'Google (inicio de sesión): tu nombre, correo y foto de Google. También recibimos un aviso de cada registro nuevo en una cuenta de correo de Google.',
              'Vercel (hosting): todo el tráfico del sitio pasa por ahí.',
            ],
          },
          'También podemos revelar datos cuando la ley lo exija, para proteger la seguridad de alguien o nuestros derechos, o como parte de una fusión o venta del negocio; en ese caso, esta política sigue aplicándose a tus datos.',
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
              'Grabaciones, transcripciones y notas: hasta que las borres o nos pidas borrar tu cuenta.',
              'Cuando borras una grabación, la eliminamos junto con sus notas de nuestra base de datos, y su audio de nuestro almacenamiento. Pueden quedar copias en los respaldos de nuestros proveedores por un tiempo limitado.',
              'La política estándar de AssemblyAI es borrar el audio en unas 48 horas y las transcripciones que guarda en unos 30 días. Las grabaciones enviadas por WhatsApp no se guardan en nuestro almacenamiento de archivos; guardamos su transcripción y sus notas.',
              'Mensajes de WhatsApp que nos envías: se guardan con tu cuenta hasta que nos pidas borrarlos.',
              'Registros de pagos y facturación: el tiempo que exija la ley tributaria y contable.',
              'Si tu suscripción termina, guardamos tus grabaciones para que puedas volver, salvo que nos pidas borrarlas.',
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
              'Conta: seu nome, e-mail e foto de perfil do login com o Google.',
              'Cadastro: seu nome, e-mail, telefone (opcional), sua função, a observação que você escrever e, se enviarmos uma caneta, seu endereço de entrega.',
              'Perfil: o que você informa em Configurações, como sua função, sua organização, os idiomas que fala, palavras que usa com frequência e como quer suas notas.',
              'Gravações: os arquivos de áudio que você envia pelo site ou pelo WhatsApp, o nome, a data e a duração deles, e as transcrições que você cola.',
              'O que geramos a partir delas: transcrições, nomes de quem fala, notas, resumos, tarefas, traduções, respostas do chat e documentos, além das suas edições.',
              'Pessoas: nomes, e-mails, funções e descrições curtas das pessoas que você adiciona ou aceita das nossas sugestões.',
              'WhatsApp: seu número quando você o vincula, as mensagens e arquivos que você envia ao Juno Pen e as nossas respostas.',
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
              'Vonage e Meta (WhatsApp, se você usar): seu número, mensagens e arquivos.',
              'Stripe (pagamentos): seu e-mail, plano e dados de pagamento.',
              'Resend (envio de e-mails): seu e-mail e os e-mails que enviamos a você, incluindo os resumos de reuniões, que contêm suas notas.',
              'Google (login): seu nome, e-mail e foto do Google. Também recebemos um aviso de cada novo cadastro em uma conta de e-mail do Google.',
              'Vercel (hospedagem): todo o tráfego do site passa por ela.',
            ],
          },
          'Também podemos divulgar dados quando a lei exigir, para proteger a segurança de alguém ou os nossos direitos, ou como parte de uma fusão ou venda do negócio; nesse caso, esta política continua valendo para os seus dados.',
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
              'Gravações, transcrições e notas: até você apagá-las ou nos pedir para apagar sua conta.',
              'Quando você apaga uma gravação, removemos a gravação e as notas do nosso banco de dados e o áudio do nosso armazenamento. Podem restar cópias nos backups dos nossos fornecedores por um tempo limitado.',
              'A política padrão da AssemblyAI é apagar o áudio em cerca de 48 horas e as transcrições que ela guarda em cerca de 30 dias. As gravações enviadas pelo WhatsApp não ficam no nosso armazenamento de arquivos; guardamos a transcrição e as notas.',
              'Mensagens de WhatsApp que você nos envia: ficam com a sua conta até você pedir para apagá-las.',
              'Registros de pagamento e faturamento: pelo tempo que a legislação fiscal e contábil exigir.',
              'Se a sua assinatura terminar, guardamos suas gravações para você poder voltar, a menos que peça para apagá-las.',
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
