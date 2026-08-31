export type DiagnosticEvent = {
  num: string
  time: string
  name: string
  details: Record<string, unknown>
}

const STORAGE_PREFIX = "buildsight-debug-report-pipeline:"
export const DEBUG_TIMELINE_EVENT = "buildsight:debug-timeline-updated"
const MAX_EVENTS = 500

let clientSessionId = ""

function getClientSessionId(): string {
  if (!clientSessionId) {
    clientSessionId = "dbg_" + Math.random().toString(36).slice(2, 10)
  }
  return clientSessionId
}

export function logServerDiagnosticEvent(name: string, details: Record<string, unknown> = {}) {
  try {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, "0")
    const minutes = String(now.getMinutes()).padStart(2, "0")
    const seconds = String(now.getSeconds()).padStart(2, "0")
    const ms = String(now.getMilliseconds()).padStart(3, "0")
    const time = `${hours}:${minutes}:${seconds}.${ms}`

    const sanitizedDetails: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(details)) {
      if (
        k.toLowerCase().includes("key") ||
        k.toLowerCase().includes("token") ||
        k.toLowerCase().includes("secret") ||
        k.toLowerCase().includes("auth") ||
        k.toLowerCase().includes("cookie") ||
        k.toLowerCase().includes("prompt")
      ) {
        sanitizedDetails[k] = Boolean(v)
      } else {
        sanitizedDetails[k] = v
      }
    }
    console.log(`[stage-translation-server-diag] ${time} ${name}`, JSON.stringify(sanitizedDetails))
  } catch {
    // Fail silently
  }
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
    const events = readDiagnosticEvents(responseId)

    let numInt = events.length + 1
    if (events.length > 0) {
      const lastNumStr = events[events.length - 1]?.num
      const match = /^#(\d+)$/.exec(lastNumStr || "")
      if (match) {
        numInt = parseInt(match[1], 10) + 1
      }
    }
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

    try {
      localStorage.setItem(key, JSON.stringify(events))
    } catch (storageErr) {
      console.warn("[debug-timeline] failed to save to localStorage", storageErr)
    }

    window.dispatchEvent(new CustomEvent(DEBUG_TIMELINE_EVENT, { detail: { responseId } }))
  } catch (err) {
    // Fail silently: diagnostics must never affect application behavior
    console.warn("[debug-timeline] failed to log event safely", err)
  }
}

export function readDiagnosticEvents(responseId: string | null | undefined): DiagnosticEvent[] {
  if (typeof window === "undefined" || !responseId) return []
  const key = `${STORAGE_PREFIX}${responseId}`

  // 1. Primary: read from localStorage
  try {
    const localRaw = localStorage.getItem(key)
    if (localRaw) {
      const parsed = JSON.parse(localRaw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // If localStorage read or parse fails, fall through to legacy migration check
  }

  // 2. Legacy fallback & migration from sessionStorage if localStorage has no data
  try {
    const sessionRaw = sessionStorage.getItem(key)
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        try {
          localStorage.setItem(key, JSON.stringify(parsed))
          sessionStorage.removeItem(key)
        } catch {
          // Ignore write/remove error, still return legacy events
        }
        return parsed
      }
    }
  } catch {
    // Ignore legacy read errors
  }

  return []
}

export function clearDiagnosticEvents(responseId: string | null | undefined) {
  if (typeof window === "undefined" || !responseId) return
  try {
    const key = `${STORAGE_PREFIX}${responseId}`
    try {
      localStorage.removeItem(key)
    } catch {}
    try {
      sessionStorage.removeItem(key)
    } catch {}
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
