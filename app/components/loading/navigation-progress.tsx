"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

const REVEAL_DELAY_MS = 180
const SAFETY_TIMEOUT_MS = 12000
export const NAVIGATION_START_EVENT = "provision:navigation-start"

function isInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (anchor.target && anchor.target !== "_self") return false
  if (anchor.hasAttribute("download")) return false
  const href = anchor.getAttribute("href")
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false

  const destination = new URL(anchor.href, window.location.href)
  if (destination.origin !== window.location.origin) return false
  if (destination.pathname === window.location.pathname && destination.search === window.location.search) return false
  return true
}

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`
  const [visible, setVisible] = useState(false)
  const revealTimer = useRef<number | null>(null)
  const safetyTimer = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current)
    if (safetyTimer.current !== null) window.clearTimeout(safetyTimer.current)
    revealTimer.current = null
    safetyTimer.current = null
  }, [])

  const finish = useCallback(() => {
    clearTimers()
    setVisible(false)
  }, [clearTimers])

  const schedule = useCallback(() => {
    clearTimers()
    revealTimer.current = window.setTimeout(() => setVisible(true), REVEAL_DELAY_MS)
    safetyTimer.current = window.setTimeout(finish, SAFETY_TIMEOUT_MS)
  }, [clearTimers, finish])

  useEffect(() => {
    finish()
  }, [finish, routeKey])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest("a")
      if (!(anchor instanceof HTMLAnchorElement) || !isInternalNavigation(event, anchor)) return
      schedule()
    }
    const handlePopState = () => schedule()
    const handleProgrammaticNavigation = () => schedule()

    document.addEventListener("click", handleClick, true)
    window.addEventListener("popstate", handlePopState)
    window.addEventListener(NAVIGATION_START_EVENT, handleProgrammaticNavigation)
    return () => {
      document.removeEventListener("click", handleClick, true)
      window.removeEventListener("popstate", handlePopState)
      window.removeEventListener(NAVIGATION_START_EVENT, handleProgrammaticNavigation)
      clearTimers()
    }
  }, [clearTimers, schedule])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden bg-blue-100/80 dark:bg-blue-950/80" role="progressbar" aria-label="Loading page">
      <span className="block h-full w-2/5 rounded-e-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)] loading-progress-line" />
    </div>
  )
}
