// The profile questions in Spanish and Portuguese, for the Settings form only.
//
// Stored values stay English (role values, chip options, choice values): the server cleans
// answers against the English lists in profile-fields.ts and the notes prompt reads them.
// This file only changes what is drawn on screen. A missing entry falls back to the English.

import type { Lang } from './i18n'
import type { Question, Role } from './profile-fields'

type RoleText = Partial<Pick<Role, 'title' | 'hint' | 'followTitle' | 'orgLabel' | 'orgPlaceholder'>>
type QText = { label?: string; placeholder?: string }
type Pack = {
  roles: Record<string, RoleText>
  /** Keyed `${role}.${question key}`. */
  questions: Record<string, QText>
  /** Chip options and choice titles/hints, keyed by the English text. */
  options: Record<string, string>
}

const es: Pack = {
  roles: {
    realtor: { title: 'Bienes raíces', hint: 'Corredor, agente o en un equipo', followTitle: 'Tu trabajo inmobiliario', orgLabel: 'Corredora', orgPlaceholder: 'p. ej. RE/MAX' },
    student: { title: 'Estudiante', hint: 'Universidad, posgrado o un curso', followTitle: 'Tus estudios', orgLabel: 'Universidad', orgPlaceholder: 'p. ej. Universidad de Chile' },
    consultant: { title: 'Consultor', hint: 'Asesoría, agencia o independiente', followTitle: 'Tu trabajo de consultoría', orgLabel: 'Empresa', orgPlaceholder: 'p. ej. independiente, o el nombre de la firma' },
    sales: { title: 'Ventas', hint: 'Ejecutivo comercial, SDR o fundador que vende', followTitle: 'Lo que vendes', orgLabel: 'Empresa', orgPlaceholder: 'p. ej. Acme' },
    founder: { title: 'Fundador o ejecutivo', hint: 'Diriges una empresa o un equipo', followTitle: 'Tu empresa', orgLabel: 'Empresa', orgPlaceholder: 'p. ej. Acme' },
    other: { title: 'Otra cosa', hint: 'Cuéntanos con tus palabras', followTitle: 'Un poco más', orgLabel: 'Dónde trabajas o estudias', orgPlaceholder: 'Opcional' },
  },
  questions: {
    'realtor.market': { label: 'Ciudad o mercado', placeholder: 'p. ej. Providencia y Las Condes' },
    'realtor.years': { label: 'Años en bienes raíces', placeholder: 'p. ej. 6' },
    'realtor.focus': { label: 'En qué te enfocas' },
    'realtor.team': { label: 'Cómo trabajas' },
    'realtor.typicalClient': { label: 'Tu cliente típico', placeholder: 'p. ej. Familias que compran su primera casa, presupuestos de 5.000 a 8.000 UF' },
    'student.major': { label: '¿Qué carrera o área estudias?', placeholder: 'p. ej. Ingeniería comercial' },
    'student.year': { label: 'Año' },
    'student.courses': { label: 'Ramos de este semestre', placeholder: 'p. ej. Finanzas corporativas, Estadística, Inglés' },
    'student.records': { label: 'Lo que grabas' },
    'consultant.practice': { label: 'Área de práctica', placeholder: 'p. ej. Estrategia de precios, operaciones, TI' },
    'consultant.industries': { label: 'Industrias con las que trabajas', placeholder: 'p. ej. Salud y software B2B' },
    'consultant.clients': { label: 'Quiénes son tus clientes', placeholder: 'p. ej. Gerentes de operaciones en empresas medianas' },
    'consultant.team': { label: 'Cómo trabajas' },
    'sales.sells': { label: 'Lo que vendes', placeholder: 'p. ej. Software de remuneraciones' },
    'sales.buyers': { label: 'A quién le vendes', placeholder: 'p. ej. Gerentes de personas en empresas de 50 a 500 personas' },
    'sales.cycle': { label: 'Ciclo de venta típico' },
    'sales.crm': { label: 'CRM que usas', placeholder: 'p. ej. HubSpot' },
    'founder.does': { label: 'Qué hace la empresa', placeholder: 'p. ej. Software de agenda para clínicas' },
    'founder.stage': { label: 'Etapa' },
    'founder.teamSize': { label: 'Tamaño del equipo', placeholder: 'p. ej. 12' },
    'founder.meetings': { label: 'Reuniones que grabas' },
    'other.work': { label: 'A qué te dedicas', placeholder: 'p. ej. Tengo una consulta de kinesiología y grabo los controles' },
  },
  options: {
    Buyers: 'Compradores', Sellers: 'Vendedores', Luxury: 'Lujo', Rentals: 'Arriendos', Commercial: 'Comercial',
    'New construction': 'Proyectos nuevos', Investors: 'Inversionistas',
    Solo: 'Solo', 'You handle your own clients.': 'Manejas tus propios clientes.',
    'On a team': 'En equipo', 'Clients and follow-ups are shared.': 'Los clientes y seguimientos se comparten.',
    'First year': 'Primer año', 'Second year': 'Segundo año', 'Third year': 'Tercer año', 'Final year': 'Último año',
    Graduate: 'Posgrado', Other: 'Otro',
    Lectures: 'Clases', Seminars: 'Seminarios', 'Study groups': 'Grupos de estudio', 'Office hours': 'Ayudantías',
    Interviews: 'Entrevistas', 'Club meetings': 'Reuniones de agrupaciones',
    Independent: 'Independiente', 'Your own clients and projects.': 'Tus propios clientes y proyectos.',
    'At a firm': 'En una firma', 'Work is staffed across a team.': 'El trabajo se reparte en un equipo.',
    'Same day': 'El mismo día', 'A few weeks': 'Unas semanas', 'A few months': 'Unos meses', 'Six months or more': 'Seis meses o más',
    'Pre-launch': 'Antes de lanzar', 'Early revenue': 'Primeras ventas', Growing: 'Creciendo', Established: 'Consolidada',
    Customers: 'Clientes', Hiring: 'Contrataciones', Team: 'Equipo', Board: 'Directorio', Partners: 'Socios',
  },
}

