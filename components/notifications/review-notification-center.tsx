"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, BellRing, Check, ExternalLink } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  browserNotificationPermission,
  browserReviewNotificationsEnabled,
  enableBrowserReviewNotifications,
  REVIEW_NOTIFICATION_PREFERENCE_EVENT,
} from "@/lib/review-submissions/client"
import type { ReviewSubmissionFeed, ReviewSubmissionItem } from "@/lib/review-submissions/types"

const POLL_INTERVAL_MS = 15_000
const MAX_STORED_KEYS = 300

function statusLabel(status: ReviewSubmissionItem["status"]) {
  return status === "under_review" ? "Under Review" : "Submitted"
}

function submittedLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function notificationBody(item: ReviewSubmissionItem) {
  const subject = item.subtermName ?? item.parentTermName
  return `${subject} submitted for review in ${item.projectName}.`
}

export function ReviewNotificationCenter({
  initialFeed,
  userId,
}: {
  initialFeed: ReviewSubmissionFeed
  userId: string
}) {
  const [feed, setFeed] = useState(initialFeed)
  const [permission, setPermission] = useState<ReturnType<typeof browserNotificationPermission>>("unsupported")
  const [enabled, setEnabled] = useState(false)
  const feedRef = useRef(feed)
  const initializedRef = useRef(false)

  const seenStorageKey = useMemo(() => `buildsight:review-notifications-seen:${userId}`, [userId])

  useEffect(() => {
    feedRef.current = feed
  }, [feed])

  const readSeen = useCallback(() => {
    try {
      const value = window.localStorage.getItem(seenStorageKey)
      const parsed = value ? JSON.parse(value) : []
      return new Set<string>(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [])
    } catch {
      return new Set<string>()
    }
  }, [seenStorageKey])

  const writeSeen = useCallback((seen: Set<string>) => {
    try {
      const values = Array.from(seen).slice(-MAX_STORED_KEYS)
      window.localStorage.setItem(seenStorageKey, JSON.stringify(values))
    } catch {
      // Browser storage may be unavailable; in-app notifications still work.
    }
  }, [seenStorageKey])

  const seedCurrentItems = useCallback((items: ReviewSubmissionItem[]) => {
    const seen = readSeen()
    for (const item of items) seen.add(item.notificationKey)
    writeSeen(seen)
  }, [readSeen, writeSeen])

  const showNewBrowserNotifications = useCallback((items: ReviewSubmissionItem[]) => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !browserReviewNotificationsEnabled()) return
    const seen = readSeen()
    const newItems = items.filter((item) => !seen.has(item.notificationKey))

    for (const item of newItems) {
      seen.add(item.notificationKey)
      if (item.submittedById === userId) continue
      const notification = new Notification("New Review Submission", {
        body: notificationBody(item),
        tag: item.notificationKey,
      })
      notification.onclick = () => {
        window.focus()
        window.location.assign(item.href)
        notification.close()
      }
    }
    writeSeen(seen)
  }, [readSeen, userId, writeSeen])

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/review-notifications", { cache: "no-store" })
      if (!response.ok) return
      const nextFeed = (await response.json()) as ReviewSubmissionFeed
      setFeed(nextFeed)
      feedRef.current = nextFeed
      showNewBrowserNotifications(nextFeed.items)
    } catch {
      // Preserve the last reliable in-app state when polling fails.
    }
  }, [showNewBrowserNotifications])

  useEffect(() => {
    setFeed(initialFeed)
    feedRef.current = initialFeed
  }, [initialFeed])

  useEffect(() => {
    const syncPreference = () => {
      const nextPermission = browserNotificationPermission()
      const nextEnabled = nextPermission === "granted" && browserReviewNotificationsEnabled()
      setPermission(nextPermission)
      setEnabled(nextEnabled)
      if (nextEnabled && !initializedRef.current) {
        seedCurrentItems(feedRef.current.items)
        initializedRef.current = true
      }
    }

    syncPreference()
    window.addEventListener(REVIEW_NOTIFICATION_PREFERENCE_EVENT, syncPreference)
    return () => window.removeEventListener(REVIEW_NOTIFICATION_PREFERENCE_EVENT, syncPreference)
  }, [seedCurrentItems])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  async function enableNotifications() {
    const result = await enableBrowserReviewNotifications()
    const nextPermission = browserNotificationPermission()
    setPermission(nextPermission)
    if (result === "granted") {
      setEnabled(true)
      seedCurrentItems(feedRef.current.items)
      initializedRef.current = true
    }
  }

  const pendingCount = feed.items.length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Notifications${pendingCount ? `, ${pendingCount} pending review submissions` : ""}`}
            className="relative flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Bell className="size-5" />
            {pendingCount > 0 ? (
              <span className="absolute top-1 inset-inline-end-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            ) : null}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-1.5">
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div>
            <p className="text-sm font-semibold">Review notifications</p>
            <p className="text-xs text-muted-foreground">{pendingCount} pending submission{pendingCount === 1 ? "" : "s"}</p>
          </div>
          {feed.canReview && permission !== "unsupported" ? (
            enabled ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="size-3.5" /> Enabled
              </span>
            ) : permission === "denied" ? (
              <span className="text-xs text-muted-foreground">Blocked in browser</span>
            ) : (
              <button
                type="button"
                onClick={() => void enableNotifications()}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                <BellRing className="size-3.5" /> Enable Notifications
              </button>
            )
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {feed.items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No pending review submissions.</div>
        ) : (
          feed.items.slice(0, 10).map((item) => (
            <DropdownMenuItem
              key={item.notificationKey}
              render={<Link href={item.href} />}
              className="block cursor-pointer px-2.5 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Review Submission</p>
                  <p className="mt-0.5 truncate text-xs font-medium">{item.subtermName ?? item.parentTermName}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.projectName} · {item.stageName}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.submittedBy} · {submittedLabel(item.submittedAt)} · {statusLabel(item.status)}
                  </p>
                </div>
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
