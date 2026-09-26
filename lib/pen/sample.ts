// The sample recording every new account starts with.
//
// An empty account can't show what Juno Pen does: the tour would point at blank cards. So a
// brand-new account gets one short, realistic property viewing in its language, already
// transcribed and written up, with named speakers. It costs nothing (no audio, nothing
// metered), is marked as a sample in its title, and deletes like any recording. It is only
// ever created once per account (profile.onboarding.sample), so deleting it sticks.

import { supabaseAdmin } from '@/lib/supabase'
import type { Lang } from './currency'
import type { PenNotes, Utterance } from './store'
import { getProfileRaw, markOnboarding } from './profile'

type Sample = { title: string; notes: PenNotes; turns: [string, string][]; names: Record<string, string> }

const SAMPLES: Record<Lang, Sample> = {
  en: {
    title: 'Sample: viewing at 42 Maple Avenue',
    names: { B: 'Sarah (sample)', C: 'Tom (sample)' },
    turns: [
      ['A', 'Come in, this is the living room. The whole floor was redone last spring.'],
      ['B', 'Oh, the light is lovely. Is that the kitchen through there?'],
      ['A', 'It is. New counters, new appliances, and the island stays.'],
      ['B', 'We love the kitchen. Honestly, parking is the thing for us.'],
      ['A', 'There is one covered space with the unit, round the back.'],
      ['C', 'Only one? We have two cars. What is the asking price again?'],
      ['A', 'Six forty-nine. The sellers have been flexible on closing dates.'],
      ['C', 'That is above what we wanted to spend. We said six twenty.'],
      ['B', 'Could the carport be enclosed? Then the second car could go on the street.'],
      ['A', 'Good question. I will check with the HOA and get back to you by Friday.'],
      ['B', 'Can we come back on Saturday with my mother? She would help us decide.'],
      ['A', 'Of course. I will book Saturday morning and send you comps for the street.'],
    ],
    notes: {
      meeting_type: 'Property viewing',
      headline: 'Maple Avenue viewing: kitchen won, parking and price in the way',
      summary:
        'Sarah and Tom viewed 42 Maple Avenue. Sarah loved the renovated kitchen; parking is their main concern, with one covered space for two cars. Tom says the $649k asking price is above their $620k budget. They asked to return on Saturday with Sarah’s mother.',
      people: [
        { name: 'Sarah', role: 'Buyer', speaker: 'B', note: 'Leads on design; parking is the deciding factor.' },
        { name: 'Tom', role: 'Buyer', speaker: 'C', note: 'Focused on price; budget is $620k.' },
      ],
      decisions: [{ decision: 'Second viewing on Saturday morning, with Sarah’s mother.', who: 'You and Sarah' }],
      actions: [
        { action: 'Check with the HOA whether the carport can be enclosed', owner: 'You', due: 'Friday', priority: 'high' },
        { action: 'Send comparable sales for the street', owner: 'You', due: 'This week', priority: 'normal' },
        { action: 'Book the Saturday morning viewing', owner: 'You', due: 'Today', priority: 'normal' },
      ],
      missed: [
        { item: 'They asked to come back with her mother', why: 'The strongest buying signal of the visit, in the last minute.' },
        { item: 'Tom named a number: $620k', why: 'A $29k gap to the asking price; worth raising with the sellers.' },
      ],
      open_questions: ['Can the carport be enclosed under the HOA rules?'],
      showing: {
        reactions: [{ feature: 'Kitchen', who: 'Sarah', sentiment: 'loved', quote: 'We love the kitchen.' }],
        objections: [
          { objection: 'Only one covered parking space', who: 'Tom', quote: 'Only one? We have two cars.' },
          { objection: 'Price above budget', who: 'Tom', quote: 'That is above what we wanted to spend.' },
        ],
        signals: [{ signal: 'Asked for a second viewing with family', strength: 'strong', quote: 'Can we come back on Saturday with my mother?' }],
        revealed_criteria: ['Two parking spaces', 'Budget around $620k'],
      },
    },
  },
  es: {
    title: 'Ejemplo: visita en Los Dominicos',
    names: { B: 'Sofía (ejemplo)', C: 'Tomás (ejemplo)' },
    turns: [
      ['A', 'Pasen, este es el living. Todo el piso se renovó la primavera pasada.'],
      ['B', 'Qué buena luz. ¿Esa es la cocina?'],
      ['A', 'Sí. Cubiertas nuevas, electrodomésticos nuevos, y la isla se queda.'],
      ['B', 'Nos encanta la cocina. La verdad, el tema para nosotros es el estacionamiento.'],
      ['A', 'Viene con un estacionamiento techado, atrás.'],
      ['C', '¿Uno solo? Tenemos dos autos. ¿Cuánto era el precio?'],
      ['A', 'Nueve mil ochocientas UF. Los dueños han sido flexibles con la fecha de entrega.'],
      ['C', 'Eso está sobre lo que queríamos gastar. Dijimos nueve mil quinientas.'],
      ['B', '¿Se podría techar el otro espacio? Así el segundo auto queda afuera.'],
      ['A', 'Buena pregunta. Consulto con la administración y les respondo el viernes.'],
      ['B', '¿Podemos volver el sábado con mi mamá? Nos ayudaría a decidir.'],
      ['A', 'Claro. Agendo el sábado en la mañana y les mando tasaciones de la calle.'],
    ],
    notes: {
      meeting_type: 'Property viewing',
      headline: 'Visita en Los Dominicos: la cocina gustó, estacionamiento y precio frenan',
      summary:
        'Sofía y Tomás visitaron el departamento en Los Dominicos. A Sofía le encantó la cocina remodelada; el estacionamiento es su principal duda, con un solo espacio techado para dos autos. Tomás dice que las 9.800 UF están sobre su presupuesto de 9.500 UF. Pidieron volver el sábado con la mamá de Sofía.',
      people: [
        { name: 'Sofía', role: 'Compradora', speaker: 'B', note: 'Decide el diseño; el estacionamiento define la compra.' },
        { name: 'Tomás', role: 'Comprador', speaker: 'C', note: 'Enfocado en el precio; presupuesto de 9.500 UF.' },
      ],
      decisions: [{ decision: 'Segunda visita el sábado en la mañana, con la mamá de Sofía.', who: 'Tú y Sofía' }],
      actions: [
        { action: 'Consultar con la administración si se puede techar el segundo espacio', owner: 'Tú', due: 'Viernes', priority: 'high' },
        { action: 'Enviar tasaciones de la calle', owner: 'Tú', due: 'Esta semana', priority: 'normal' },
        { action: 'Agendar la visita del sábado en la mañana', owner: 'Tú', due: 'Hoy', priority: 'normal' },
      ],
      missed: [
        { item: 'Pidieron volver con la mamá de ella', why: 'La señal de compra más fuerte de la visita, en el último minuto.' },
        { item: 'Tomás dijo un número: 9.500 UF', why: 'Una diferencia de 300 UF con el precio; vale la pena plantearla a los dueños.' },
      ],
      open_questions: ['¿Se puede techar el segundo espacio según el reglamento?'],
      showing: {
        reactions: [{ feature: 'Cocina', who: 'Sofía', sentiment: 'loved', quote: 'Nos encanta la cocina.' }],
        objections: [
          { objection: 'Un solo estacionamiento techado', who: 'Tomás', quote: '¿Uno solo? Tenemos dos autos.' },
          { objection: 'Precio sobre el presupuesto', who: 'Tomás', quote: 'Eso está sobre lo que queríamos gastar.' },
        ],
        signals: [{ signal: 'Pidieron una segunda visita con familia', strength: 'strong', quote: '¿Podemos volver el sábado con mi mamá?' }],
        revealed_criteria: ['Dos estacionamientos', 'Presupuesto cercano a 9.500 UF'],
      },
    },
  },
  pt: {
    title: 'Exemplo: visita nos Jardins',
    names: { B: 'Sofia (exemplo)', C: 'Tomás (exemplo)' },
    turns: [
      ['A', 'Entrem, esta é a sala. O andar todo foi reformado na primavera passada.'],
      ['B', 'Que luz boa. Aquela é a cozinha?'],
      ['A', 'É. Bancadas novas, eletrodomésticos novos, e a ilha fica.'],
      ['B', 'Amamos a cozinha. Sinceramente, a questão para nós é a vaga.'],
      ['A', 'Tem uma vaga coberta com o apartamento, nos fundos.'],
      ['C', 'Só uma? Temos dois carros. Qual era o preço mesmo?'],
      ['A', 'Um milhão e duzentos. Os donos têm sido flexíveis com a data de entrega.'],
      ['C', 'Está acima do que queríamos gastar. Falamos em um milhão e cem.'],
      ['B', 'Dá para cobrir a outra vaga? Aí o segundo carro fica na rua.'],
      ['A', 'Boa pergunta. Consulto o condomínio e respondo até sexta.'],
      ['B', 'Podemos voltar no sábado com a minha mãe? Ela ajudaria a decidir.'],
      ['A', 'Claro. Marco sábado de manhã e mando as avaliações da rua.'],
    ],
    notes: {
      meeting_type: 'Property viewing',
      headline: 'Visita nos Jardins: a cozinha agradou, vaga e preço travam',
      summary:
        'Sofia e Tomás visitaram o apartamento nos Jardins. Sofia amou a cozinha reformada; a vaga é a principal dúvida, com uma só vaga coberta para dois carros. Tomás diz que o preço de R$ 1,2 milhão está acima do orçamento de R$ 1,1 milhão. Pediram para voltar no sábado com a mãe de Sofia.',
      people: [
        { name: 'Sofia', role: 'Compradora', speaker: 'B', note: 'Decide o design; a vaga define a compra.' },
        { name: 'Tomás', role: 'Comprador', speaker: 'C', note: 'Focado no preço; orçamento de R$ 1,1 milhão.' },
      ],
      decisions: [{ decision: 'Segunda visita no sábado de manhã, com a mãe de Sofia.', who: 'Você e Sofia' }],
      actions: [
        { action: 'Consultar o condomínio sobre cobrir a segunda vaga', owner: 'Você', due: 'Sexta', priority: 'high' },
        { action: 'Enviar avaliações da rua', owner: 'Você', due: 'Esta semana', priority: 'normal' },
        { action: 'Marcar a visita de sábado de manhã', owner: 'Você', due: 'Hoje', priority: 'normal' },
      ],
      missed: [
        { item: 'Pediram para voltar com a mãe dela', why: 'O sinal de compra mais forte da visita, no último minuto.' },
        { item: 'Tomás disse um número: R$ 1,1 milhão', why: 'Uma diferença de R$ 100 mil para o preço; vale levar aos donos.' },
      ],
      open_questions: ['O regulamento permite cobrir a segunda vaga?'],
      showing: {
        reactions: [{ feature: 'Cozinha', who: 'Sofia', sentiment: 'loved', quote: 'Amamos a cozinha.' }],
        objections: [
          { objection: 'Só uma vaga coberta', who: 'Tomás', quote: 'Só uma? Temos dois carros.' },
          { objection: 'Preço acima do orçamento', who: 'Tomás', quote: 'Está acima do que queríamos gastar.' },
        ],
        signals: [{ signal: 'Pediram segunda visita com a família', strength: 'strong', quote: 'Podemos voltar no sábado com a minha mãe?' }],
        revealed_criteria: ['Duas vagas', 'Orçamento perto de R$ 1,1 milhão'],
      },
    },
  },
}

