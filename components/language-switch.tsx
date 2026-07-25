"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n()

  return (
    <div
      role="group"
      aria-label="Language"
      className="flex items-center gap-px rounded-xl border border-border bg-card p-1"
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
          locale === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        style={{ fontFamily: "var(--font-arabic), 'Vazirmatn', sans-serif" }}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition-colors",
          locale === "ar"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        ع
      </button>
    </div>
  )
}
