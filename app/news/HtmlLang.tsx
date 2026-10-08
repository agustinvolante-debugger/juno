'use client'
import { useEffect } from 'react'

// The root layout says lang="en" for every surface; the reader can be in Spanish.
// Screen readers and browser translation read this attribute.
export default function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    const prev = document.documentElement.lang
    document.documentElement.lang = lang
    return () => { document.documentElement.lang = prev }
  }, [lang])
  return null
}
