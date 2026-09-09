"use client"

import { useState } from "react"
import { AlertTriangle, Info, Megaphone, X } from "lucide-react"
import type { SystemAnnouncement } from "@/lib/announcements/types"
import { cn } from "@/lib/utils"

export function SystemAnnouncementBanner({
  initialAnnouncement,
}: {
  initialAnnouncement?: SystemAnnouncement | null
}) {
  const [dismissed, setDismissed] = useState(false)

  if (!initialAnnouncement || !initialAnnouncement.isActive || !initialAnnouncement.message.trim() || dismissed) {
    return null
  }

  const { type, message } = initialAnnouncement

  const isMaintenance = type === "maintenance"
  const isUpdate = type === "update"

  const bannerStyles = isMaintenance
    ? "border-b border-amber-300/80 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100"
    : isUpdate
      ? "border-b border-blue-300/80 bg-blue-50 text-blue-950 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-100"
      : "border-b border-slate-200 bg-slate-100/80 text-slate-900 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"

  const iconStyles = isMaintenance
    ? "text-amber-600 dark:text-amber-400"
    : isUpdate
      ? "text-blue-600 dark:text-blue-400"
      : "text-slate-600 dark:text-slate-400"

  const badgeStyles = isMaintenance
    ? "bg-amber-200/70 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200"
    : isUpdate
      ? "bg-blue-200/70 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200"
      : "bg-slate-200/70 text-slate-800 dark:bg-slate-800 dark:text-slate-200"

  const badgeLabel = isMaintenance
    ? "Maintenance"
    : isUpdate
      ? "Update"
      : "Notice"

  return (
    <aside
      aria-label="System Announcement"
      className={cn("relative w-full transition-all", bannerStyles)}
    >
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-3 py-2.5 sm:items-center sm:px-6 md:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
          <span className={cn("mt-0.5 shrink-0 sm:mt-0", iconStyles)}>
            {isMaintenance ? (
              <AlertTriangle className="size-4 sm:size-4.5" />
            ) : isUpdate ? (
              <Info className="size-4 sm:size-4.5" />
            ) : (
              <Megaphone className="size-4 sm:size-4.5" />
            )}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <span
              className={cn(
                "inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                badgeStyles,
              )}
            >
              {badgeLabel}
            </span>
            <p className="min-w-0 flex-1 break-words text-xs font-medium leading-relaxed sm:text-sm">
              {message}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss announcement for this session"
          className={cn(
            "mt-0.5 shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring sm:mt-0",
            iconStyles,
          )}
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  )
}
