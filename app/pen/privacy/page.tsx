import type { Metadata } from 'next'
import LegalPage, { resolveLegalLang } from '../legal/LegalPage'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Privacy Policy — Juno Pen' }

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lang, base } = await resolveLegalLang(await searchParams)
  return <LegalPage doc="privacy" lang={lang} base={base} />
}
