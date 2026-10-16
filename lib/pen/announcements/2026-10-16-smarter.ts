// "Juno just got smarter" (16 Oct 2026): the proactive WhatsApp assistant, chat actions,
// connectors and event days. First sent by hand to the founders only.

import type { Announcement } from './index'

export default {
  slug: '2026-10-16-smarter',
  from: 'Agustin at Juno Pen <agustin@send.tryjunoapp.com>',
  greet: true,
  subject: {
    en: 'Juno just got smarter',
    es: 'Juno ahora es más inteligente',
    pt: 'O Juno ficou mais inteligente',
  },
  intro: {
    en: 'Quick update from Juno, because a lot changed this week and most of it happens without you lifting a finger.',
    es: 'Una actualización rápida de Juno, porque esta semana cambió mucho y casi todo pasa sin que muevas un dedo.',
    pt: 'Uma atualização rápida do Juno, porque muita coisa mudou esta semana e quase tudo acontece sem você mexer um dedo.',
  },
  items: [
    {
      title: { en: 'Juno now texts you first.', es: 'Juno ahora te escribe primero.', pt: 'O Juno agora escreve primeiro.' },
      body: {
        en: 'After a recording, it tells you what it heard and offers to help: “Tom mentioned Saturday at 11. Add it to your calendar?” Reply yes and it’s done. The evening before a meeting it sends a short brief of what you last talked about, and it reminds you of what you promised. Reply STOP anytime.',
        es: 'Después de una grabación te cuenta lo que escuchó y te ofrece ayuda: “Tom mencionó el sábado a las 11. ¿Lo agrego a tu calendario?” Respondes que sí y listo. La noche antes de una reunión te manda un resumen breve de lo que hablaron la última vez, y te recuerda lo que prometiste. Responde STOP cuando quieras.',
        pt: 'Depois de uma gravação, ele conta o que ouviu e oferece ajuda: “O Tom falou em sábado às 11. Adiciono à sua agenda?” Você responde sim e pronto. Na noite antes de uma reunião ele manda um resumo curto do que vocês conversaram da última vez, e lembra o que você prometeu. Responda STOP quando quiser.',
      },
    },
    {
      title: { en: 'Do everything from WhatsApp.', es: 'Haz todo desde WhatsApp.', pt: 'Faça tudo pelo WhatsApp.' },
      body: {
        en: 'Ask about any meeting, merge contacts, send a briefing, translate, move an event, put your to-dos in a Google Sheet. One message does it.',
        es: 'Pregunta por cualquier reunión, une contactos, envía un resumen, traduce, mueve un evento, pon tus pendientes en una hoja de Google. Un mensaje basta.',
        pt: 'Pergunte sobre qualquer reunião, junte contatos, envie um resumo, traduza, mude um evento, coloque suas tarefas numa planilha do Google. Uma mensagem resolve.',
      },
    },
    {
      title: { en: 'Works with your tools.', es: 'Funciona con tus herramientas.', pt: 'Funciona com suas ferramentas.' },
      body: {
        en: 'Google Calendar (with Meet links and invites), Apple and Outlook calendars, Google Docs and Sheets, Notion, and imports from Granola, Plaud or Pocket.',
        es: 'Google Calendar (con enlaces de Meet e invitaciones), los calendarios de Apple y Outlook, Google Docs y Sheets, Notion, e importaciones desde Granola, Plaud o Pocket.',
        pt: 'Google Agenda (com links do Meet e convites), as agendas da Apple e do Outlook, Google Docs e Planilhas, Notion, e importações do Granola, Plaud ou Pocket.',
      },
    },
    {
      title: { en: 'Long days are one recording.', es: 'Los días largos son una sola grabación.', pt: 'Dias longos viram uma gravação só.' },
      body: {
        en: 'A conference or a full day of meetings becomes one recording, split into each conversation, with the names of the people you met.',
        es: 'Una conferencia o un día entero de reuniones se convierte en una grabación, separada en cada conversación, con los nombres de las personas que conociste.',
        pt: 'Uma conferência ou um dia inteiro de reuniões vira uma gravação, separada em cada conversa, com os nomes das pessoas que você conheceu.',
      },
    },
  ],
  signoff: {
    en: 'Just reply to this email with anything you’d like Juno to do. I read every one.\nAgustin',
    es: 'Responde este correo con lo que te gustaría que Juno hiciera. Leo cada uno.\nAgustin',
    pt: 'Responda este e-mail com qualquer coisa que você gostaria que o Juno fizesse. Eu leio todos.\nAgustin',
  },
} satisfies Announcement
