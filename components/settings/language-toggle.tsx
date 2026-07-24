"use client"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const options = [
  { value: "en" as const, label: "English", meta: "LTR" },
  { value: "ar" as const, label: "العربية", meta: "RTL" },
]

export function ToggleGroupLike() {
  const { locale, setLocale } = useI18n()

  return (
    <div className="grid max-w-md gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const active = locale === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLocale(opt.value)}
            aria-pressed={active}
            className={cn(
              "flex items-center justify-between rounded-lg border-2 px-4 py-3 text-start transition-colors",
              active
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-muted-foreground/40",
            )}
          >
            <span className="font-medium text-foreground">{opt.label}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
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
