import "server-only"
import { cookies } from "next/headers"

export const SELECTED_PROJECT_COOKIE = "bs_project"

/**
 * Returns the currently selected project id from the cookie, or `null`
 * when "All Projects" is selected (or nothing has been chosen yet).
 */
export async function getSelectedProjectId(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(SELECTED_PROJECT_COOKIE)?.value
  if (!value || value === "all") return null
  return value
}
