"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { dictionaries, type Dictionary, type Locale } from "./dictionaries"

type I18nContextValue = {
  locale: Locale
  dir: "ltr" | "rtl"
  t: Dictionary
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

const STORAGE_KEY = "buildsight-locale"

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en")

  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) as Locale | null
    if (saved === "en" || saved === "ar") {
      setLocaleState(saved)
    }
  }, [])

  useEffect(() => {
    const dir = dictionaries[locale].dir
    document.documentElement.setAttribute("lang", locale)
    document.documentElement.setAttribute("dir", dir)
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "ar" : "en")
  }, [locale, setLocale])

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: dictionaries[locale].dir as "ltr" | "rtl",
      t: dictionaries[locale] as Dictionary,
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}
