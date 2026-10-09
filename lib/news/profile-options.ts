// Choices on the Daily Brief profile page (app/news/profile). Client-safe: no server imports.

export type Choice = { key: string; en: string; es: string; enD: string; esD: string }

// The standard sections. Unticked ones go into prefs.layout.hidden.
export const READ_CHOICES: Choice[] = [
  { key: 'markets', en: 'Markets & breaking news', es: 'Mercados y última hora', enD: 'Wall Street, the Fed, earnings', esD: 'Wall Street, la Fed, resultados' },
  { key: 'geopolitics', en: 'Geopolitics', es: 'Geopolítica', enD: 'Wars, elections, diplomacy', esD: 'Guerras, elecciones, diplomacia' },
  { key: 'chile', en: 'Chile & Latin America', es: 'Chile y Latinoamérica', enD: 'La Tercera, DF, BioBio, Emol', esD: 'La Tercera, DF, BioBio, Emol' },
  { key: 'ai', en: 'AI & technology', es: 'IA y tecnología', enD: 'The models, the companies, the money', esD: 'Los modelos, las empresas, la plata' },
  { key: 'funding', en: 'Startups & venture capital', es: 'Startups y capital de riesgo', enD: 'Rounds, IPOs, who invested', esD: 'Rondas, IPOs, quién invirtió' },
  { key: 'longread', en: 'Long reads', es: 'Análisis', enD: 'FT, The Economist, The New Yorker', esD: 'FT, The Economist, The New Yorker' },
  { key: 'founder', en: 'Founders & launches', es: 'Fundadores y lanzamientos', enD: 'New products and how they’re built', esD: 'Productos nuevos y cómo se hacen' },
  { key: 'reddit', en: 'Reddit & Hacker News', es: 'Reddit y Hacker News', enD: 'What builders are talking about', esD: 'De qué hablan los que construyen' },
]

export const WATCH_CHOICES: Choice[] = [
  { key: 'watch_ai', en: 'AI & tech videos', es: 'Videos de IA y tecnología', enD: 'New from the best channels', esD: 'Lo nuevo de los mejores canales' },
  { key: 'watch_vc', en: 'Startup & VC videos', es: 'Videos de startups y VC', enD: 'Interviews, podcasts, talks', esD: 'Entrevistas, podcasts, charlas' },
  { key: 'watch_golf', en: 'Golf videos', es: 'Videos de golf', enD: 'Highlights and lessons', esD: 'Resúmenes y clases' },
]

export const SECTION_KEYS = [...READ_CHOICES, ...WATCH_CHOICES].map((c) => c.key)

// One tap = several market tiles. A bundle shows as on when all its tiles are on the panel.
export type Bundle = { key: string; en: string; es: string; ids: string[] }
export const MARKET_BUNDLES: Bundle[] = [
  { key: 'us_stocks', en: 'US stocks', es: 'Bolsa de EE. UU.', ids: ['dow', 'sp500', 'nasdaq'] },
  { key: 'us_bonds', en: 'US bonds', es: 'Bonos de EE. UU.', ids: ['us_2y', 'us_10y', 'us_30y'] },
  { key: 'us_econ', en: 'US economy', es: 'Economía de EE. UU.', ids: ['us_cpi', 'us_unemp', 'us_fed'] },
  { key: 'chile', en: 'Chile', es: 'Chile', ids: ['cl_cpi', 'cl_unemp', 'cl_tpm', 'cl_usd', 'cl_uf'] },
  { key: 'commodities', en: 'Gold & oil', es: 'Oro y petróleo', ids: ['gold', 'oil'] },
  { key: 'crypto', en: 'Bitcoin', es: 'Bitcoin', ids: ['btc'] },
  { key: 'europe', en: 'Europe', es: 'Europa', ids: ['ftse', 'dax', 'cac'] },
  { key: 'asia', en: 'Asia', es: 'Asia', ids: ['nikkei', 'hsi', 'shanghai'] },
]

// "What do you want to read about?" — suggestions by area. Each pick becomes the reader's own section.
export type Group = { en: string; es: string; items: { en: string; es: string }[] }
export const TOPIC_GROUPS: Group[] = [
  { en: 'Economy & business', es: 'Economía y negocios', items: [
    { en: 'US economy', es: 'Economía de Chile' }, { en: 'The Fed and interest rates', es: 'La Fed y las tasas' },
    { en: 'Stock market', es: 'Bolsa de EE. UU.' }, { en: 'Oil prices', es: 'Precio del cobre' }, { en: 'Crypto', es: 'Criptomonedas' },
  ] },
  { en: 'Politics & world', es: 'Política y mundo', items: [
    { en: 'US politics', es: 'Política chilena' }, { en: 'War in Ukraine', es: 'Guerra en Ucrania' },
    { en: 'Middle East', es: 'Medio Oriente' }, { en: 'China', es: 'Elecciones en EE. UU.' },
  ] },
  { en: 'Sports', es: 'Deportes', items: [
    { en: 'NFL', es: 'Colo-Colo' }, { en: 'Premier League', es: 'Selección chilena' },
    { en: 'Formula 1', es: 'Fórmula 1' }, { en: 'Tennis', es: 'Tenis' }, { en: 'Golf', es: 'Golf' },
  ] },
  { en: 'Technology', es: 'Tecnología', items: [
    { en: 'Artificial intelligence', es: 'Inteligencia artificial' }, { en: 'Apple', es: 'Apple' },
    { en: 'Tesla', es: 'Tesla' }, { en: 'Startups', es: 'Startups' },
  ] },
  { en: 'Health & science', es: 'Salud y ciencia', items: [
    { en: 'Health', es: 'Salud' }, { en: 'Science', es: 'Ciencia' }, { en: 'Climate', es: 'Clima y medio ambiente' },
  ] },
  { en: 'Culture & life', es: 'Cultura y vida', items: [
    { en: 'Movies and TV', es: 'Cine y series' }, { en: 'Books', es: 'Libros' }, { en: 'Food', es: 'Gastronomía' }, { en: 'Travel', es: 'Viajes' },
  ] },
]

// "What do you like to watch?" — each becomes a video shelf (we find the channels).
export const VIDEO_SUGGESTIONS = {
  en: ['Cooking', 'Soccer highlights', 'History', 'Nature documentaries', 'Personal finance', 'Golf'],
  es: ['Cocina', 'Fútbol chileno', 'Historia', 'Documentales de naturaleza', 'Finanzas personales', 'Golf'],
}

export const TOPIC_SUGGESTIONS = {
  en: ['The Fed and interest rates', 'Tesla', 'Premier League', 'US elections', 'Nvidia', 'Climate'],
  es: ['La Fed y las tasas', 'Economía de Chile', 'Fútbol chileno', 'Tesla', 'Elecciones en EE. UU.', 'Codelco y el cobre'],
}
export const TRACK_SUGGESTIONS = {
  en: ['Iran and the US', 'The AI chip race', 'Inflation'],
  es: ['Irán y EE. UU.', 'La carrera de los chips de IA', 'Inflación'],
}

// Saved in prefs.layout.profile. `first` marks the first-sign-in pass (the tour starts after it).
export type ReaderProfile = { about?: string; done?: boolean; first?: boolean; at?: string }