const pt: Pack = {
  roles: {
    realtor: { title: 'Imóveis', hint: 'Corretor, agente ou em equipe', followTitle: 'Seu trabalho com imóveis', orgLabel: 'Imobiliária', orgPlaceholder: 'ex.: Lopes' },
    student: { title: 'Estudante', hint: 'Faculdade, pós ou um curso', followTitle: 'Seus estudos', orgLabel: 'Faculdade', orgPlaceholder: 'ex.: USP' },
    consultant: { title: 'Consultor', hint: 'Consultoria, agência ou freelancer', followTitle: 'Seu trabalho de consultoria', orgLabel: 'Empresa', orgPlaceholder: 'ex.: autônomo, ou o nome da consultoria' },
    sales: { title: 'Vendas', hint: 'Executivo de contas, SDR ou fundador que vende', followTitle: 'O que você vende', orgLabel: 'Empresa', orgPlaceholder: 'ex.: Acme' },
    founder: { title: 'Fundador ou executivo', hint: 'Você comanda uma empresa ou equipe', followTitle: 'Sua empresa', orgLabel: 'Empresa', orgPlaceholder: 'ex.: Acme' },
    other: { title: 'Outra coisa', hint: 'Conte com suas palavras', followTitle: 'Um pouco mais', orgLabel: 'Onde você trabalha ou estuda', orgPlaceholder: 'Opcional' },
  },
  questions: {
    'realtor.market': { label: 'Cidade ou região', placeholder: 'ex.: Pinheiros e Vila Madalena' },
    'realtor.years': { label: 'Anos no mercado imobiliário', placeholder: 'ex.: 6' },
    'realtor.focus': { label: 'Seu foco' },
    'realtor.team': { label: 'Como você trabalha' },
    'realtor.typicalClient': { label: 'Seu cliente típico', placeholder: 'ex.: Casais comprando o primeiro apartamento, de R$ 600 mil a R$ 900 mil' },
    'student.major': { label: 'Qual é o seu curso ou área?', placeholder: 'ex.: Administração' },
    'student.year': { label: 'Ano' },
    'student.courses': { label: 'Disciplinas deste semestre', placeholder: 'ex.: Finanças corporativas, Estatística, Inglês' },
    'student.records': { label: 'O que você grava' },
    'consultant.practice': { label: 'Área de atuação', placeholder: 'ex.: Estratégia de preços, operações, TI' },
    'consultant.industries': { label: 'Setores com que você trabalha', placeholder: 'ex.: Saúde e software B2B' },
    'consultant.clients': { label: 'Quem são seus clientes', placeholder: 'ex.: Diretores de operações em indústrias médias' },
    'consultant.team': { label: 'Como você trabalha' },
    'sales.sells': { label: 'O que você vende', placeholder: 'ex.: Software de folha de pagamento' },
    'sales.buyers': { label: 'Para quem você vende', placeholder: 'ex.: Líderes de RH em empresas de 50 a 500 pessoas' },
    'sales.cycle': { label: 'Ciclo de venda típico' },
    'sales.crm': { label: 'CRM que você usa', placeholder: 'ex.: HubSpot' },
    'founder.does': { label: 'O que a empresa faz', placeholder: 'ex.: Software de agenda para clínicas' },
    'founder.stage': { label: 'Estágio' },
    'founder.teamSize': { label: 'Tamanho da equipe', placeholder: 'ex.: 12' },
    'founder.meetings': { label: 'Reuniões que você grava' },
    'other.work': { label: 'O que você faz', placeholder: 'ex.: Tenho uma clínica de fisioterapia e gravo as consultas de retorno' },
  },
  options: {
    Buyers: 'Compradores', Sellers: 'Vendedores', Luxury: 'Alto padrão', Rentals: 'Aluguel', Commercial: 'Comercial',
    'New construction': 'Lançamentos', Investors: 'Investidores',
    Solo: 'Sozinho', 'You handle your own clients.': 'Você cuida dos seus clientes.',
    'On a team': 'Em equipe', 'Clients and follow-ups are shared.': 'Clientes e retornos são compartilhados.',
    'First year': 'Primeiro ano', 'Second year': 'Segundo ano', 'Third year': 'Terceiro ano', 'Final year': 'Último ano',
    Graduate: 'Pós-graduação', Other: 'Outro',
    Lectures: 'Aulas', Seminars: 'Seminários', 'Study groups': 'Grupos de estudo', 'Office hours': 'Monitorias',
    Interviews: 'Entrevistas', 'Club meetings': 'Reuniões de grupos',
    Independent: 'Autônomo', 'Your own clients and projects.': 'Seus próprios clientes e projetos.',
    'At a firm': 'Numa consultoria', 'Work is staffed across a team.': 'O trabalho é dividido numa equipe.',
    'Same day': 'No mesmo dia', 'A few weeks': 'Algumas semanas', 'A few months': 'Alguns meses', 'Six months or more': 'Seis meses ou mais',
    'Pre-launch': 'Pré-lançamento', 'Early revenue': 'Primeiras vendas', Growing: 'Crescendo', Established: 'Consolidada',
    Customers: 'Clientes', Hiring: 'Contratações', Team: 'Equipe', Board: 'Conselho', Partners: 'Parceiros',
  },
}

const PACKS: Partial<Record<Lang, Pack>> = { es, pt }

export function roleText(r: Role, lang: Lang): Role {
  const t = PACKS[lang]?.roles[r.value]
  return t ? { ...r, ...t } : r
}

export function questionText(role: string, q: Question, lang: Lang): { label: string; placeholder?: string } {
  const t = PACKS[lang]?.questions[`${role}.${q.key}`]
  return { label: t?.label ?? q.label, placeholder: t?.placeholder ?? ('placeholder' in q ? q.placeholder : undefined) }
}

export function optionText(o: string, lang: Lang): string {
  return PACKS[lang]?.options[o] ?? o
}
