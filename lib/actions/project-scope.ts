"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { ALL_PROJECTS_SCOPE_VALUE, SELECTED_PROJECT_COOKIE } from "@/lib/project-scope-constants"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/**
 * Persists the selected project (or "all") in a cookie and revalidates the
 * app so every server-rendered page re-queries data scoped to that project.
 */
export async function selectProject(projectId: string) {
  const requestedValue = typeof projectId === "string" ? projectId.trim() : ""
  const storedValue = requestedValue.toLowerCase() === "all" || !UUID_PATTERN.test(requestedValue)
    ? ALL_PROJECTS_SCOPE_VALUE
    : requestedValue

  const store = await cookies()
  store.set(SELECTED_PROJECT_COOKIE, storedValue, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  revalidatePath("/", "layout")
}
