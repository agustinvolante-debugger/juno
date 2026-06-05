// Geographic news explorer — static place → coordinate + locale table.
// PLACE-FIRST design: we geocode the PLACES (this table), not individual stories. Clicking a pin
// fans out category searches scoped to the place's Google News edition (hl/gl/ceid). Countries are
// geo-scoped by `gl` alone; cities only get country-level locale, so they carry an extra query
// `scope` string to pin the city (see lib/news/geo.ts).
//
// `lang` selects the localized category keyword bundle in geo.ts. Where we don't ship a full
// bundle for a country's language, lang falls back to 'en' (English keywords) and `scope` adds the
// country name so the locale + name still pin the geography — lower fidelity, flagged below.

export type PlaceKind = 'country' | 'city'
export type PlaceLang = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'ja'

export type Place = {
  id: string            // stable slug used in the API + pin keys
  name: string          // display name
  kind: PlaceKind
  lat: number
  lng: number
  hl: string            // Google News UI language, e.g. 'es-419'
  gl: string            // Google News country edition, e.g. 'CL'
  ceid: string          // '<GL>:<lang>', e.g. 'CL:es-419'
  lang: PlaceLang       // which keyword bundle to use (falls back to 'en')
  country?: string      // for cities + fallback countries: name appended to scope the query
  flag: string
}

const C = (
  id: string, name: string, lat: number, lng: number,
  hl: string, gl: string, lang: PlaceLang, flag: string, country?: string,
): Place => ({ id, name, kind: 'country', lat, lng, hl, gl, ceid: `${gl}:${hl}`, lang, flag, country: country ?? name })

const CITY = (
  id: string, name: string, lat: number, lng: number,
  hl: string, gl: string, lang: PlaceLang, flag: string, country: string,
): Place => ({ id, name, kind: 'city', lat, lng, hl, gl, ceid: `${gl}:${hl}`, lang, flag, country })

// ── Cities (locked: SF, NYC, London, Santiago) ──
const CITIES: Place[] = [
  CITY('san_francisco', 'San Francisco', 37.7749, -122.4194, 'en-US', 'US', 'en', '🌉', 'United States'),
  CITY('new_york', 'New York', 40.7128, -74.006, 'en-US', 'US', 'en', '🗽', 'United States'),
  CITY('london', 'London', 51.5074, -0.1278, 'en-GB', 'GB', 'en', '🇬🇧', 'United Kingdom'),
  CITY('santiago', 'Santiago', -33.4489, -70.6693, 'es-419', 'CL', 'es', '🇨🇱', 'Chile'),
  CITY('sao_paulo', 'São Paulo', -23.5505, -46.6333, 'pt-BR', 'BR', 'pt', '🇧🇷', 'Brazil'),
]

