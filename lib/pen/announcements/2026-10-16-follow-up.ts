// "Your meetings now follow up for you" (16 Oct 2026): the rebuild of 2026-10-16-smarter in the
// founder's structure (brand, headline, one sentence, three highlights, one button, short footer).
// The button depends on the person: open the chat if WhatsApp/iMessage is linked, else link it.
// Images in public/email/ are screenshots of the landing's own chat mockups (?m=en|es|pt).

import type { Announcement } from './index'

const L = (en: string, es: string, pt: string) => ({ en, es, pt })

export default {
  slug: '2026-10-16-follow-up',
  from: 'Agustin at Juno Pen <agustin@send.tryjunoapp.com>',
  greet: 'inline',
  brand: { src: '/email/brand.png', alt: L('Juno Pen', 'Juno Pen', 'Juno Pen'), width: 168, height: 50 },
  subject: L(
    'Your meetings now follow up for you',
    'Tus reuniones ahora hacen el seguimiento por ti',
    'Agora suas reuniões fazem o follow-up por você',
  ),
  headline: L(
    'Your meetings now follow up for you.',
    'Tus reuniones ahora hacen el seguimiento por ti.',
    'Agora suas reuniões fazem o follow-up por você.',
  ),
  intro: L(
    'Juno now acts on what it hears, so the dates, promises and to-dos from your conversations stop slipping through.',
    'Juno ahora actúa sobre lo que escucha, así que las fechas, promesas y pendientes de tus conversaciones ya no se te escapan.',
    'agora o Juno age a partir do que ouve, então as datas, promessas e tarefas das suas conversas não escapam mais.',
  ),
  introUnlinked: L(
    'Connect your WhatsApp once and Juno takes it from there.',
    'Conecta tu WhatsApp una vez y Juno se encarga del resto.',
    'Conecte seu WhatsApp uma vez e o Juno cuida do resto.',
  ),
  items: [
    {
      title: L('Never drop a follow-up.', 'No se te escapa ningún seguimiento.', 'Nenhum follow-up fica para trás.'),
      body: L(
        'After every recording, Juno texts you on WhatsApp what you promised and who’s waiting, and offers to set the reminder.',
        'Después de cada grabación, Juno te escribe por WhatsApp lo que prometiste y quién está esperando, y te ofrece programar el recordatorio.',
        'Depois de cada gravação, o Juno manda no WhatsApp o que você prometeu e quem está esperando, e se oferece para criar o lembrete.',
      ),
      image: {
        src: L('/email/follow-up-en.gif', '/email/follow-up-es.gif', '/email/follow-up-pt.gif'),
        alt: L(
          'A WhatsApp chat with Juno after a recording: the recap, what you still owe, and an offer to add Saturday’s viewing to your calendar.',
          'Un chat de WhatsApp con Juno después de una grabación: el resumen, lo que tienes pendiente y la oferta de agregar la visita del sábado a tu calendario.',
          'Uma conversa no WhatsApp com o Juno depois de uma gravação: o resumo, o que você ainda deve e a oferta de colocar a visita de sábado na agenda.',
        ),
        width: 480,
        height: 520,
      },
    },
    {
      title: L('Meetings land on your calendar by themselves.', 'Las reuniones llegan solas a tu calendario.', 'As reuniões entram sozinhas na sua agenda.'),
      body: L(
        'When someone says “Tuesday at 2”, Juno offers to add it with a Meet link and invite them. One reply, done.',
        'Cuando alguien dice “el martes a las 2”, Juno te ofrece agregarla con un enlace de Meet e invitar a esa persona. Una respuesta y listo.',
        'Quando alguém diz “terça às 14h”, o Juno oferece colocar na agenda com link do Meet e convidar a pessoa. Uma resposta e pronto.',
      ),
      image: {
        src: L('/email/calendar-en.png', '/email/calendar-es.png', '/email/calendar-pt.png'),
        alt: L(
          'Juno on WhatsApp: “Tom said Tuesday at 2. Add it to your calendar?” You: “Yes”.',
          'Juno en WhatsApp: “Tomás dijo martes a las 2. ¿Lo agrego a tu calendario?” Tú: “Sí”.',
          'Juno no WhatsApp: “O Tomás disse terça às 14h. Coloco na sua agenda?” Você: “Sim”.',
        ),
        width: 300,
        height: { en: 176, es: 204, pt: 203 },
      },
    },
    {
      title: L('Walk into every meeting prepared.', 'Llega a cada reunión con todo claro.', 'Chegue a cada reunião sabendo de tudo.'),
      body: L(
        'The evening before, Juno sends what you last talked about and what each side still owes.',
        'La noche anterior, Juno te manda de qué hablaron la última vez y lo que cada parte tiene pendiente.',
        'Na noite anterior, o Juno manda o que vocês conversaram da última vez e o que cada lado ainda deve.',
      ),
    },
  ],
  ctaByLink: {
    whatsapp: L('Text Juno on WhatsApp →', 'Escríbele a Juno por WhatsApp →', 'Fale com o Juno no WhatsApp →'),
    imessage: L('Text Juno on iMessage →', 'Escríbele a Juno por iMessage →', 'Fale com o Juno no iMessage →'),
    unlinked: L('Connect your WhatsApp →', 'Conecta tu WhatsApp →', 'Conecte seu WhatsApp →'),
    unlinkedPath: '/pen/settings/connections#whatsapp',
  },
  footer: L(
    'Reply to this email with ideas — I read every one.',
    'Responde este correo con ideas, leo cada una.',
    'Responda este e-mail com ideias. Eu leio todas.',
  ),
} satisfies Announcement
