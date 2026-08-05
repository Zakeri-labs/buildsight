/**
 * Restrict post-auth navigation to an application-local path.
 * This preserves invitation routes without allowing an open redirect.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback
  }

  try {
    const parsed = new URL(value, "https://buildsight.local")
    if (parsed.origin !== "https://buildsight.local") return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function isInvitationPath(value: string): boolean {
  return /^\/invite\/[A-Za-z0-9_-]+$/.test(value)
}
