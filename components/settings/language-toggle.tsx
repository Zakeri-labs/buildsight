"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const options = [
  { value: "en" as const, label: "English", meta: "LTR" },
  { value: "ar" as const, label: "العربية", meta: "RTL" },
]

export function ToggleGroupLike({ compactMobile = false }: { compactMobile?: boolean }) {
  const { locale, setLocale } = useI18n()

  return (
    <div
      className={cn(
        "grid max-w-md gap-3 sm:grid-cols-2",
        compactMobile && "grid-cols-1 gap-2 min-[340px]:grid-cols-2 sm:gap-3",
      )}
    >
      {options.map((opt) => {
        const active = locale === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLocale(opt.value)}
            aria-pressed={active}
            className={cn(
              "flex min-w-0 items-center justify-between rounded-lg border-2 px-4 py-3 text-start transition-colors",
              compactMobile && "gap-2 px-2.5 py-2.5 text-sm sm:px-4 sm:py-3 sm:text-base",
              active
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-muted-foreground/40",
            )}
          >
            <span className="min-w-0 font-medium text-foreground">{opt.label}</span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                compactMobile && "text-[10px] sm:text-xs",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {opt.meta}
            </span>
          </button>
        )
      })}
    </div>
  )
}
