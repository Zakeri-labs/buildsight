"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n()

  const base =
    "h-7 rounded-md px-3 text-sm font-semibold transition-all duration-150"
  const active = "bg-background text-foreground shadow-sm"
  const inactive = "text-muted-foreground hover:text-foreground"

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5"
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(base, locale === "en" ? active : inactive)}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        style={{ fontFamily: "var(--font-arabic), 'Noto Sans Arabic', Arial, sans-serif" }}
        className={cn(base, locale === "ar" ? active : inactive)}
      >
        ع
      </button>
    </div>
  )
}
