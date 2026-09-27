// The privacy policy and the terms, in the Pen landing's look.
//
// Language, like the landing: ?lang= wins, then the remembered choice (juno_lang cookie), then
// the visitor's country. On the root domain proxy.ts serves these at /privacy and /terms; on
// any other host (localhost, previews) they live at /pen/privacy and /pen/terms, so links are
// built from the host rather than hard-coded.

import Image from 'next/image'
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { marketFor } from '../landing-copy'
import { LEGAL_DRAFT, LEGAL_FACTS, LEGAL_UPDATED, type LegalFact } from './config'
import { PRIVACY } from './privacy'
import { TERMS } from './terms'
import type { Block, Lang } from './types'

const UI: Record<Lang, { home: string; updated: string; privacy: string; terms: string; other: string; lang: string; draft: string; translation: string }> = {
  en: {
    home: 'Juno Pen home',
    updated: 'Last updated',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    other: 'Also read',
    lang: 'Language',
    draft: 'Draft. Not yet in force.',
    translation: '',
  },
  es: {
    home: 'Inicio de Juno Pen',
    updated: 'Última actualización',
    privacy: 'Política de privacidad',
    terms: 'Términos del servicio',
    other: 'Lee también',
    lang: 'Idioma',
    draft: 'Borrador. Aún no está vigente.',
    translation: 'Esta es una traducción de la versión en inglés. Si hay diferencias, prevalece la versión en inglés, salvo donde la ley de tu país disponga otra cosa.',
  },
  pt: {
    home: 'Início do Juno Pen',
    updated: 'Última atualização',
    privacy: 'Política de privacidade',
    terms: 'Termos de serviço',
    other: 'Leia também',
    lang: 'Idioma',
    draft: 'Rascunho. Ainda não está em vigor.',
    translation: 'Esta é uma tradução da versão em inglês. Em caso de divergência, prevalece a versão em inglês, salvo quando a lei do seu país dispuser de outra forma.',
  },
}

const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
]

const TOKEN = /(\[(?:ENTITY|ADDRESS|GOVERNING LAW|CONTACT EMAIL)\])/

/** Swaps [ENTITY] and friends for their values; an unfilled one stays visible and marked. */
function Text({ s }: { s: string }) {
  return (
    <>
      {s.split(TOKEN).map((part, i) => {
        const m = part.match(/^\[(.+)\]$/)
        if (!m || !(m[1] in LEGAL_FACTS)) return part
        const value: string = LEGAL_FACTS[m[1] as LegalFact]
        if (value === part) return <mark key={i} className="pen-legal-todo">{part}</mark>
        if (m[1] === 'CONTACT EMAIL') return <a key={i} href={`mailto:${value}`}>{value}</a>
        return value
      })}
    </>
  )
}

function BlockView({ b }: { b: Block }) {
  if (typeof b === 'string') return <p><Text s={b} /></p>
  return (
    <ul>
      {b.list.map((li, i) => <li key={i}><Text s={li} /></li>)}
    </ul>
  )
}

export async function resolveLegalLang(sp: Record<string, string | string[] | undefined>): Promise<{ lang: Lang; base: string }> {
  const [h, c] = await Promise.all([headers(), cookies()])
  const q = typeof sp.lang === 'string' ? sp.lang : null
  const lang = marketFor(h.get('x-vercel-ip-country'), q ?? c.get('juno_lang')?.value ?? null).lang
  const host = (h.get('host') || '').split(':')[0]
  const base = host === 'tryjunoapp.com' || host === 'www.tryjunoapp.com' ? '' : '/pen'
  return { lang, base }
}

export default function LegalPage({ doc, lang, base }: { doc: 'privacy' | 'terms'; lang: Lang; base: string }) {
  const d = (doc === 'privacy' ? PRIVACY : TERMS)[lang]
  const t = UI[lang]
  const other = doc === 'privacy' ? 'terms' : 'privacy'
  const q = lang === 'en' ? '' : `?lang=${lang}`
  return (
    <div className="pen-root pen-lp">
      <main className="pen-su-wrap pen-legal">
        <header className="pen-su-head">
          <Link href={base || '/'} className="pen-su-back" aria-label={t.home}>
            <Image src="/juno_mark.png" alt="Juno" width={24} height={24} className="pen-mark" />
            <span aria-hidden>&larr;</span>
          </Link>
          <div className="pen-lp-eyebrow pen-su-eyebrow">Juno Pen</div>
          <h1 className="pen-display pen-su-h1">{d.title}</h1>
          <p className="pen-legal-date pen-mono">{t.updated}: {LEGAL_UPDATED[lang]}</p>
          {LEGAL_DRAFT && <p className="pen-legal-draft" role="note">{t.draft}</p>}
          {t.translation && <p className="pen-legal-note">{t.translation}</p>}
          <p className="pen-legal-lede"><Text s={d.lede} /></p>
        </header>

        <div className="pen-legal-body">
          {d.sections.map((s, i) => (
            <section key={i} className="pen-legal-sec">
              <h2>
                <span className="pen-legal-num pen-mono">{String(i + 1).padStart(2, '0')}</span>
                {s.h}
              </h2>
              {s.body.map((b, j) => <BlockView key={j} b={b} />)}
            </section>
          ))}
        </div>

        <footer className="pen-legal-foot">
          <p>
            {t.other}: <Link href={`${base}/${other}${q}`}>{t[other]}</Link>
          </p>
          <nav className="pen-lp-langs" aria-label={t.lang}>
            {LANGS.map((l) => (
              <a key={l.code} href={`?lang=${l.code}`} className="pen-lp-lang" data-on={lang === l.code} aria-current={lang === l.code ? 'true' : undefined}>
                {l.label}
              </a>
            ))}
          </nav>
        </footer>
      </main>
    </div>
  )
}
