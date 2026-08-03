import "server-only"
import { cookies } from "next/headers"

export const SELECTED_PROJECT_COOKIE = "bs_project"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ALL_PROJECT_SCOPE_VALUES = new Set(["all", "null", "undefined"])

/**
 * Returns the currently selected project UUID from the cookie, or `null`
 * when All Projects is selected, nothing has been chosen, or a stale invalid
 * scope value is present.
 */
export async function getSelectedProjectId(): Promise<string | null> {
  const store = await cookies()
  const rawValue = store.get(SELECTED_PROJECT_COOKIE)?.value
  const value = rawValue?.trim() ?? ""

  if (!value || ALL_PROJECT_SCOPE_VALUES.has(value.toLowerCase())) return null
  return UUID_PATTERN.test(value) ? value : null
}