/** Seconds per spoken word, to give the sample believable timestamps. */
const SEC_PER_WORD = 0.42

/**
 * Creates the sample for a new account, once. "New" means no recordings and no sample made
 * before; an existing user who already has recordings never gets one.
 */
export async function ensureSample(email: string, lang: Lang, userName?: string | null): Promise<boolean> {
  const profile = await getProfileRaw(email).catch(() => null)
  if (profile?.onboarding?.sample) return false
  const { count } = await supabaseAdmin.from('pen_sessions').select('id', { count: 'exact', head: true }).eq('user_email', email)
  if ((count ?? 0) > 0) {
    await markOnboarding(email, 'sample').catch(() => {})
    return false
  }

  const s = SAMPLES[lang]
  let t = 0
  const utterances: Utterance[] = s.turns.map(([speaker, text]) => {
    const dur = Math.round(text.split(/\s+/).length * SEC_PER_WORD * 1000)
    const u = { speaker, text, start: t, end: t + dur }
    t += dur + 600
    return u
  })
  const me = userName?.trim() || (lang === 'es' ? 'Tú' : lang === 'pt' ? 'Você' : 'You')
  // A fixed time ("yesterday, 10:30 UTC"), not "now minus a day": the page can render several
  // times at once for a new account, and with one deterministic recorded_at the sessions dedupe
  // index (user_email, source_name, recorded_at) lets only the first insert through. Measured:
  // five samples in 50 ms before this.
  const y = new Date(Date.now() - 24 * 3600 * 1000)
  const recordedAt = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate(), 10, 30)).toISOString()

  const { error } = await supabaseAdmin.from('pen_sessions').insert({
    user_email: email,
    storage_path: 'sample:',
    source_name: `sample-${lang}.m4a`,
    mime: 'audio/mp4',
    bytes: 1,
    duration_sec: Math.round(t / 1000),
    recorded_at: recordedAt,
    consent: true,
    title: s.title,
    status: 'noted',
    transcript: { text: utterances.map((u) => u.text).join(' '), utterances },
    notes: s.notes,
    meeting_type: s.notes.meeting_type,
    speaker_map: {
      A: { name: me, me: true, source: 'auto' },
      B: { name: s.names.B, source: 'auto' },
      C: { name: s.names.C, source: 'auto' },
    },
    language: lang,
    source_channel: 'sample',
    // Counts for nothing against the fair-use meter.
    metered_at: recordedAt,
    metered_sec: 0,
  })
  // 23505: another render got there first. That is success, not failure.
  if (error && error.code !== '23505') throw new Error(error.message)
  await markOnboarding(email, 'sample')
  return true
}
