// Juno Pen terms of service, EN / ES / PT.
//
// Plans, trials and the fair-use line follow lib/pen/plan.ts and lib/pen/checkout.ts as of
// 27 Sep 2026. Amounts are deliberately not repeated here (they are shown at checkout), so a
// price change doesn't make the terms wrong. If trial lengths or the 100-hour line change,
// change them here too.

import type { Lang, LegalDoc } from './types'

export const TERMS: Record<Lang, LegalDoc> = {
  en: {
    title: 'Terms of Service',
    lede: 'These terms are the agreement between you and [ENTITY] for using Juno Pen: the website, the app, the WhatsApp service and the recorder. By creating an account or paying, you accept them. Please read our Privacy Policy too.',
    sections: [
      {
        h: 'The service',
        body: [
          'Juno Pen transcribes the recordings you give it and turns them into notes, to-dos, people, answers and drafts. You can upload files on the website, paste in transcripts or send recordings on WhatsApp. We may also post you a recording pen.',
          'You sign in with a Google account, and you must be 18 or older.',
        ],
      },
      {
        h: 'Your recordings and consent',
        body: [
          'You are responsible for what you record and upload. Recording people without their permission is illegal in many places; in Florida, for example, everyone must agree, and breaking that rule is a crime. Only upload recordings for which you have the consent the law requires. Juno Pen asks you to confirm this before it processes a recording.',
          'Don’t use Juno Pen to record or process anything illegal, to harass or watch people, or in a way that breaks a duty of confidentiality you have (for example, as a lawyer or health professional), unless you are allowed to.',
          'Juno Pen is not designed for protected health information and does not sign HIPAA business associate agreements. Don’t use it for that.',
        ],
      },
      {
        h: 'Your content',
        body: [
          'Your recordings, transcripts and notes are yours. You allow us to store, process and transmit them only to provide Juno Pen to you, including through the providers named in our Privacy Policy. We don’t claim ownership of them and we don’t sell them.',
        ],
      },
      {
        h: 'AI output',
        body: [
          'Notes, summaries, answers and drafts are written by AI. They can be wrong or incomplete, or put words in the wrong person’s mouth. Check them before relying on them or sending them to anyone. They are not legal, financial, medical or other professional advice.',
        ],
      },
      {
        h: 'Plans, trials and renewals',
        body: [
          {
            list: [
              'Plans are monthly, every 6 months or yearly, with the Juno pen or with your own recorder. The price, the currency and what is included are shown before you pay.',
              'Monthly plans start with a free trial: 7 days with your own recorder, 21 days with the pen. We take a card at signup and charge it when the trial ends, unless you cancel first. If there is no valid card when the trial ends, the plan is cancelled.',
              'On the monthly pen plan, the pen is a one-time charge at signup. On the 6-month and yearly plans, the pen is included and the plan is paid up front, with no trial.',
              'Plans renew automatically for the same length until you cancel. We will tell you before a price change applies to you.',
              'Where tax applies, it is shown at checkout.',
              'If a payment fails, your account is put on hold until the card is updated. Your recordings stay.',
            ],
          },
        ],
      },
      {
        h: 'Cancelling',
        body: [
          'You can cancel at any time from Settings → Billing, from the link in our emails, or by writing to [CONTACT EMAIL]. Cancelling stops the next renewal; you keep access until the end of the period you have paid for.',
        ],
      },
      {
        h: 'Refunds',
        body: [
          'Payments are non-refundable, including for partial periods and unused time, except where the law of the country you live in gives you a right to cancel or to a refund that cannot be waived (for example, the seven-day right of withdrawal for online purchases in Brazil). Nothing in these terms limits those rights.',
        ],
      },
      {
        h: 'Fair use',
        body: [
          'Recording is unlimited, up to a fair-use ceiling of 100 hours of processed audio a month, which resets at midnight on the 1st, Pacific Time. Past it, new recordings are saved but not transcribed until the next month, or until you buy extra hours if we offer them. Extra hours are one-time purchases, non-refundable, and don’t expire while your account is open.',
          'We may limit or suspend accounts that put an unreasonable load on the service or appear to be automated.',
        ],
      },
      {
        h: 'The pen',
        body: [
          'The Juno pen is a recorder made by a third-party manufacturer. We post it to the address you give us, in the countries offered at signup. Delivery times are estimates.',
          'If it arrives damaged or doesn’t work, tell us within 14 days of delivery and we will replace it. Apart from that, and any warranty the manufacturer gives, the pen is provided as it is. The pen is yours to keep.',
        ],
      },
      {
        h: 'WhatsApp',
        body: [
          'The WhatsApp service runs on Meta’s WhatsApp through our messaging provider, and you must follow WhatsApp’s own terms. It may be unavailable when they are. A recording sent on WhatsApp is processed only after you confirm that everyone agreed to be recorded.',
        ],
      },
      {
        h: 'Acceptable use',
        body: [
          'Don’t:',
          {
            list: [
              'break the law or anyone else’s rights;',
              'try to get into other people’s accounts or data;',
              'reverse-engineer, overload or scrape the service;',
              'resell it without our agreement;',
              'upload malicious software.',
            ],
          },
        ],
      },
      {
        h: 'Suspension and closing your account',
        body: [
          'We can suspend or close accounts that break these terms, recording without consent above all, or that don’t pay. Where it’s reasonable, we will warn you first. You can close your account at any time by writing to us; our Privacy Policy explains what happens to your data.',
        ],
      },
      {
        h: 'Availability and changes',
        body: [
          'We work to keep Juno Pen running, but it may sometimes be unavailable, and features may change. We may change these terms. For meaningful changes we will tell you in advance by email or in the app, and using Juno Pen after the change takes effect means you accept it.',
        ],
      },
      {
        h: 'Liability',
        body: [
          'As far as the law allows, Juno Pen is provided “as is”. We are not liable for indirect or consequential losses, or for lost profits, data or business. Our total liability for any claim is limited to the greater of what you paid us in the 12 months before the claim and 50 US dollars.',
          'These limits don’t apply where the law doesn’t allow them, including for fraud or for death or injury caused by negligence, and they don’t reduce the consumer rights you have under the law of the country you live in.',
        ],
      },
      {
        h: 'Law and disputes',
        body: [
          'These terms are governed by the laws of the State of California, USA. If you are a consumer, you also keep the protection of the mandatory laws of the country you live in, and you can bring a claim in its courts. Please write to [CONTACT EMAIL] first: most problems can be solved directly.',
        ],
      },
      {
        h: 'Contact',
        body: ['[ENTITY], [ADDRESS]. [CONTACT EMAIL].'],
      },
    ],
  },

  es: {
    title: 'Términos del servicio',
    lede: 'Estos términos son el acuerdo entre tú y [ENTITY] para usar Juno Pen: el sitio web, la app, el servicio por WhatsApp y la grabadora. Al crear una cuenta o pagar, los aceptas. Lee también nuestra Política de privacidad.',
    sections: [
      {
        h: 'El servicio',
        body: [
          'Juno Pen transcribe las grabaciones que le das y las convierte en notas, tareas, personas, respuestas y borradores. Puedes subir archivos en el sitio, pegar transcripciones o enviar grabaciones por WhatsApp. También podemos enviarte un lápiz grabador.',
          'Inicias sesión con una cuenta de Google y debes tener 18 años o más.',
        ],
      },
      {
        h: 'Tus grabaciones y el consentimiento',
        body: [
          'Eres responsable de lo que grabas y subes. Grabar a personas sin su permiso es ilegal en muchos lugares; en Florida, por ejemplo, todos deben estar de acuerdo, e incumplirlo es un delito. Sube solo grabaciones para las que tengas el consentimiento que exige la ley. Juno Pen te pide confirmarlo antes de procesar una grabación.',
          'No uses Juno Pen para grabar o procesar algo ilegal, para acosar o vigilar a personas, ni de una forma que rompa un deber de confidencialidad que tengas (por ejemplo, como abogado o profesional de la salud), salvo que estés autorizado.',
          'Juno Pen no está diseñado para información de salud protegida y no firma acuerdos HIPAA. No lo uses para eso.',
        ],
      },
      {
        h: 'Tu contenido',
        body: [
          'Tus grabaciones, transcripciones y notas son tuyas. Nos permites guardarlas, procesarlas y transmitirlas solo para prestarte Juno Pen, también a través de los proveedores indicados en nuestra Política de privacidad. No reclamamos su propiedad y no las vendemos.',
        ],
      },
      {
        h: 'Lo que escribe la IA',
        body: [
          'Las notas, resúmenes, respuestas y borradores los escribe una IA. Pueden estar equivocados o incompletos, o atribuir palabras a la persona equivocada. Revísalos antes de confiar en ellos o enviarlos a alguien. No son asesoría legal, financiera, médica ni profesional de ningún tipo.',
        ],
      },
      {
        h: 'Planes, pruebas y renovaciones',
        body: [
          {
            list: [
              'Los planes son mensuales, semestrales o anuales, con el lápiz Juno o con tu propia grabadora. El precio, la moneda y lo que incluye se muestran antes de pagar.',
              'Los planes mensuales empiezan con una prueba gratis: 7 días con tu propia grabadora, 21 días con el lápiz. Pedimos una tarjeta al registrarte y la cobramos cuando termina la prueba, salvo que canceles antes. Si no hay una tarjeta válida al terminar la prueba, el plan se cancela.',
              'En el plan mensual con lápiz, el lápiz se cobra una sola vez al registrarte. En los planes semestral y anual, el lápiz está incluido y el plan se paga por adelantado, sin prueba.',
              'Los planes se renuevan automáticamente por el mismo período hasta que canceles. Te avisaremos antes de que un cambio de precio se aplique a ti.',
              'Cuando corresponde algún impuesto, se muestra al pagar.',
              'Si un pago falla, tu cuenta queda en pausa hasta que actualices la tarjeta. Tus grabaciones se mantienen.',
            ],
          },
        ],
      },
      {
        h: 'Cancelar',
        body: [
          'Puedes cancelar cuando quieras desde Ajustes → Facturación, desde el enlace en nuestros correos, o escribiendo a [CONTACT EMAIL]. Cancelar detiene la próxima renovación; mantienes el acceso hasta el final del período que pagaste.',
        ],
      },
      {
        h: 'Reembolsos',
        body: [
          'Los pagos no son reembolsables, incluidos los períodos parciales y el tiempo no usado, salvo cuando la ley del país donde vives te dé un derecho de retracto o de reembolso irrenunciable (por ejemplo, el derecho de arrepentimiento de siete días para compras en línea en Brasil). Nada en estos términos limita esos derechos.',
        ],
      },
      {
        h: 'Uso justo',
        body: [
          'La grabación es ilimitada, hasta un tope de uso justo de 100 horas de audio procesado al mes, que se reinicia a la medianoche del día 1, hora del Pacífico. Pasado ese tope, las grabaciones nuevas se guardan pero no se transcriben hasta el mes siguiente, o hasta que compres horas extra si las ofrecemos. Las horas extra son compras únicas, no reembolsables, y no vencen mientras tu cuenta esté abierta.',
          'Podemos limitar o suspender cuentas que generen una carga excesiva en el servicio o que parezcan automatizadas.',
        ],
      },
      {
        h: 'El lápiz',
        body: [
          'El lápiz Juno es una grabadora fabricada por un tercero. Lo enviamos a la dirección que nos das, en los países ofrecidos al registrarte. Los plazos de entrega son estimados.',
          'Si llega dañado o no funciona, avísanos dentro de los 14 días desde la entrega y lo reemplazamos. Aparte de eso, y de la garantía que dé el fabricante, el lápiz se entrega tal como está. El lápiz es tuyo.',
        ],
      },
      {
        h: 'WhatsApp',
        body: [
          'El servicio por WhatsApp funciona sobre WhatsApp de Meta a través de nuestro proveedor de mensajería, y debes cumplir los términos de WhatsApp. Puede no estar disponible cuando ellos no lo estén. Una grabación enviada por WhatsApp se procesa solo después de que confirmes que todos aceptaron ser grabados.',
        ],
      },
      {
        h: 'Uso aceptable',
        body: [
          'No:',
          {
            list: [
              'infrinjas la ley ni los derechos de otros;',
              'intentes entrar en cuentas o datos de otras personas;',
              'hagas ingeniería inversa, sobrecargues o extraigas datos masivamente del servicio;',
              'lo revendas sin nuestro acuerdo;',
              'subas software malicioso.',
            ],
          },
        ],
      },
      {
        h: 'Suspensión y cierre de tu cuenta',
        body: [
          'Podemos suspender o cerrar cuentas que incumplan estos términos, sobre todo por grabar sin consentimiento, o que no paguen. Cuando sea razonable, te avisaremos antes. Puedes cerrar tu cuenta cuando quieras escribiéndonos; nuestra Política de privacidad explica qué pasa con tus datos.',
        ],
      },
      {
        h: 'Disponibilidad y cambios',
        body: [
          'Trabajamos para que Juno Pen funcione siempre, pero a veces puede no estar disponible, y las funciones pueden cambiar. Podemos cambiar estos términos. Si el cambio es importante, te avisaremos con anticipación por correo o en la app, y seguir usando Juno Pen después de que entre en vigor significa que lo aceptas.',
        ],
      },
      {
        h: 'Responsabilidad',
        body: [
          'En la medida en que la ley lo permita, Juno Pen se entrega «tal cual». No respondemos por daños indirectos o consecuenciales, ni por lucro cesante, pérdida de datos o de negocio. Nuestra responsabilidad total por cualquier reclamo se limita al mayor valor entre lo que nos pagaste en los 12 meses anteriores al reclamo y 50 dólares estadounidenses.',
          'Estos límites no se aplican cuando la ley no los permite, incluidos el fraude o la muerte o lesiones causadas por negligencia, y no reducen los derechos que te da como consumidor la ley del país donde vives.',
        ],
      },
      {
        h: 'Ley aplicable y disputas',
        body: [
          'Estos términos se rigen por las leyes del Estado de California, EE. UU. Si eres consumidor, mantienes además la protección de las leyes obligatorias del país donde vives y puedes presentar un reclamo ante sus tribunales. Antes, escríbenos a [CONTACT EMAIL]: la mayoría de los problemas se resuelven directamente.',
        ],
      },
      {
        h: 'Contacto',
        body: ['[ENTITY], [ADDRESS]. [CONTACT EMAIL].'],
      },
    ],
  },

  pt: {
    title: 'Termos de serviço',
    lede: 'Estes termos são o acordo entre você e [ENTITY] para usar o Juno Pen: o site, o app, o serviço pelo WhatsApp e o gravador. Ao criar uma conta ou pagar, você os aceita. Leia também a nossa Política de privacidade.',
    sections: [
      {
        h: 'O serviço',
        body: [
          'O Juno Pen transcreve as gravações que você envia e as transforma em notas, tarefas, pessoas, respostas e rascunhos. Você pode enviar arquivos pelo site, colar transcrições ou mandar gravações pelo WhatsApp. Também podemos enviar a você uma caneta gravadora.',
          'Você entra com uma conta do Google e precisa ter 18 anos ou mais.',
        ],
      },
      {
        h: 'Suas gravações e o consentimento',
        body: [
          'Você é responsável pelo que grava e envia. Gravar pessoas sem permissão é ilegal em muitos lugares; na Flórida, por exemplo, todos precisam concordar, e descumprir isso é crime. Envie apenas gravações para as quais você tenha o consentimento que a lei exige. O Juno Pen pede que você confirme isso antes de processar uma gravação.',
          'Não use o Juno Pen para gravar ou processar algo ilegal, para assediar ou vigiar pessoas, nem de um jeito que quebre um dever de sigilo que você tenha (por exemplo, como advogado ou profissional de saúde), a menos que tenha autorização.',
          'O Juno Pen não foi feito para informações de saúde protegidas e não assina acordos HIPAA. Não o use para isso.',
        ],
      },
      {
        h: 'Seu conteúdo',
        body: [
          'Suas gravações, transcrições e notas são suas. Você nos autoriza a armazená-las, processá-las e transmiti-las apenas para prestar o Juno Pen a você, inclusive por meio dos fornecedores indicados na nossa Política de privacidade. Não reivindicamos a propriedade delas e não as vendemos.',
        ],
      },
      {
        h: 'O que a IA escreve',
        body: [
          'Notas, resumos, respostas e rascunhos são escritos por IA. Podem estar errados ou incompletos, ou atribuir falas à pessoa errada. Confira antes de confiar neles ou enviá-los a alguém. Eles não são aconselhamento jurídico, financeiro, médico ou profissional de qualquer tipo.',
        ],
      },
      {
        h: 'Planos, testes e renovações',
        body: [
          {
            list: [
              'Os planos são mensais, semestrais ou anuais, com a caneta Juno ou com o seu próprio gravador. O preço, a moeda e o que está incluído aparecem antes do pagamento.',
              'Os planos mensais começam com um teste grátis: 7 dias com o seu próprio gravador, 21 dias com a caneta. Pedimos um cartão no cadastro e cobramos quando o teste termina, a menos que você cancele antes. Se não houver um cartão válido quando o teste terminar, o plano é cancelado.',
              'No plano mensal com caneta, a caneta é cobrada uma única vez no cadastro. Nos planos semestral e anual, a caneta está incluída e o plano é pago adiantado, sem teste.',
              'Os planos se renovam automaticamente pelo mesmo período até você cancelar. Avisaremos antes que uma mudança de preço valha para você.',
              'Quando houver imposto, ele aparece no pagamento.',
              'Se um pagamento falhar, sua conta fica suspensa até o cartão ser atualizado. Suas gravações continuam lá.',
            ],
          },
        ],
      },
      {
        h: 'Cancelamento',
        body: [
          'Você pode cancelar quando quiser em Configurações → Cobrança, pelo link nos nossos e-mails, ou escrevendo para [CONTACT EMAIL]. O cancelamento interrompe a próxima renovação; você mantém o acesso até o fim do período já pago.',
        ],
      },
      {
        h: 'Reembolsos',
        body: [
          'Os pagamentos não são reembolsáveis, inclusive por períodos parciais e tempo não usado, exceto quando a lei do país onde você mora garantir um direito de arrependimento ou de reembolso que não pode ser renunciado (por exemplo, o direito de arrependimento de sete dias para compras pela internet no Brasil, previsto no artigo 49 do Código de Defesa do Consumidor). Nada nestes termos limita esses direitos.',
        ],
      },
      {
        h: 'Uso justo',
        body: [
          'A gravação é ilimitada, até um teto de uso justo de 100 horas de áudio processado por mês, que é reiniciado à meia-noite do dia 1º, no horário do Pacífico. Passado esse teto, as novas gravações são salvas, mas só são transcritas no mês seguinte, ou quando você comprar horas extras, se as oferecermos. Horas extras são compras avulsas, não reembolsáveis, e não expiram enquanto sua conta estiver aberta.',
          'Podemos limitar ou suspender contas que gerem uma carga excessiva no serviço ou pareçam automatizadas.',
        ],
      },
      {
        h: 'A caneta',
        body: [
          'A caneta Juno é um gravador fabricado por terceiros. Enviamos para o endereço que você informar, nos países oferecidos no cadastro. Os prazos de entrega são estimativas.',
          'Se chegar danificada ou não funcionar, avise-nos em até 14 dias após a entrega e nós a substituímos. Fora isso, e da garantia que o fabricante oferecer, a caneta é entregue no estado em que se encontra. A caneta é sua.',
        ],
      },
      {
        h: 'WhatsApp',
        body: [
          'O serviço pelo WhatsApp funciona no WhatsApp da Meta por meio do nosso provedor de mensagens, e você deve seguir os termos do WhatsApp. Ele pode ficar indisponível quando eles estiverem. Uma gravação enviada pelo WhatsApp só é processada depois que você confirma que todos concordaram em ser gravados.',
        ],
      },
      {
        h: 'Uso aceitável',
        body: [
          'Não:',
          {
            list: [
              'viole a lei ou os direitos de outras pessoas;',
              'tente entrar em contas ou dados de outras pessoas;',
              'faça engenharia reversa, sobrecarregue ou extraia dados em massa do serviço;',
              'revenda o serviço sem o nosso acordo;',
              'envie software malicioso.',
            ],
          },
        ],
      },
      {
        h: 'Suspensão e encerramento da conta',
        body: [
          'Podemos suspender ou encerrar contas que violem estes termos, sobretudo por gravar sem consentimento, ou que não paguem. Quando for razoável, avisaremos antes. Você pode encerrar sua conta quando quiser escrevendo para nós; a nossa Política de privacidade explica o que acontece com os seus dados.',
        ],
      },
      {
        h: 'Disponibilidade e alterações',
        body: [
          'Trabalhamos para manter o Juno Pen funcionando, mas ele pode ficar indisponível às vezes, e os recursos podem mudar. Podemos alterar estes termos. Se a mudança for relevante, avisaremos com antecedência por e-mail ou no app, e continuar usando o Juno Pen depois que ela valer significa que você a aceita.',
        ],
      },
      {
        h: 'Responsabilidade',
        body: [
          'Na medida permitida pela lei, o Juno Pen é fornecido “no estado em que se encontra”. Não respondemos por danos indiretos ou consequenciais, nem por lucros cessantes, perda de dados ou de negócios. Nossa responsabilidade total por qualquer reclamação fica limitada ao maior valor entre o que você nos pagou nos 12 meses anteriores à reclamação e 50 dólares americanos.',
          'Esses limites não se aplicam quando a lei não os permite, inclusive em caso de fraude ou de morte ou lesão causada por negligência, e não reduzem os direitos que você tem como consumidor pela lei do país onde mora.',
        ],
      },
      {
        h: 'Lei aplicável e disputas',
        body: [
          'Estes termos são regidos pelas leis do Estado da Califórnia, EUA. Se você é consumidor, mantém também a proteção das leis obrigatórias do país onde mora e pode fazer uma reclamação nos tribunais de lá. Antes, escreva para [CONTACT EMAIL]: a maioria dos problemas se resolve diretamente.',
        ],
      },
      {
        h: 'Contato',
        body: ['[ENTITY], [ADDRESS]. [CONTACT EMAIL].'],
      },
    ],
  },
}
