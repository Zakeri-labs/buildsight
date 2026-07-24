"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n()

  return (
    <div
      className={cn("flex items-center gap-0.5 text-xs font-medium", className)}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "rounded px-2 py-1 transition-colors leading-none",
          locale === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={cn(
          "lang-ar-label rounded px-2 py-1 transition-colors",
          locale === "ar"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        ع
      </button>
    </div>
  )
}

