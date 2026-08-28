"use client"

export type DiagnosticEvent = {
  num: string
  time: string
  name: string
  details: Record<string, unknown>
}

const STORAGE_PREFIX = "buildsight-debug-report-pipeline:"
export const DEBUG_TIMELINE_EVENT = "buildsight:debug-timeline-updated"
const MAX_EVENTS = 350

let clientSessionId = ""

function getClientSessionId(): string {
  if (!clientSessionId) {
    clientSessionId = "dbg_" + Math.random().toString(36).slice(2, 10)
  }
  return clientSessionId
}

function shortenUuid(uuid: unknown): string {
  if (typeof uuid !== "string" || !uuid) return "null"
  return uuid.length > 8 ? `${uuid.slice(0, 8)}...` : uuid
}

export function logDiagnosticEvent(
  responseId: string | null | undefined,
  name: string,
  details: Record<string, unknown> = {},
) {
  if (typeof window === "undefined" || !responseId) return

  try {
    const key = `${STORAGE_PREFIX}${responseId}`
    const existingRaw = sessionStorage.getItem(key)
    const events: DiagnosticEvent[] = existingRaw ? JSON.parse(existingRaw) : []

    const numInt = events.length + 1
    const num = `#${String(numInt).padStart(3, "0")}`

    const now = new Date()
    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    const seconds = String(now.getSeconds()).padStart(2, "0")
    const ms = String(now.getMilliseconds()).padStart(3, "0")
    const time = `${hours}:${minutes}:${seconds}.${ms}`

    // Sanitize details to avoid logging sensitive data or large objects
    const sanitizedDetails: Record<string, unknown> = {
      sessionId: getClientSessionId(),
    }

    for (const [k, v] of Object.entries(details)) {
      if (
        k.toLowerCase().includes("key") ||
        k.toLowerCase().includes("token") ||
        k.toLowerCase().includes("secret") ||
        k.toLowerCase().includes("auth") ||
        k.toLowerCase().includes("cookie") ||
        k === "translatedContent" ||
        k === "originalContent" ||
        k === "blob"
      ) {
        if (typeof v === "string") {
          sanitizedDetails[k] = v ? "present" : "missing"
        } else {
          sanitizedDetails[k] = Boolean(v)
        }
        continue
      }

      if (k.toLowerCase().includes("id") && typeof v === "string") {
        sanitizedDetails[k] = shortenUuid(v)
      } else {
        sanitizedDetails[k] = v
      }
    }

    const eventObj: DiagnosticEvent = {
      num,
      time,
      name,
      details: sanitizedDetails,
    }

    events.push(eventObj)
    if (events.length > MAX_EVENTS) {
      events.shift()
    }

    sessionStorage.setItem(key, JSON.stringify(events))
    window.dispatchEvent(new CustomEvent(DEBUG_TIMELINE_EVENT, { detail: { responseId } }))
  } catch (err) {
    console.warn("[debug-timeline] failed to log event", err)
  }
}

export function readDiagnosticEvents(responseId: string | null | undefined): DiagnosticEvent[] {
  if (typeof window === "undefined" || !responseId) return []
  try {
    const key = `${STORAGE_PREFIX}${responseId}`
    const existingRaw = sessionStorage.getItem(key)
    return existingRaw ? JSON.parse(existingRaw) : []
  } catch {
    return []
  }
}

export function clearDiagnosticEvents(responseId: string | null | undefined) {
  if (typeof window === "undefined" || !responseId) return
  try {
    const key = `${STORAGE_PREFIX}${responseId}`
    sessionStorage.removeItem(key)
    window.dispatchEvent(new CustomEvent(DEBUG_TIMELINE_EVENT, { detail: { responseId } }))
  } catch {
    // Ignore clear errors
  }
}

export function formatDiagnosticLogAsText(responseId: string | null | undefined): string {
  const events = readDiagnosticEvents(responseId)
  if (!events.length) return "No diagnostic events recorded."

  return events
    .map((e) => {
      const detailStr = Object.entries(e.details)
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join(" ")
      return `${e.num} ${e.time} ${e.name} ${detailStr}`
    })
    .join("\n")
}

export function logServerEventsIfPresent(
  responseId: string | null | undefined,
  payload: Record<string, unknown> | null | undefined,
) {
  if (typeof window === "undefined" || !responseId || !payload) return
  const debug = payload.debug as Record<string, unknown> | undefined
  if (!debug) return

  if (Array.isArray(debug.serverEvents)) {
    for (const item of debug.serverEvents) {
      if (item && typeof item === "object" && typeof item.name === "string") {
        logDiagnosticEvent(responseId, item.name, (item.details as Record<string, unknown>) || {})
      }
    }
  }
}
