"use client"

import { useWakeLock } from "@/lib/wake-lock/use-wake-lock"

/**
 * Headless client component that keeps mobile/desktop screens awake
 * while users are navigating inside the authenticated application.
 */
export function ScreenWakeLockManager() {
  useWakeLock()
  return null
}
