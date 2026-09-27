'use client'

// Hands the app's language to every client component under it. Provided by PenApp for the
// main screen and by the settings layout for Settings, both from app-lang.ts on the server.

import { createContext, useContext, useEffect } from 'react'
import { setClientLang, LOCALE, type Lang, type Copy } from '@/lib/pen/i18n'

const LangCtx = createContext<Lang>('en')

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  // Set during render, not in an effect: the fetch helpers read it and the first failed
  // request can happen before any effect has run.
  setClientLang(lang)
  useEffect(() => {
    document.documentElement.lang = LOCALE[lang]
  }, [lang])
  return <LangCtx.Provider value={lang}>{children}</LangCtx.Provider>
}

export function useLang(): Lang {
  return useContext(LangCtx)
}

/** This component's strings in the current language. */
export function useCopy<T>(copy: Copy<T>): T {
  return copy[useContext(LangCtx)]
}