// ── Countries — fully localized bundles (en/es/pt/fr/de/it/ja) ──
const LOCALIZED: Place[] = [
  // English
  C('us', 'United States', 39.5, -98.35, 'en-US', 'US', 'en', '🇺🇸'),
  C('uk', 'United Kingdom', 54.0, -2.0, 'en-GB', 'GB', 'en', '🇬🇧'),
  C('canada', 'Canada', 56.1, -106.3, 'en-CA', 'CA', 'en', '🇨🇦'),
  C('australia', 'Australia', -25.3, 133.8, 'en-AU', 'AU', 'en', '🇦🇺'),
  C('ireland', 'Ireland', 53.4, -8.0, 'en-IE', 'IE', 'en', '🇮🇪'),
  C('india', 'India', 22.0, 79.0, 'en-IN', 'IN', 'en', '🇮🇳'),
  // Spanish
  C('chile', 'Chile', -35.7, -71.5, 'es-419', 'CL', 'es', '🇨🇱'),
  C('argentina', 'Argentina', -38.4, -63.6, 'es-419', 'AR', 'es', '🇦🇷'),
  C('mexico', 'Mexico', 23.6, -102.5, 'es-419', 'MX', 'es', '🇲🇽'),
  C('colombia', 'Colombia', 4.6, -74.3, 'es-419', 'CO', 'es', '🇨🇴'),
  C('spain', 'Spain', 40.0, -4.0, 'es', 'ES', 'es', '🇪🇸'),
  C('peru', 'Peru', -9.2, -75.0, 'es-419', 'PE', 'es', '🇵🇪'),
  // Portuguese
  C('brazil', 'Brazil', -14.2, -51.9, 'pt-BR', 'BR', 'pt', '🇧🇷'),
  C('portugal', 'Portugal', 39.4, -8.2, 'pt-PT', 'PT', 'pt', '🇵🇹'),
  // French
  C('france', 'France', 46.6, 2.2, 'fr', 'FR', 'fr', '🇫🇷'),
  C('belgium', 'Belgium', 50.5, 4.5, 'fr', 'BE', 'fr', '🇧🇪'),
  // German
  C('germany', 'Germany', 51.2, 10.5, 'de', 'DE', 'de', '🇩🇪'),
  C('austria', 'Austria', 47.5, 14.6, 'de', 'AT', 'de', '🇦🇹'),
  C('switzerland', 'Switzerland', 46.8, 8.2, 'de', 'CH', 'de', '🇨🇭'),
  // Italian
  C('italy', 'Italy', 41.9, 12.6, 'it', 'IT', 'it', '🇮🇹'),
  // Japanese
  C('japan', 'Japan', 36.2, 138.3, 'ja', 'JP', 'ja', '🇯🇵'),
]

// ── Countries — English-fallback (local gl/ceid + country name in the query; lower fidelity) ──
const FALLBACK: Place[] = [
  C('netherlands', 'Netherlands', 52.1, 5.3, 'en-US', 'NL', 'en', '🇳🇱'),
  C('sweden', 'Sweden', 60.1, 18.6, 'en-US', 'SE', 'en', '🇸🇪'),
  C('norway', 'Norway', 60.5, 8.5, 'en-US', 'NO', 'en', '🇳🇴'),
  C('denmark', 'Denmark', 56.3, 9.5, 'en-US', 'DK', 'en', '🇩🇰'),
  C('poland', 'Poland', 51.9, 19.1, 'en-US', 'PL', 'en', '🇵🇱'),
  C('turkey', 'Turkey', 39.0, 35.2, 'en-US', 'TR', 'en', '🇹🇷'),
  C('uae', 'United Arab Emirates', 23.4, 53.8, 'en-US', 'AE', 'en', '🇦🇪'),
  C('saudi_arabia', 'Saudi Arabia', 23.9, 45.1, 'en-US', 'SA', 'en', '🇸🇦'),
  C('israel', 'Israel', 31.0, 34.8, 'en-US', 'IL', 'en', '🇮🇱'),
  C('south_korea', 'South Korea', 35.9, 127.8, 'en-US', 'KR', 'en', '🇰🇷'),
  C('china', 'China', 35.9, 104.2, 'en-US', 'CN', 'en', '🇨🇳'),
  C('singapore', 'Singapore', 1.35, 103.8, 'en-US', 'SG', 'en', '🇸🇬'),
  C('indonesia', 'Indonesia', -0.8, 113.9, 'en-US', 'ID', 'en', '🇮🇩'),
  C('nigeria', 'Nigeria', 9.1, 8.7, 'en-US', 'NG', 'en', '🇳🇬'),
  C('south_africa', 'South Africa', -30.6, 22.9, 'en-US', 'ZA', 'en', '🇿🇦'),
  C('kenya', 'Kenya', -0.0, 37.9, 'en-US', 'KE', 'en', '🇰🇪'),
  C('egypt', 'Egypt', 26.8, 30.8, 'en-US', 'EG', 'en', '🇪🇬'),
  C('new_zealand', 'New Zealand', -40.9, 174.9, 'en-NZ', 'NZ', 'en', '🇳🇿'),
]

export const PLACES: Place[] = [...CITIES, ...LOCALIZED, ...FALLBACK]

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((p) => [p.id, p]))
