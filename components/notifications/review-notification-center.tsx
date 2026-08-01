"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, BellRing, Check, ClipboardCheck, ExternalLink, MapPinned } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  browserNotificationPermission,
  browserReviewNotificationsEnabled,
  enableBrowserReviewNotifications,
  REVIEW_NOTIFICATION_PREFERENCE_EVENT,
} from "@/lib/review-submissions/client"
import type { AppNotificationFeed, AppNotificationItem } from "@/lib/notifications/types"

const POLL_INTERVAL_MS = 15_000
const MAX_STORED_KEYS = 500

function createdLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export function ReviewNotificationCenter({
  initialFeed,
  userId,
}: {
  initialFeed: AppNotificationFeed
  userId: string
}) {
  const router = useRouter()
  const [feed, setFeed] = useState(initialFeed)
  const [permission, setPermission] = useState<ReturnType<typeof browserNotificationPermission>>("unsupported")
  const [enabled, setEnabled] = useState(false)
  const feedRef = useRef(feed)
  const initializedRef = useRef(false)
  const seenStorageKey = useMemo(() => `buildsight:notifications-seen:${userId}`, [userId])

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

  const writeSeen = useCallback(
    (seen: Set<string>) => {
      try {
        window.localStorage.setItem(seenStorageKey, JSON.stringify(Array.from(seen).slice(-MAX_STORED_KEYS)))
      } catch {
        // In-app notifications remain available when browser storage is blocked.
      }
    },
    [seenStorageKey],
  )

  const seedCurrentItems = useCallback(
    (items: AppNotificationItem[]) => {
      const seen = readSeen()
      for (const item of items) seen.add(item.notificationKey)
      writeSeen(seen)
    },
    [readSeen, writeSeen],
  )

  const showNewBrowserNotifications = useCallback(
    (items: AppNotificationItem[]) => {
      if (!("Notification" in window) || Notification.permission !== "granted" || !browserReviewNotificationsEnabled()) return
      const seen = readSeen()
      for (const item of items.filter((candidate) => !seen.has(candidate.notificationKey))) {
        seen.add(item.notificationKey)
        if (item.actorId === userId && !item.notifyActor) continue
        const notification = new Notification(item.title, { body: item.body, tag: item.notificationKey })
        notification.onclick = () => {
          window.focus()
          window.location.assign(item.href)
          notification.close()
        }
      }
      writeSeen(seen)
    },
    [readSeen, userId, writeSeen],
  )

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/review-notifications", { cache: "no-store" })
      if (!response.ok) return
      const nextFeed = (await response.json()) as AppNotificationFeed
      const previousSignature = feedRef.current.items.map((item) => `${item.notificationKey}:${item.status}`).join("|")
      const nextSignature = nextFeed.items.map((item) => `${item.notificationKey}:${item.status}`).join("|")
      setFeed(nextFeed)
      feedRef.current = nextFeed
      showNewBrowserNotifications(nextFeed.items)
      if (previousSignature !== nextSignature) router.refresh()
    } catch {
      // Preserve the last reliable in-app state when polling fails.
    }
  }, [router, showNewBrowserNotifications])

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
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
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
            aria-label={`Notifications${pendingCount ? `, ${pendingCount} pending items` : ""}`}
            className="relative flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Bell className="size-5" />
            {pendingCount > 0 ? (
              <span className="absolute top-1 inset-inline-end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            ) : null}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-[min(25rem,calc(100vw-2rem))] p-1.5">
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{pendingCount} pending item{pendingCount === 1 ? "" : "s"}</p>
          </div>
          {feed.canNotify && permission !== "unsupported" ? (
            enabled ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="size-3.5" /> Enabled</span>
            ) : permission === "denied" ? (
              <span className="text-xs text-muted-foreground">Blocked in browser</span>
            ) : (
              <button type="button" onClick={() => void enableNotifications()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted">
                <BellRing className="size-3.5" /> Enable Notifications
              </button>
            )
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {feed.items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No pending notifications.</div>
        ) : (
          feed.items.slice(0, 12).map((item) => {
            const Icon = item.kind === "site_visit" ? MapPinned : ClipboardCheck
            return (
              <DropdownMenuItem key={item.notificationKey} render={<Link href={item.href} />} className="block cursor-pointer px-2.5 py-2.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.kind === "site_visit" ? "New Site Visit Request" : "Review Submission"}</p>
                    <p className="mt-0.5 truncate text-xs font-medium">{item.subject}</p>
                    {item.reference ? <p className="truncate font-mono text-[11px] text-muted-foreground">{item.reference}</p> : null}
                    <p className="truncate text-xs text-muted-foreground">{item.projectName} · {item.context}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.actorName} · {createdLabel(item.createdAt)} · {item.status}</p>
                  </div>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                </div>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
