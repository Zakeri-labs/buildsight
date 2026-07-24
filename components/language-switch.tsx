"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n()

  return (
    <div
      className="flex items-center rounded-lg border border-border bg-muted p-0.5"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "flex h-7 w-9 items-center justify-center rounded-md text-xs font-semibold transition-all duration-200",
          locale === "en"
            ? "bg-white text-foreground shadow-sm dark:bg-card"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={cn(
          "font-arabic flex h-7 w-9 items-center justify-center rounded-md text-sm font-semibold transition-all duration-200",
          locale === "ar"
            ? "bg-white text-foreground shadow-sm dark:bg-card"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        ع
      </button>
    </div>
  )
}


