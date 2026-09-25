// The profile's shape and questions, with no server imports, so the settings form can use them.
//
// Broad first, then specific. Everyone answers the same three or four questions; picking
// what you do then opens the questions that only make sense for that kind of work. A student
// is asked for their major, a realtor for their brokerage, and nobody is asked both.
//
// The questions are data rather than markup so the form, the server-side cleaning and the
// prompt paragraph all read the same list and cannot drift apart.

export type Question =
  | { key: string; kind: 'text'; label: string; placeholder?: string; wide?: boolean }
  | { key: string; kind: 'textarea'; label: string; placeholder?: string }
  /** `single` for questions with one true answer (a year, a stage); otherwise pick any. */
  | { key: string; kind: 'chips'; label: string; options: readonly string[]; single?: boolean }
  | { key: string; kind: 'choice'; label: string; options: readonly { value: string; title: string; hint: string }[] }

export type Role = {
  value: string
  title: string
  hint: string
  /** Heading over this role's own questions. */
  followTitle: string
  /** What an organisation is called for this role: brokerage, school, firm. */
  orgLabel: string
  orgPlaceholder: string
  questions: Question[]
}

export const ROLES: Role[] = [
  {
    value: 'realtor',
    followTitle: 'Your real estate work',
    title: 'Real estate',
    hint: 'Agent, broker, or on a team',
    orgLabel: 'Brokerage',
    orgPlaceholder: 'e.g. Compass',
    questions: [
      { key: 'market', kind: 'text', label: 'City or market', placeholder: 'e.g. Coral Gables and Coconut Grove' },
      { key: 'years', kind: 'text', label: 'Years in real estate', placeholder: 'e.g. 6' },
      { key: 'focus', kind: 'chips', label: 'What you focus on', options: ['Buyers', 'Sellers', 'Luxury', 'Rentals', 'Commercial', 'New construction', 'Investors'] },
      {
        key: 'team',
        kind: 'choice',
        label: 'How you work',
        options: [
          { value: 'solo', title: 'Solo', hint: 'You handle your own clients.' },
          { value: 'team', title: 'On a team', hint: 'Clients and follow-ups are shared.' },
        ],
      },
      { key: 'typicalClient', kind: 'textarea', label: 'Your typical client', placeholder: 'e.g. First-time buyers relocating for work, budgets of $600k to $900k' },
    ],
  },
  {
    value: 'student',
    followTitle: 'Your studies',
    title: 'Student',
    hint: 'College, grad school, or a course',
    orgLabel: 'School',
    orgPlaceholder: 'e.g. Indiana University',
    questions: [
      { key: 'major', kind: 'text', label: "What's your major or field?", placeholder: 'e.g. Finance' },
      { key: 'year', kind: 'chips', label: 'Year', options: ['First year', 'Second year', 'Third year', 'Final year', 'Graduate', 'Other'], single: true },
      { key: 'courses', kind: 'textarea', label: 'Courses this term', placeholder: 'e.g. Corporate Finance, Intro to Statistics, Spanish 201' },
      { key: 'records', kind: 'chips', label: 'What you record', options: ['Lectures', 'Seminars', 'Study groups', 'Office hours', 'Interviews', 'Club meetings'] },
    ],
  },
  {
    value: 'consultant',
    followTitle: 'Your consulting work',
    title: 'Consultant',
    hint: 'Advisory, agency, or freelance',
    orgLabel: 'Firm',
    orgPlaceholder: 'e.g. independent, or the firm name',
    questions: [
      { key: 'practice', kind: 'text', label: 'Practice area', placeholder: 'e.g. Pricing strategy, operations, IT' },
      { key: 'industries', kind: 'text', label: 'Industries you work with', placeholder: 'e.g. Healthcare and B2B software' },
      { key: 'clients', kind: 'textarea', label: 'Who your clients are', placeholder: 'e.g. COOs at mid-size manufacturers' },
      {
        key: 'team',
        kind: 'choice',
        label: 'How you work',
        options: [
          { value: 'solo', title: 'Independent', hint: 'Your own clients and projects.' },
          { value: 'team', title: 'At a firm', hint: 'Work is staffed across a team.' },
        ],
      },
    ],
  },
  {
    value: 'sales',
    followTitle: 'What you sell',
    title: 'Sales',
    hint: 'Account executive, SDR, or founder selling',
    orgLabel: 'Company',
    orgPlaceholder: 'e.g. Acme',
    questions: [
      { key: 'sells', kind: 'text', label: 'What you sell', placeholder: 'e.g. Payroll software' },
      { key: 'buyers', kind: 'text', label: 'Who you sell to', placeholder: 'e.g. HR leaders at 50 to 500 person companies' },
      { key: 'cycle', kind: 'chips', label: 'Typical sales cycle', options: ['Same day', 'A few weeks', 'A few months', 'Six months or more'], single: true },
      { key: 'crm', kind: 'text', label: 'CRM you use', placeholder: 'e.g. HubSpot' },
    ],
  },
  {
    value: 'founder',
    followTitle: 'Your company',
    title: 'Founder or executive',
    hint: 'Running a company or a team',
    orgLabel: 'Company',
    orgPlaceholder: 'e.g. Acme',
    questions: [
      { key: 'does', kind: 'text', label: 'What the company does', placeholder: 'e.g. Scheduling software for clinics' },
      { key: 'stage', kind: 'chips', label: 'Stage', options: ['Pre-launch', 'Early revenue', 'Growing', 'Established'], single: true },
      { key: 'teamSize', kind: 'text', label: 'Team size', placeholder: 'e.g. 12' },
      { key: 'meetings', kind: 'chips', label: 'Meetings you record', options: ['Customers', 'Investors', 'Hiring', 'Team', 'Board', 'Partners'] },
    ],
  },
  {
    value: 'other',
    followTitle: 'A little more',
    title: 'Something else',
    hint: 'Tell us in your own words',
    orgLabel: 'Where you work or study',
    orgPlaceholder: 'Optional',
    questions: [
      { key: 'work', kind: 'textarea', label: 'What you do', placeholder: 'e.g. I run a physiotherapy practice and record patient check-ins' },
    ],
  },
]

export const NOTE_STYLES = ['short', 'detailed'] as const

/**
 * Languages offered for "languages you speak" and "write my notes in". Codes are AssemblyAI's
 * (all covered by universal-3-5-pro), so the same list feeds expected_languages.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'fr', name: 'French' },
  { code: 'it', name: 'Italian' },
  { code: 'de', name: 'German' },
] as const

export function languageName(code: string | null | undefined): string | null {
  return LANGUAGES.find((l) => l.code === code)?.name ?? null
}

export type AgentProfile = {
  /** One of ROLES[].value. Decides which follow-up questions apply. */
  role?: string
  name?: string
  org?: string
  /** "Anything else Pen should know", in their own words. Asked of everyone. */
  useFor?: string
  noteStyle?: (typeof NOTE_STYLES)[number]
  /** Names, places and terms to spell right. One per line or comma-separated. */
  vocabulary?: string
  /** Languages they speak on recordings (LANGUAGES codes). A hint for the transcriber. */
  languages?: string[]
  /** Language the notes are written in. Unset means the language of the recording. */
  notesLanguage?: string
  /** Answers to the role's own questions, keyed by Question.key. */
  answers?: Record<string, string | string[]>
}

export function roleOf(value: string | undefined): Role | undefined {
  return ROLES.find((r) => r.value === value)
}
