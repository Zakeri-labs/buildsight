"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n()

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5"
    >
      {/* English */}
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "h-7 rounded-md px-3 text-xs font-semibold tracking-wide transition-all duration-150",
          locale === "en"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>

      {/* Arabic */}
      <button
        type="button"
        onClick={() => setLocale("ar")}
        style={{ fontFamily: "var(--font-arabic), 'Noto Sans Arabic', Arial, sans-serif" }}
        className={cn(
          "h-7 rounded-md px-3 text-base leading-none transition-all duration-150",
          locale === "ar"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        ع
      </button>
    </div>
  )
}
