"use client"

import { useEffect, useRef } from "react"

/**
 * Screen Wake Lock hook.
 * Safely requests and maintains a screen wake lock on supported mobile and desktop browsers.
 * Automatically re-acquires the wake lock when returning from background/tab-switch.
 * Fails silently if unsupported or rejected by browser permissions/battery saver.
 */
export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)
  const isRequestingRef = useRef(false)

  useEffect(() => {
    let disposed = false

    const isSupported =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      "wakeLock" in navigator &&
      typeof navigator.wakeLock?.request === "function"

    if (!isSupported) return

    const requestLock = async () => {
      if (disposed || isRequestingRef.current || document.visibilityState !== "visible") {
        return
      }

      // If already active and not released, no need to request again
      if (sentinelRef.current && !sentinelRef.current.released) {
        return
      }

      isRequestingRef.current = true
      try {
        const sentinel = await navigator.wakeLock.request("screen")
        if (disposed) {
          void sentinel.release().catch(() => {})
          return
        }

        sentinelRef.current = sentinel

        sentinel.addEventListener(
          "release",
          () => {
            if (sentinelRef.current === sentinel) {
              sentinelRef.current = null
            }
          },
          { once: true },
        )
      } catch {
        // Fail silently on permission denial, battery saver mode, or unsupported context
        sentinelRef.current = null
      } finally {
        isRequestingRef.current = false
      }
    }

    const releaseLock = async () => {
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release()
        } catch {
          // Fail silently
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestLock()
      } else {
        // Browser automatically releases wake lock when visibility becomes hidden,
        // but ensure our reference is cleaned up
        sentinelRef.current = null
      }
    }

    // Initial acquisition when mounted
    void requestLock()

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      disposed = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      void releaseLock()
    }
  }, [])
}
