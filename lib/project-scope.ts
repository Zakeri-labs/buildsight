import "server-only"
import { cookies } from "next/headers"

export const SELECTED_PROJECT_COOKIE = "bs_project"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidProjectId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

/**
 * Returns the currently selected project id from the cookie, or `null`
 * when "All Projects" is selected (or nothing valid has been chosen yet).
 */
export async function getSelectedProjectId(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(SELECTED_PROJECT_COOKIE)?.value?.trim()
  if (!value || value === "all" || !isValidProjectId(value)) return null
  return value
}
