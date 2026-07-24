"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n()

  return (
    <div
      className={cn("flex items-center gap-1 text-sm font-medium", className)}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "rounded px-1.5 py-0.5 transition-colors",
          locale === "en" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>
      <span className="text-border">|</span>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={cn(
          "rounded px-1.5 py-0.5 transition-colors",
          locale === "ar" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        العربية
      </button>
    </div>
  )
}
